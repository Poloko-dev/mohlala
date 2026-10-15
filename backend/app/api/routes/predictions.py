from fastapi import APIRouter

from app.api.deps import PredictorDep
from app.schemas.predictions import NewPoiRequest, Prediction, SiteRequest
from app.services import presenters

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.post("/site", summary="What a candidate location suits (site mode: location and neighbourhood only)")
def predict_site(pred: PredictorDep, body: SiteRequest) -> Prediction:
    return presenters.prediction(pred, pred.predict_site(body.lat, body.lon, body.adm2_pcode))


@router.post("/new-poi", summary="A POI described as it would be mapped (known mode)")
def predict_new_poi(pred: PredictorDep, body: NewPoiRequest) -> Prediction:
    is_point = 1 if (body.also_point or body.footprint_m2 <= 0) else 0
    res = pred.predict_new(body.lat, body.lon, body.has_name, body.has_address, body.has_hours, body.footprint_m2,
                           is_point, body.osm_id_rank, body.adm2_pcode)
    return presenters.prediction(pred, res)
