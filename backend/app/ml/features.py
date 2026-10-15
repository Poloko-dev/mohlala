"""Node features: the code of poi_feature_engineering.ipynb, applied to the existing nodes plus a new one.

Identical to predict_poi.py, which --check verifies against poi_engineered.csv (see tests/test_model_parity.py).
"""
import numpy as np
import pandas as pd
from pyproj import Transformer
from scipy import sparse
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

K, KMAX = 8, 32                              # k-NN graph of the model; neighbourhood size of the ctx_ features
TOWN_MIN_POIS, TOWN_RADIUS_M = 50, 2000      # EDA town rule
BBOX = (27.0115, -30.6756, 29.4557, -28.5706)   # Lesotho (lon_min, lat_min, lon_max, lat_max)
TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32735", always_xy=True)   # UTM 35S, as in poi_eda.ipynb
TO_LL = Transformer.from_crs("EPSG:32735", "EPSG:4326", always_xy=True)

# Raw EDA column -> engineered column; True where the feature notebook applies log1p
RAW_NAMES = {
    "x_km": ("loc_x_km", False), "y_km": ("loc_y_km", False), "dist_town_km": ("loc_log_dist_town_km", True),
    "dist_maseru_km": ("loc_dist_maseru_km", False), "is_urban": ("loc_is_urban", False),
    "density_500m": ("loc_log_density_500m", True), "density_2km": ("loc_log_density_2km", True),
    "density_10km": ("loc_log_density_10km", True), "nn1_dist_m": ("loc_log_nn1_dist_m", True),
    "knn8_mean_dist_m": ("loc_log_knn8_mean_dist_m", True), "latrines_1km": ("loc_log_latrines_1km", True),
    "has_name": ("attr_has_name", False), "has_address": ("attr_has_address", False),
    "has_hours": ("attr_has_hours", False), "has_footprint": ("attr_has_footprint", False),
    "log_footprint_m2": ("attr_log_footprint_m2", False), "is_point": ("attr_is_point", False),
    "quality_score": ("attr_quality_score", False), "osm_id_rank": ("attr_osm_id_rank", False),
}


def in_lesotho(lat, lon):
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def neighbours(XY):
    """32 nearest other nodes and their distances, self excluded explicitly (as in the feature notebook)."""
    n = len(XY)
    dk, ik = cKDTree(XY).query(XY, k=KMAX + 2)
    not_self = ik != np.arange(n)[:, None]
    assert (not_self.sum(1) == KMAX + 1).all()
    return ik[not_self].reshape(n, KMAX + 1)[:, :KMAX], dk[not_self].reshape(n, KMAX + 1)[:, :KMAX]


def knn_adjacency(nbr, n):
    src, dst = np.repeat(np.arange(n), K), nbr[:, :K].ravel()
    A_dir = sparse.csr_matrix((np.ones(len(src)), (src, dst)), shape=(n, n))
    return A_dir, ((A_dir + A_dir.T) > 0).astype(float).tocsr()


def build_towns(XY, density_2km, is_urban, adm2_name, tree):
    uidx = np.flatnonzero(is_urban)
    up = cKDTree(XY[uidx]).query_pairs(TOWN_RADIUS_M, output_type="ndarray")
    _, comp = connected_components(sparse.coo_matrix((np.ones(len(up)), (up[:, 0], up[:, 1])),
                                                     shape=(len(uidx),) * 2), directed=False)
    u = pd.DataFrame({"node": uidx, "comp": comp, "density_2km": density_2km[uidx], "adm2_name": adm2_name[uidx]})
    g = u.groupby("comp")
    towns = pd.DataFrame({"name": g["adm2_name"].agg(lambda s: s.mode()[0]), "urban_nodes": g.size(),
                          "centre_node": u.loc[g["density_2km"].idxmax(), "node"].to_numpy()})
    towns = towns.sort_values("urban_nodes", ascending=False, kind="stable")
    u["town"] = u["comp"].map(pd.Series(np.arange(len(towns)), index=towns.index))
    towns = towns.reset_index(drop=True)
    TXY = XY[towns["centre_node"].to_numpy()]
    u["d_centre_m"] = np.hypot(*(XY[u["node"]] - TXY[u["town"]]).T)
    towns["p90_urban_km"] = (u.groupby("town")["d_centre_m"].quantile(0.9) / 1000).round(2)
    towns["radius_km"] = towns["p90_urban_km"].clip(lower=TOWN_RADIUS_M / 2000)
    towns["pois_5km"] = tree.query_ball_point(TXY, 5000, return_length=True) - 1
    return towns, TXY


