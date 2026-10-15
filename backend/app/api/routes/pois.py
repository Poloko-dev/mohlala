from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, status

from app.api.deps import PredictorDep
from app.schemas.pois import PoiPoint, PoiSummary
from app.schemas.predictions import Prediction
from app.services import catalog, presenters

router = APIRouter(prefix="/pois", tags=["existing POIs"])

NodeId = Annotated[int, Path(ge=0, description="node_id of the POI (row of processed_poi.csv)")]


def _check(pred, node_id: int) -> None:
    if node_id >= pred.n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no POI with node_id {node_id}")


@router.get("", summary="Every mapped POI, for the map")
def list_pois(pred: PredictorDep) -> list[PoiPoint]:
    return catalog.all_pois(pred)


@router.get("/search", summary="Find POIs by node_id, OSM id (node/123, way/456) or part of a name")
def search(pred: PredictorDep, q: Annotated[str, Query(min_length=1, max_length=200)],
           limit: Annotated[int, Query(ge=1, le=100)] = 20) -> list[PoiSummary]:
    return catalog.search_pois(pred, q, limit)


@router.get("/{node_id}")
def get_poi(pred: PredictorDep, node_id: NodeId) -> PoiSummary:
    _check(pred, node_id)
    return presenters.poi_summary(pred, node_id)


@router.get("/{node_id}/prediction",
            summary="The notebook's predictions for a mapped POI in both modes (out-of-fold for labelled POIs)")
def get_prediction(pred: PredictorDep, node_id: NodeId) -> Prediction:
    _check(pred, node_id)
    return presenters.prediction(pred, pred.predict_existing(node_id), poi=presenters.poi_summary(pred, node_id))
