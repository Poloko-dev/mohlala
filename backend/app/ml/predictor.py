"""Business location intelligence for Lesotho with the dual-mode GraphSAGE model of gnn_location_model.ipynb.

The prediction logic is that of predict_poi.py (the research tool), reorganised for a server: the data and the 25
models are loaded once, results are returned as plain data instead of printed, and long tasks report progress.

One model, two modes:
  site mode   the model sees only the location and its neighbourhood. This is the mode for a candidate site where no
              business stands yet. Test macro-F1 0.245 on areas the model never saw (2x chance); the true category is
              among its 3 most likely in 72% of cases.
  known mode  the model also sees how the POI itself is mapped (name, address, opening hours, building outline).
              Test macro-F1 0.356; true category in the top 3 in 83% of cases.

A location is added to the graph of the 6,083 existing POIs as one more node and its features are computed the way
poi_eda.ipynb and poi_feature_engineering.ipynb compute them. A candidate site (site mode) is a one-way node: it
receives messages from its k = 8 nearest POIs but changes nothing for the existing ones. A new POI in known mode is
fully inserted, as a newly mapped place would be. All 25 trained models (5 CV splits x 5 seeds) score it, each with
the training labels of its split visible as neighbour categories, and their temperature-scaled probabilities are
averaged.
"""
import copy
import json
import logging
import time
from collections.abc import Callable
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn.functional as Fn
from scipy import sparse
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from torch_geometric.utils import k_hop_subgraph

from app.ml.features import (
    BBOX,
    KMAX,
    TO_LL,
    TO_UTM,
    TOWN_MIN_POIS,
    K,
    build_towns,
    engineer,
    in_lesotho,
    knn_adjacency,
    neighbours,
)
from app.ml.gnn import GNN, graph_tensors, undirected_knn

logger = logging.getLogger(__name__)

N_FOLDS = 5
MODES = ("site", "known")

ProgressFn = Callable[[int, int], None]


def _yn(flag) -> str:
    return "yes" if flag else "no"


class InputError(ValueError):
    """The request cannot be scored as given (outside Lesotho, unknown code or category, empty area, ...)."""


