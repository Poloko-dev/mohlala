from pydantic import Field

from app.schemas.common import Latitude, Longitude, Mode, Pcode, Schema
from app.schemas.gaps import GapRow
from app.schemas.pois import PoiPoint, PoiSummary


class SiteRequest(Schema):
    lat: Latitude
    lon: Longitude
    adm2_pcode: Pcode = None


class NewPoiRequest(Schema):
    """A POI described as it would be mapped in OpenStreetMap."""

    lat: Latitude
    lon: Longitude
    has_name: bool = False
    has_address: bool = False
    has_hours: bool = Field(False, description="Opening hours are mapped")
    footprint_m2: float = Field(0.0, ge=0, le=1_000_000, description="Building outline area; 0 = mapped as a point")
    also_point: bool = Field(False, description="Mapped as a point as well as an outline")
    osm_id_rank: float | None = Field(None, ge=0, le=1,
                                      description="0-1 mapping-date rank; default: that of its surroundings")
    adm2_pcode: Pcode = None


class CategoryScore(Schema):
    category: str
    probability: float
    test_f1: float | None = Field(description="Out-of-fold F1 of this category in this mode")
    test_top3: float | None = Field(description="Share of this category's POIs with it among the 3 most likely")


class ModePrediction(Schema):
    mode: Mode
    scores: list[CategoryScore] = Field(description="Every category, most likely first")


class Neighbour(PoiPoint):
    distance_m: float


class LocationContext(Schema):
    district: str
    sub_district: str
    adm2_pcode: str
    nearest_town: str
    dist_town_km: float
    pois_500m: int
    pois_2km: int
    urban: bool
    neighbours: list[Neighbour] = Field(description="The 8 nearest mapped POIs, the node's neighbours in the graph")


class Prediction(Schema):
    title: str
    lat: float
    lon: float
    predictions: list[ModePrediction]
    true_category: str | None = Field(None, description="The mapped category, for an existing labelled POI")
    note: str
    context: LocationContext
    market_signals: list[GapRow] = Field(description="Flagged gaps and clusters of the sub-district")
    poi: PoiSummary | None = Field(None, description="The existing POI, when one was looked up")
