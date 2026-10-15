from pydantic import Field

from app.schemas.common import Schema


class PoiPoint(Schema):
    node_id: int
    lat: float
    lon: float
    category: str = Field(description="Mapped category; 'Uncategorized' for the 131 unlabelled POIs")
    name: str | None = None


class PoiSummary(PoiPoint):
    osm_id: str
    tag: str = Field(description="The OSM tag the POI was mapped with, e.g. amenity=school")
    district: str
    sub_district: str
    adm2_pcode: str
    labelled: bool


class Area(Schema):
    """A sub-district, placed at the mean position of its mapped POIs (the data has no boundary polygons)."""

    adm2_pcode: str
    sub_district: str
    adm1_pcode: str
    district: str
    lat: float
    lon: float
    pois: int