class Predictor:
    """Loads the data and the 25 models once. model_dir holds the files of model_outputs_v2/, data_dir the three CSV
    files of the EDA and feature notebooks."""

    def __init__(self, model_dir: Path, data_dir: Path):
        t0 = time.time()
        model_dir, data_dir = Path(model_dir), Path(data_dir)
        self.base = pd.read_csv(data_dir / "processed_poi.csv", keep_default_na=False, na_values=[""])
        self.eng = pd.read_csv(data_dir / "poi_engineered.csv", keep_default_na=False, na_values=[""])
        assert self.base["node_id"].tolist() == list(range(len(self.base))) == self.eng["node_id"].tolist()
        assert self.base["osm_id"].equals(self.eng["osm_id"])
        ck = torch.load(model_dir / "gnn_dual_models.pt", weights_only=False)
        self.cfg, self.feats, self.classes = ck["cfg"], ck["features"], ck["cats"]
        self.C = len(self.classes)
        self.own_idx = np.array([self.feats.index(c) for c in ck["own_cols"]])
        cont = set(ck["continuous"])
        self.cont = np.array([c in cont for c in self.feats])
        assert [c for c in self.feats if c in cont] == ck["continuous"]
        self.scaler = {}
        for f in range(N_FOLDS):
            mu, sd = np.array(ck["scalers"][f]["mean"]), np.array(ck["scalers"][f]["sd"])
            sd[sd == 0] = 1.0
            self.scaler[f] = (mu, sd)
        self.models = {f: [] for f in range(N_FOLDS)}
        for rec in ck["models"]:                          # stored in split, then seed order (as the temperatures)
            net = GNN(len(self.feats) + 1, self.C, **self.cfg)
            net.load_state_dict(rec["state"])
            self.models[int(rec["fold"])].append(net.eval())
        self.temps = {m: {int(f): list(t) for f, t in ck["temperatures"][m].items()} for m in MODES}
        assert all(len(self.temps[m][f]) == len(self.models[f]) for m in MODES for f in range(N_FOLDS))
        self.n_models = sum(len(v) for v in self.models.values())
        self.own_cols = list(ck["own_cols"])

        # Raw inputs needed to add a node: latrine positions and the stored random-walk encodings
        raw = pd.read_csv(data_dir / "points_of_interest.csv", dtype=str, encoding="utf-8-sig",
                          keep_default_na=False, na_values=[""], usecols=["amenity", "longitude", "latitude"])
        toilets = raw[raw["amenity"].str.strip().str.lower().eq("toilets")]
        self.latrine_tree = cKDTree(np.c_[TO_UTM.transform(toilets["longitude"].astype(float).to_numpy(),
                                                           toilets["latitude"].astype(float).to_numpy())])
        self.rw_names = [c for c in self.feats if c.startswith("struct_rwse_")]
        xy0 = self.base[["x_km", "y_km"]].to_numpy() * 1000
        ei0 = undirected_knn(xy0)
        logd = torch.log1p(torch.tensor(np.hypot(*(xy0[ei0[0].numpy()] - xy0[ei0[1].numpy()]).T), dtype=torch.float32))
        self.logd = (logd.mean(), logd.std())             # GAT edge-feature scaling of the notebook
        self._set_base(self.base, self.eng[self.rw_names].to_numpy(np.float64), self.eng[self.feats].to_numpy(np.float64))

        # Stored notebook predictions for the existing POIs (out-of-fold for the labelled ones)
        oof = pd.read_csv(model_dir / "oof_predictions.csv").set_index("node_id")
        unl = pd.read_csv(model_dir / "unlabelled_predictions.csv").set_index("node_id")
        self.stored = {m: pd.concat([oof, unl])[[f"p_{m}_{c}" for c in self.classes]].sort_index() for m in MODES}
        assert self.stored["site"].index.tolist() == list(range(self.n))
        self.metrics = json.loads((model_dir / "metrics.json").read_text(encoding="utf-8"))
        pc = self.metrics["final"]["per_class"]
        self.class_metrics = {m: {r["index"]: (r["F1"], r["top-3"]) for r in pc[m]} for m in MODES}
        gaps_csv = model_dir / "market_gaps.csv"
        self.gaps = pd.read_csv(gaps_csv, keep_default_na=False) if gaps_csv.exists() else None
        logger.info("Model loaded: %d GraphSAGE models (dual-mode), %d features, %s existing POIs (%.1fs)",
                    self.n_models, len(self.feats), f"{self.n:,}", time.time() - t0)

    def _set_base(self, base, rw_base, X0):
        """The existing graph new nodes are added to: raw EDA table, engineered features, random-walk encodings."""
        self.base, self.rw_base, self.X0, self.n = base, rw_base, X0, len(base)
        self.fold = base["fold"].to_numpy()
        self.labelled = base["is_labelled"].eq(1).to_numpy()
        self.y = base["label"].to_numpy()
        self.cat = base["category"].to_numpy()
        self.visible = {f: self.labelled & (self.fold != f) & (self.fold != (f + 1) % N_FOLDS) for f in range(N_FOLDS)}
        self.XY = base[["x_km", "y_km"]].to_numpy() * 1000
        self.tree = cKDTree(self.XY)
        self.EI = undirected_knn(self.XY)
        self.A0 = knn_adjacency(neighbours(self.XY)[0], self.n)[1]
        self.__dict__.pop("_txy0", None)

    # -- model ---------------------------------------------------------------------------------------------------------
    def _scale(self, X, f, site_rows):
        Xs = X.copy()
        mu, sd = self.scaler[f]
        Xs[:, self.cont] = (Xs[:, self.cont] - mu) / sd
        Xs = np.c_[Xs, np.zeros(len(Xs))]
        if site_rows is not None and len(site_rows):
            Xs[np.ix_(site_rows, self.own_idx)] = 0.0          # own-node attributes hidden ...
            Xs[site_rows, -1] = 1.0                            # ... and flagged as hidden
        return torch.tensor(Xs, dtype=torch.float32)

    def _score(self, X, edge_index, XY, targets, mode, folds):
        """Temperature-scaled ensemble probabilities of the target nodes for each split: {fold: (len(targets), C)}.
        Only the targets' L-hop neighbourhood is run (their output depends on nothing else). In site mode the
        targets' own attributes are hidden. Neighbour categories: the split's training labels (new nodes: none)."""
        targets = torch.as_tensor(np.atleast_1d(targets))
        g_full = graph_tensors(edge_index, XY, self.cfg["dist_scale"], self.logd)
        subset, ei_sub, mapping, emask = k_hop_subgraph(targets, max(self.cfg["layers"], 1), edge_index,
                                                        relabel_nodes=True, num_nodes=len(XY))
        g = {"ei": ei_sub, "w": g_full["w"][emask], "w_gcn": g_full["w_gcn"][emask], "ea": g_full["ea"][emask]}
        sub = subset.numpy()
        old = sub[sub < self.n]
        out = {}
        with torch.no_grad():
            for f in folds:
                x = self._scale(X[sub], f, mapping.numpy() if mode == "site" else None)
                lab = torch.zeros(len(sub), self.C)
                vis = np.flatnonzero(sub < self.n)[self.visible[f][old]]
                lab[vis, self.y[sub[vis]]] = 1.0
                out[f] = np.mean([Fn.softmax(m(x, g, lab)[mapping] / t, 1).numpy()
                                  for m, t in zip(self.models[f], self.temps[mode][f])], axis=0)
        return out

    # -- existing POIs -------------------------------------------------------------------------------------------------
    def find(self, query):
        """node_id, OSM id (node/123, way/456) or part of a name."""
        q = str(query).strip()
        if q.isdigit() and int(q) < self.n:
            return [int(q)]
        hit = self.base.index[self.base["osm_id"].eq(q) |
                              self.base["osm_ids"].fillna("").str.split(";").apply(lambda s: q in s)]
        if len(hit):
            return hit.tolist()
        return self.base.index[self.base["name"].str.contains(q, case=False, na=False, regex=False)].tolist()

    def predict_existing(self, i):
        """The notebook's predictions: labelled POIs by the split that held their fold out, unlabelled by all 25."""
        if not 0 <= i < self.n:
            raise InputError(f"no POI with node_id {i}")
        r = self.base.loc[i]
        return {"probs": {m: self.stored[m].loc[i].to_numpy() for m in MODES},
                "true": r["category"] if self.labelled[i] else None, "lat": float(r["lat"]), "lon": float(r["lon"]),
                "node_id": int(i),
                "title": f"node {i} | {r['osm_id']} | {r['name'] if isinstance(r['name'], str) else '(unnamed)'} | "
                         f"tagged {r['tag_key']}={r['tag_value']}",
                "context": self._context(i, self.base, self.base["nearest_town"].iloc[i], r["dist_town_km"],
                                         self._knn(self.XY[i], exclude=i)),
                "note": (f"out-of-fold predictions (models that did not train on fold {self.fold[i]})"
                         if self.labelled[i] else "unlabelled POI: mean of all 25 models"),
                "adm2_pcode": r["adm2_pcode"]}

    def _knn(self, xy, exclude=None):
        _, idx = self.tree.query(xy, k=K + 1)
        return [int(j) for j in idx if j != exclude][:K]

    # -- new nodes -----------------------------------------------------------------------------------------------------
    def _new_row(self, lat, lon, has_name, has_address, has_hours, footprint_m2, is_point, osm_id_rank, adm2_pcode):
        lat, lon = float(lat), float(lon)
        if not in_lesotho(lat, lon):
            raise InputError(f"({lat}, {lon}) is outside Lesotho's bounding box "
                             f"(lat {BBOX[1]} to {BBOX[3]}, lon {BBOX[0]} to {BBOX[2]})")
        footprint_m2 = float(footprint_m2 or 0)
        has_fp = int(footprint_m2 > 0)
        is_point = int(not has_fp) if is_point is None else int(is_point)
        x, y = TO_UTM.transform(lon, lat)
        xy_new = np.array([round(x / 1000, 4), round(y / 1000, 4)]) * 1000
        d = np.hypot(*(self.XY - xy_new).T)                     # distance of every existing node to the new one
        b = self.base
        if adm2_pcode and not b["adm2_pcode"].eq(adm2_pcode).any():
            raise InputError(f"unknown adm2_pcode {adm2_pcode!r}")
        # District and sub-district: given, or those of the nearest existing POI (no boundary polygons here)
        src = b.index[b["adm2_pcode"].eq(adm2_pcode)][0] if adm2_pcode else int(np.argmin(d))
        nb_d = np.sort(d)
        new_rank = (osm_id_rank if osm_id_rank is not None
                    else float(b["osm_id_rank"].to_numpy()[np.argsort(d)[:KMAX]].mean()))
        new = {
            "x_km": xy_new[0] / 1000, "y_km": xy_new[1] / 1000,
            "density_500m": int((d <= 500).sum()), "density_2km": int((d <= 2000).sum()),
            "density_10km": int((d <= 10000).sum()), "nn1_dist_m": round(nb_d[0], 1),
            "knn8_mean_dist_m": round(nb_d[:K].mean(), 1),
            "latrines_1km": int(self.latrine_tree.query_ball_point(xy_new, 1000, return_length=True)),
            "has_name": int(has_name), "has_address": int(has_address), "has_hours": int(has_hours),
            "has_footprint": has_fp, "log_footprint_m2": round(float(np.log1p(footprint_m2)), 4), "is_point": is_point,
            "quality_score": np.mean([int(has_name), int(has_address), int(has_hours), has_fp]),
            "osm_id_rank": new_rank,
            **{c: b.loc[src, c] for c in ["adm1_pcode", "adm1_name", "adm2_pcode", "adm2_name"]},
        }
        new["is_urban"] = int(new["density_2km"] >= TOWN_MIN_POIS)
        return lat, lon, xy_new, d, new

    def predict_site(self, lat, lon, adm2_pcode=None, folds=None):
        """Site mode for a candidate location: a one-way node (it receives messages from the POIs around it and
        changes nothing for them) whose own mapping attributes are hidden."""
        lat, lon, xy_new, d, new = self._new_row(lat, lon, 0, 0, 0, 0.0, None, None, adm2_pcode)
        df = pd.concat([self.base, pd.DataFrame([new])], ignore_index=True)
        XY_all = np.vstack([self.XY, xy_new])
        _, TXY = build_towns(XY_all, df["density_2km"].to_numpy(), df["is_urban"].to_numpy().astype(bool),
                             df["adm2_name"].to_numpy(), cKDTree(XY_all))
        d_town = np.hypot(*(TXY - xy_new).T)
        df.loc[self.n, "dist_town_km"] = round(d_town.min() / 1000, 3)
        df.loc[self.n, "dist_maseru_km"] = round(d_town[0] / 1000, 3)
        rw_base = np.vstack([self.rw_base, np.zeros((1, len(self.rw_names)))])
        X_all, info = engineer(df, self.feats, rw_base=rw_base, rw_cols=np.array([self.n]))
        X = np.vstack([self.X0, X_all[self.n]])                  # existing nodes keep their features
        nbr = info["nbr"][:, :K]
        into = np.union1d(nbr[self.n], np.flatnonzero((nbr[:self.n] == self.n).any(1)))   # undirected k-NN partners
        ei = torch.cat([self.EI, torch.tensor(np.vstack([into, np.full(len(into), self.n)]))], dim=1)
        folds = list(range(N_FOLDS)) if folds is None else folds
        fp = {f: v[0] for f, v in self._score(X, ei, XY_all, [self.n], "site", folds).items()}
        town = info["town_names"][info["nearest_town"][self.n]]
        return {"probs": {"site": np.mean(list(fp.values()), axis=0)}, "fold_probs": fp, "true": None,
                "lat": lat, "lon": lon, "x": X[self.n], "adm2_pcode": new["adm2_pcode"],
                "title": f"Candidate site at ({lat:.5f}, {lon:.5f})",
                "context": self._context(self.n, df, town, info["dist_town_km"][self.n], nbr[self.n]),
                "note": f"site mode, mean of {sum(len(self.models[f]) for f in folds)} models",
                "town": town, "dist_town_km": float(info["dist_town_km"][self.n]), "density_2km": new["density_2km"]}

    def predict_new(self, lat, lon, has_name=0, has_address=0, has_hours=0, footprint_m2=0.0, is_point=None,
                    osm_id_rank=None, adm2_pcode=None, folds=None):
        """Known mode for a POI described as it would be mapped: fully inserted into the graph, as a newly mapped
        place would be, and every feature recomputed."""
        lat, lon, xy_new, d, new = self._new_row(lat, lon, has_name, has_address, has_hours, footprint_m2, is_point,
                                                 osm_id_rank, adm2_pcode)
        # Raw EDA columns: existing nodes keep their stored values, updated for the one extra node nearby
        df = self.base.copy()
        for r, c in [(500, "density_500m"), (2000, "density_2km"), (10000, "density_10km")]:
            df[c] = df[c] + (d <= r)
        df["is_urban"] = (df["density_2km"] >= TOWN_MIN_POIS).astype(int)
        df["nn1_dist_m"] = np.minimum(df["nn1_dist_m"], d.round(1))
        _, nb_d0 = self.tree.query(self.XY, k=K + 1)            # column 0 is the node itself (or a twin at 0 m)
        for i in np.flatnonzero(d < nb_d0[:, K]):               # the new node enters these nodes' 8 nearest
            dd = np.sort(np.r_[np.hypot(*(self.XY - self.XY[i]).T), d[i]])[1:K + 1]
            df.loc[i, "knn8_mean_dist_m"] = round(dd.mean(), 1)
        df = pd.concat([df, pd.DataFrame([new])], ignore_index=True)

        # Towns: if the extra node changes them, distances to towns are recomputed for every node
        XY_all = np.vstack([self.XY, xy_new])
        towns, TXY = build_towns(XY_all, df["density_2km"].to_numpy(), df["is_urban"].to_numpy().astype(bool),
                                 df["adm2_name"].to_numpy(), cKDTree(XY_all))
        D = np.hypot(XY_all[:, None, 0] - TXY[None, :, 0], XY_all[:, None, 1] - TXY[None, :, 1])
        towns_changed = not np.array_equal(TXY, self._base_TXY())
        rows = slice(None) if towns_changed else slice(self.n, None)
        df.loc[rows, "dist_town_km"] = (D[rows].min(1) / 1000).round(3)
        df.loc[rows, "dist_maseru_km"] = (D[rows, 0] / 1000).round(3)

        # Random-walk encodings change only near the new node: recompute them within 11 hops of any changed edge
        nbr_all, _ = neighbours(XY_all)
        A_new = knn_adjacency(nbr_all, self.n + 1)[1]
        A_old = sparse.block_diag([self.A0, sparse.csr_matrix((1, 1))]).tocsr()
        changed = np.unique(np.concatenate(sparse.triu(abs(A_new - A_old)).nonzero()))
        union = ((A_new + A_old) > 0).astype(float).tocsr()
        steps = max(int(c.split("_")[-1]) for c in self.rw_names)
        dist = dijkstra(union, directed=False, indices=changed, unweighted=True, limit=steps + 0.5)
        rw_cols = np.flatnonzero(np.isfinite(np.atleast_2d(dist)).any(0))
        rw_base = np.vstack([self.rw_base, np.zeros((1, len(self.rw_names)))])
        X, info = engineer(df, self.feats, rw_base=rw_base, rw_cols=rw_cols)

        folds = list(range(N_FOLDS)) if folds is None else folds
        fp = {f: v[0] for f, v in self._score(X, undirected_knn(XY_all), XY_all, [self.n], "known", folds).items()}
        return {"probs": {"known": np.mean(list(fp.values()), axis=0)}, "fold_probs": fp, "true": None,
                "lat": lat, "lon": lon, "x": X[self.n], "adm2_pcode": new["adm2_pcode"],
                "title": f"New POI at ({lat:.5f}, {lon:.5f}) | name {_yn(has_name)}, address {_yn(has_address)}, "
                         f"hours {_yn(has_hours)}, outline {float(footprint_m2 or 0):,.0f} m², point {_yn(new['is_point'])}",
                "context": self._context(self.n, df, info["town_names"][info["nearest_town"][self.n]],
                                         info["dist_town_km"][self.n], nbr_all[self.n, :K]),
                "note": f"known mode, mean of {sum(len(self.models[f]) for f in folds)} models"
                        + ("; adding it changed the town centres" if towns_changed else "")
                        + ("" if osm_id_rank is not None else "; mapping date set to that of its surroundings")}

    def _base_TXY(self):
        if not hasattr(self, "_txy0"):
            self._txy0 = build_towns(self.XY, self.base["density_2km"].to_numpy(),
                                     self.base["is_urban"].to_numpy().astype(bool), self.base["adm2_name"].to_numpy(),
                                     self.tree)[1]
        return self._txy0

    def _context(self, i, df, town, dist_town_km, nbr_idx):
        """Where the node lies: district, sub-district, nearest town, POI density, and its 8 nearest mapped POIs."""
        r = df.iloc[i]
        return {"district": r["adm1_name"], "sub_district": r["adm2_name"], "adm2_pcode": r["adm2_pcode"],
                "nearest_town": str(town), "dist_town_km": float(dist_town_km),
                "pois_500m": int(r["density_500m"]), "pois_2km": int(r["density_2km"]),
                "urban": bool(r["density_2km"] >= TOWN_MIN_POIS), "neighbours": [int(j) for j in nbr_idx]}

    # -- location intelligence -----------------------------------------------------------------------------------------
    def suggest_grid(self, lat, lon, radius_km=2.0, step_m=None, max_points=49, max_gap_m=1500):
        """The candidate sites of suggest(): a square grid clipped to the circle, without the points more than
        max_gap_m from any mapped POI (outside the mapped area the model has nothing to go on) or outside Lesotho.
        Returns ([(lat, lon), ...], grid spacing in m)."""
        cx, cy = TO_UTM.transform(float(lon), float(lat))
        r = float(radius_km) * 1000
        step = step_m or max(100.0, np.sqrt(np.pi * r * r / max_points))
        g = np.arange(-r, r + 1e-6, step)
        pts = np.array([(cx + dx, cy + dy) for dx in g for dy in g if dx * dx + dy * dy <= r * r])
        near, _ = self.tree.query(pts)
        pts = pts[near <= max_gap_m]
        sites = []
        for x, y in pts:
            plon, plat = TO_LL.transform(x, y)
            if in_lesotho(plat, plon):
                sites.append((float(plat), float(plon)))
        if not sites:
            raise InputError(f"no mapped POI within {max_gap_m} m of any grid point; try a larger radius")
        return sites, float(step)

    def suggest(self, category, sites, progress: ProgressFn | None = None):
        """Score candidate sites (from suggest_grid) in site mode and rank them by the probability of `category`.
        A high probability with few POIs of the category within 1 km is a candidate gap; with many, an established
        cluster."""
        c = self.class_index(category)
        rows = []
        for k, (plat, plon) in enumerate(sites):
            res = self.predict_site(plat, plon)
            p = res["probs"]["site"]
            x, y = TO_UTM.transform(plon, plat)
            within = self.tree.query_ball_point([x, y], 1000)
            rows.append({"lat": round(plat, 5), "lon": round(plon, 5), "probability": float(p[c]),
                         "class_rank": int((p > p[c]).sum()) + 1, "most_likely": self.classes[int(p.argmax())],
                         "category_within_1km": int((self.cat[within] == category).sum()),
                         "pois_within_1km": len(within), "town": str(res["town"]),
                         "town_km": round(res["dist_town_km"], 1), "adm2_pcode": res["adm2_pcode"]})
            if progress:
                progress(k + 1, len(sites))
        return sorted(rows, key=lambda r: r["probability"], reverse=True)

    def class_index(self, category):
        if category not in self.classes:
            raise InputError(f"unknown category {category!r}; choose from {self.classes}")
        return self.classes.index(category)

    def gap_rows(self, area=None, adm2_pcode=None, only_flagged=False):
        if self.gaps is None:
            raise InputError("market_gaps.csv not found: run gnn_location_model.ipynb (Section 9) first")
        g = self.gaps
        if adm2_pcode:
            g = g[g["adm2_pcode"].eq(adm2_pcode)]
        if area:
            a = str(area).lower()
            g = g[g["adm2_name"].str.lower().str.contains(a, regex=False) |
                  g["adm1_name"].str.lower().str.contains(a, regex=False) | g["adm2_pcode"].str.lower().eq(a)]
        if only_flagged:
            g = g[g["signal"].ne("")]
        return g

    # -- verification --------------------------------------------------------------------------------------------------
    def without(self, i):
        """A copy of the predictor whose existing graph lacks node i (for the reinsertion checks)."""
        sub = copy.copy(self)
        keep = np.arange(self.n) != i
        b = self.base[keep].reset_index(drop=True)
        XYk = self.XY[keep]
        d = np.hypot(*(XYk - self.XY[i]).T)
        for r, c in [(500, "density_500m"), (2000, "density_2km"), (10000, "density_10km")]:
            b[c] = b[c] - (d <= r)
        b["is_urban"] = (b["density_2km"] >= TOWN_MIN_POIS).astype(int)
        _, nb_d0 = self.tree.query(self.XY, k=K + 1)
        hit = np.flatnonzero(d <= nb_d0[keep][:, K])              # node i was among these nodes' 8 nearest
        dd, _ = cKDTree(XYk).query(XYk[hit], k=K + 1)
        b.loc[hit, "nn1_dist_m"] = dd[:, 1].round(1)
        b.loc[hit, "knn8_mean_dist_m"] = dd[:, 1:].mean(1).round(1)
        X, _ = engineer(b, self.feats)
        sub._set_base(b, X[:, [self.feats.index(c) for c in self.rw_names]], X)
        return sub
