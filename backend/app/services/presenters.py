"""Turn the predictor's results (numpy arrays, DataFrame rows) into API schemas."""
import numpy as np
import pandas as pd

from app.ml.features import TO_UTM
from app.ml.predictor import Predictor
from app.schemas.gaps import GapRow
from app.schemas.pois import PoiPoint, PoiSummary
from app.schemas.predictions import CategoryScore, LocationContext, ModePrediction, Neighbour, Prediction


def _text(v) -> str | None:
    return v if isinstance(v, str) and v else None


def poi_point(pred: Predictor, i: int) -> PoiPoint:
    r = pred.base.loc[i]
    return PoiPoint(node_id=int(i), lat=float(r["lat"]), lon=float(r["lon"]), category=str(r["category"]),
                    name=_text(r["name"]))


def poi_summary(pred: Predictor, i: int) -> PoiSummary:
    r = pred.base.loc[i]
    return PoiSummary(**poi_point(pred, i).model_dump(), osm_id=str(r["osm_id"]),
                      tag=f"{r['tag_key']}={r['tag_value']}", district=str(r["adm1_name"]),
                      sub_district=str(r["adm2_name"]), adm2_pcode=str(r["adm2_pcode"]),
                      labelled=bool(pred.labelled[i]))


def mode_prediction(pred: Predictor, mode: str, p: np.ndarray) -> ModePrediction:
    cm = pred.class_metrics.get(mode, {})
    scores = []
    for j in np.argsort(p)[::-1]:
        f1, top3 = cm.get(pred.classes[j], (None, None))
        scores.append(CategoryScore(category=pred.classes[j], probability=float(p[j]), test_f1=f1, test_top3=top3))
    return ModePrediction(mode=mode, scores=scores)


def gap_rows(df: pd.DataFrame) -> list[GapRow]:
    return [GapRow(**{**r, "signal": r["signal"] or None, "mapping": r["mapping"] or None})
            for r in df.to_dict("records")]


def location_context(pred: Predictor, ctx: dict, lat: float, lon: float) -> LocationContext:
    xy = np.array(TO_UTM.transform(lon, lat))
    neighbours = [Neighbour(**poi_point(pred, j).model_dump(), distance_m=round(float(np.hypot(*(pred.XY[j] - xy))), 1))
                  for j in ctx["neighbours"]]
    return LocationContext(**{k: v for k, v in ctx.items() if k != "neighbours"}, neighbours=neighbours)


def prediction(pred: Predictor, res: dict, poi: PoiSummary | None = None) -> Prediction:
    signals = []
    if pred.gaps is not None and res.get("adm2_pcode"):
        signals = gap_rows(pred.gap_rows(adm2_pcode=res["adm2_pcode"], only_flagged=True))
    return Prediction(title=res["title"], lat=res["lat"], lon=res["lon"],
                      predictions=[mode_prediction(pred, m, p) for m, p in res["probs"].items()],
                      true_category=res["true"], note=res["note"],
                      context=location_context(pred, res["context"], res["lat"], res["lon"]),
                      market_signals=signals, poi=poi)