def neighbourhood_shape(XY, nbr, k):
    off = XY[nbr[:, :k]] - XY[:, None, :]
    dist = np.hypot(off[..., 0], off[..., 1])
    mean_dist = dist.mean(1)
    c = off - off.mean(1, keepdims=True)
    lam = np.linalg.eigvalsh(np.einsum("nki,nkj->nij", c, c) / k)
    linearity = np.where(lam[:, 1] > 0, 1 - lam[:, 0] / np.where(lam[:, 1] > 0, lam[:, 1], 1), 0.0)
    offset = np.where(mean_dist > 0, np.hypot(*off.mean(1).T) / np.where(mean_dist > 0, mean_dist, 1), 0.0)
    ang = np.sort(np.arctan2(off[..., 1], off[..., 0]), axis=1)
    gaps = np.c_[np.diff(ang, axis=1), 2 * np.pi - (ang[:, -1] - ang[:, 0])]
    return linearity.clip(0, 1), offset.clip(0, 1), gaps.max(1) / (2 * np.pi)


def rwse(A, steps, cols, chunk=1024):
    """Random-walk return probabilities diag(P^t) for the nodes in `cols`, by sparse powers of P = D^-1 A.
    (The feature notebook uses an eigendecomposition; it checks the two agree to 1e-8.)"""
    n = A.shape[0]
    P = sparse.diags(1 / np.asarray(A.sum(1)).ravel()) @ A
    out = np.zeros((len(cols), len(steps)))
    for s in range(0, len(cols), chunk):
        c = cols[s:s + chunk]
        X = np.zeros((n, len(c)))
        X[c, np.arange(len(c))] = 1.0
        for t in range(1, max(steps) + 1):
            X = P @ X
            if t in steps:
                out[s:s + len(c), steps.index(t)] = X[c, np.arange(len(c))]
    return out.clip(0, 1)


