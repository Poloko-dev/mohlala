from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import PredictorDep
from app.schemas.gaps import GapRow
from app.schemas.pois import Area
from app.services import catalog, presenters

router = APIRouter(tags=["areas and market gaps"])


@router.get("/areas", summary="Sub-districts with their district and the mean position of their POIs")
def list_areas(pred: PredictorDep) -> list[Area]:
    return catalog.areas(pred)


@router.get("/market-gaps", summary="Expected against observed POIs per sub-district and category (RO3)")
def market_gaps(
    pred: PredictorDep,
    area: Annotated[str | None, Query(max_length=100, description="Part of a sub-district or district name, "
                                                                  "or a code such as LSA12")] = None,
    adm2_pcode: Annotated[str | None, Query(max_length=10)] = None,
    flagged_only: Annotated[bool, Query(description="Only the rows flagged as a gap or a cluster")] = True,
) -> list[GapRow]:
    return presenters.gap_rows(pred.gap_rows(area, adm2_pcode, only_flagged=flagged_only))
