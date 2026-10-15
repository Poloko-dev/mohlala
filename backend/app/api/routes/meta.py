from fastapi import APIRouter

from app.api.deps import PredictorDep
from app.schemas.model import ModelInfo
from app.services import catalog

router = APIRouter(tags=["model"])


@router.get("/health")
def health(pred: PredictorDep) -> dict:
    return {"status": "ok", "models": pred.n_models, "pois": pred.n}


@router.get("/model", summary="Model description and evaluation (RO1, RO2, RO4 tables of metrics.json)")
def model(pred: PredictorDep) -> ModelInfo:
    return catalog.model_info(pred)
