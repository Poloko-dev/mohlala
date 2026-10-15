from typing import Literal

from pydantic import Field

from app.schemas.common import Schema


class GapRow(Schema):
    """One row of market_gaps.csv: expected against observed POIs of a category in a sub-district."""

    adm1_name: str
    adm2_name: str
    adm2_pcode: str
    category: str
    pois: int = Field(description="Labelled POIs in the sub-district")
    observed: int = Field(description="POIs of this category mapped in the sub-district")
    expected: float = Field(description="Sum of the POIs' prior-corrected site-mode probabilities for this category")
    gap: float = Field(description="expected - observed: positive when the locations suggest more than is mapped")
    z: float = Field(description="gap divided by sqrt(sum p(1 - p))")
    signal: Literal["gap", "cluster"] | None = Field(
        description="gap: z >= 2 and gap >= 2; cluster: z <= -2 and gap <= -2 (sub-districts with >= 20 POIs only)")
    mapping: Literal["thin"] | None = Field(
        description="thin: mapping quality in the lowest quarter of sub-districts, so a gap may be missing data")