def engineer(df, feature_names, rw_base=None, rw_cols=None):
    """Feature table for every row of df (raw EDA columns), with the columns in feature_names.
    rw_base / rw_cols: reuse stored random-walk encodings and recompute them only for the nodes in rw_cols."""
    n = len(df)
    XY = df[["x_km", "y_km"]].to_numpy() * 1000
    F = {}
    for c, (name, logged) in RAW_NAMES.items():
        F[name] = np.log1p(df[c].to_numpy(float)) if logged else df[c].to_numpy(float)

    tree = cKDTree(XY)
    nbr, nbr_d = neighbours(XY)
    for r in [100, 250, 1000, 5000, 20000]:
        label = f"{r}m" if r < 1000 else f"{r // 1000}km"
        F[f"loc_log_density_{label}"] = np.log1p(tree.query_ball_point(XY, r, return_length=True) - 1)
    for k in [3, 16, 32]:
        F[f"loc_log_knn{k}_dist_m"] = np.log1p(nbr_d[:, k - 1])
    for k in [K, KMAX]:
        lin, offs, gap = neighbourhood_shape(XY, nbr, k)
        F[f"loc_shape_linearity_k{k}"], F[f"loc_shape_offset_k{k}"], F[f"loc_shape_gap_k{k}"] = lin, offs, gap

    towns, TXY = build_towns(XY, df["density_2km"].to_numpy(), df["is_urban"].to_numpy().astype(bool),
                             df["adm2_name"].to_numpy(), tree)
    D_town = np.hypot(XY[:, None, 0] - TXY[None, :, 0], XY[:, None, 1] - TXY[None, :, 1])
    order = np.argsort(D_town, axis=1)
    i1, i2 = order[:, 0], order[:, 1]
    d1, d2 = D_town[np.arange(n), i1], D_town[np.arange(n), i2]
    size = towns["pois_5km"].to_numpy()
    F["loc_log_town_size"] = np.log1p(size[i1])
    F["loc_log_town_rel_dist"] = np.log1p(d1 / 1000 / towns["radius_km"].to_numpy()[i1])
    F["loc_log_dist_town2_km"] = np.log1p(d2 / 1000)
    for beta_km in [5, 25]:
        F[f"loc_log_town_access_{beta_km}km"] = np.log1p((size * np.exp(-D_town / (beta_km * 1000))).sum(1))

    a2, a1 = df["adm2_pcode"], df["adm1_pcode"]
    F["adm_log_adm2_nodes"] = np.log1p(a2.map(a2.value_counts())).to_numpy(float)
    F["adm_log_adm1_nodes"] = np.log1p(a1.map(a1.value_counts())).to_numpy(float)
    F["adm_adm2_urban_share"] = df.groupby("adm2_pcode")["is_urban"].transform("mean").to_numpy(float)
    F["adm_density_pct_in_adm2"] = df.groupby("adm2_pcode")["density_2km"].rank(pct=True).to_numpy(float)
    centre = pd.DataFrame(XY, columns=["x", "y"]).groupby(a2.to_numpy()).transform("mean").to_numpy()
    F["adm_log_dist_adm2_centre_km"] = np.log1p(np.hypot(*(XY - centre).T) / 1000)
    for name in feature_names:
        if name.startswith("adm_district_"):
            F[name] = a1.eq(name.removeprefix("adm_district_")).to_numpy(float)

    nb = nbr[:, :KMAX]
    share = lambda col: df[col].to_numpy(float)[nb].mean(1)  # noqa: E731
    F["ctx_named_share_k32"], F["ctx_footprint_share_k32"] = share("has_name"), share("has_footprint")
    F["ctx_point_share_k32"], F["ctx_address_share_k32"] = share("is_point"), share("has_address")
    F["ctx_hours_share_k32"] = share("has_hours")
    rank = df["osm_id_rank"].to_numpy(float)
    F["ctx_osm_id_rank_mean_k32"], F["ctx_osm_id_rank_std_k32"] = rank[nb].mean(1), rank[nb].std(1)
    F["ctx_osm_id_rank_vs_k32"] = rank - rank[nb].mean(1)
    fp, has_fp = df["log_footprint_m2"].to_numpy(float), df["has_footprint"].to_numpy().astype(bool)
    nb_fp, nb_has = fp[nb], has_fp[nb]
    n_fp = nb_has.sum(1)
    nb_fp_mean = np.where(n_fp > 0, (nb_fp * nb_has).sum(1) / np.maximum(n_fp, 1), 0.0)
    F["ctx_footprint_vs_k32"] = np.where(has_fp & (n_fp > 0), fp - nb_fp_mean, 0.0)

    A_dir, A = knn_adjacency(nbr, n)
    deg = np.asarray(A.sum(1)).ravel()
    tri = np.asarray((A @ A).multiply(A).sum(1)).ravel() / 2
    F["struct_knn8_in_degree"] = np.asarray(A_dir.sum(0)).ravel()
    F["struct_knn8_reciprocity"] = np.asarray(A_dir.multiply(A_dir.T).sum(1)).ravel() / K
    F["struct_knn8_clustering"] = 2 * tri / (deg * (deg - 1))
    rw_names = [c for c in feature_names if c.startswith("struct_rwse_")]
    steps = [int(c.split("_")[-1]) for c in rw_names]
    if rw_base is None:
        rw = rwse(A, steps, np.arange(n))
    else:
        rw = rw_base.copy()
        if len(rw_cols):
            rw[rw_cols] = rwse(A, steps, rw_cols)
    for j, c in enumerate(rw_names):
        F[c] = rw[:, j]

    missing = [c for c in feature_names if c not in F]
    assert not missing, f"features not rebuilt: {missing}"
    X = np.column_stack([F[c] for c in feature_names]).round(6)
    assert np.isfinite(X).all()
    info = {"A": A, "nbr": nbr, "town_names": towns["name"].to_numpy(), "nearest_town": i1, "dist_town_km": d1 / 1000}
    return X, info
