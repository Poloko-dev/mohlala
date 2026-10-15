"""Score every row of an uploaded CSV, as `predict_poi.py batch` does.

Site mode: columns lat, lon and optionally adm2_pcode. Known mode also reads has_name, has_address, has_hours,
footprint_m2, is_point and osm_id_rank. Column names are case-insensitive. A row that cannot be scored gets an
error instead of stopping the batch.
"""
import io
from dataclasses import dataclass

import numpy as np
import pandas as pd

from app.ml.predictor import InputError, Predictor, ProgressFn
from app.schemas.batch import BatchResult, BatchRow


@dataclass
class BatchOutcome:
    result: BatchResult
    table: pd.DataFrame        # the input columns followed by the predictions, as the CLI writes them


def read_csv(content: bytes, max_rows: int) -> pd.DataFrame:
    try:
        src = pd.read_csv(io.BytesIO(content))
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as e:
        raise InputError(f"could not read the CSV: {e}") from e
    cols = {c.lower().strip() for c in src.columns}
    if "lat" not in cols or "lon" not in cols:
        raise InputError("the CSV needs 'lat' and 'lon' columns")
    if src.empty:
        raise InputError("the CSV has no rows")
    if len(src) > max_rows:
        raise InputError(f"the CSV has {len(src):,} rows; the limit is {max_rows:,}")
    return src


def _score_row(pred: Predictor, get, known: bool) -> dict:
    lat, lon = float(get("lat", None)), float(get("lon", None))
    if known:
        is_point, rank = get("is_point", None), get("osm_id_rank", None)
        return pred.predict_new(lat, lon, int(get("has_name", 0)), int(get("has_address", 0)),
                                int(get("has_hours", 0)), float(get("footprint_m2", 0)),
                                None if is_point is None else int(is_point), None if rank is None else float(rank),
                                get("adm2_pcode", None))
    return pred.predict_site(lat, lon, get("adm2_pcode", None))


def run_batch(pred: Predictor, src: pd.DataFrame, known: bool, progress: ProgressFn) -> BatchOutcome:
    cols = {c.lower().strip(): c for c in src.columns}
    mode = "known" if known else "site"
    rows, table = [], []
    for k, (_, r) in enumerate(src.iterrows()):
        def get(c, default, r=r):
            return r[cols[c]] if c in cols and pd.notna(r[cols[c]]) else default

        try:
            lat, lon = float(get("lat", np.nan)), float(get("lon", np.nan))
        except (TypeError, ValueError):
            lat = lon = np.nan
        row = BatchRow(row=k + 1, lat=None if np.isnan(lat) else lat, lon=None if np.isnan(lon) else lon)
        out = {"mode": mode, "error": None}
        try:
            if row.lat is None or row.lon is None:
                raise InputError("lat and lon must be numbers")
            p = next(iter(_score_row(pred, get, known)["probs"].values()))
            top3 = [pred.classes[j] for j in np.argsort(-p)[:3]]
            row.pred_category, row.pred_prob, row.top3 = top3[0], round(float(p.max()), 4), top3
            row.probabilities = {c: round(float(v), 4) for c, v in zip(pred.classes, p, strict=True)}
            out |= {"pred_category": top3[0], "pred_prob": row.pred_prob, "top3": "; ".join(top3),
                    **{f"p_{c}": v for c, v in row.probabilities.items()}}
        except (ValueError, TypeError) as e:          # InputError, or a value that is not a number
            row.error = out["error"] = str(e)
        rows.append(row)
        table.append(out)
        progress(k + 1, len(src))

    failed = sum(r.error is not None for r in rows)
    result = BatchResult(mode=mode, rows=rows, scored=len(rows) - failed, failed=failed)
    columns = ["mode", "pred_category", "pred_prob", "top3", *[f"p_{c}" for c in pred.classes], "error"]
    return BatchOutcome(result=result,
                        table=pd.concat([src.reset_index(drop=True), pd.DataFrame(table, columns=columns)], axis=1))
