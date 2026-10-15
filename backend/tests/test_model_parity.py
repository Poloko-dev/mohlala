"""The checks of `predict_poi.py --check`: the served model reproduces the notebook's features and predictions.

Slow (about a minute); run with `pytest -m slow`.
"""
import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import f1_score

from app.ml.features import engineer
from app.ml.predictor import MODES, N_FOLDS

pytestmark = pytest.mark.slow


@pytest.fixture(scope="module")
def live(predictor):
    """Live predictions for every held-out fold, as the notebook scored them."""
    p = predictor
    out = {m: np.full((p.n, p.C), np.nan) for m in MODES}
    rng = np.random.default_rng(0)
    for f in range(N_FOLDS):
        te = np.flatnonzero(p.labelled & (p.fold == f))
        out["known"][te] = p._score(p.X0, p.EI, p.XY, te, "known", [f])[f]
        for grp in np.array_split(rng.permutation(te), 10):      # site mode: test nodes masked in 10 groups
            out["site"][grp] = p._score(p.X0, p.EI, p.XY, grp, "site", [f])[f]
    return out


def test_features_rebuilt_from_raw_columns(predictor):
    X, _ = engineer(predictor.base, predictor.feats)
    assert np.abs(X - predictor.X0).max() < 5e-6


@pytest.mark.parametrize("mode", MODES)
def test_live_predictions_match_notebook(predictor, live, mode):
    lab = np.flatnonzero(predictor.labelled)
    stored, lv = predictor.stored[mode].to_numpy()[lab], live[mode][lab]
    f1 = lambda p: f1_score(predictor.y[lab], p.argmax(1), average="macro")
    # The notebook adds label reuse and masks 10% of the other held-out nodes at once; both are small
    assert (stored.argmax(1) == lv.argmax(1)).mean() > 0.9
    assert abs(f1(lv) - f1(stored)) < 0.02


def test_reinserted_poi_gets_its_own_features(predictor, live):
    rng = np.random.default_rng(1)
    for i in rng.choice(np.flatnonzero(predictor.labelled), 3, replace=False):
        r = predictor.base.loc[i]
        res = predictor.without(int(i)).predict_new(r["lat"], r["lon"], r["has_name"], r["has_address"],
                                                     r["has_hours"], np.expm1(r["log_footprint_m2"]), r["is_point"],
                                                     r["osm_id_rank"], r["adm2_pcode"], folds=[int(r["fold"])])
        assert np.abs(res["x"] - predictor.X0[i]).max() < 0.05   # 0.1 m coordinate rounding at 1-2 m spacing
        assert np.abs(res["probs"]["known"] - live["known"][i]).max() < 1e-2


def test_site_mode_on_removed_pois_matches_notebook(predictor):
    rng = np.random.default_rng(2)
    rows = []
    for i in rng.choice(np.flatnonzero(predictor.labelled), 30, replace=False):
        r = predictor.base.loc[i]
        p = predictor.without(int(i)).predict_site(r["lat"], r["lon"], r["adm2_pcode"], folds=[int(r["fold"])])
        st = predictor.stored["site"].loc[i].to_numpy()
        rows.append({"same": p["probs"]["site"].argmax() == st.argmax()})
    assert pd.DataFrame(rows)["same"].mean() >= 0.7
