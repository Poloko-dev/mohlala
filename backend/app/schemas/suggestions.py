from pydantic import Field

from app.schemas.common import JobState, Latitude, Longitude, Schema


class SuggestRequest(Schema):
    category: str = Field(examples=["Retail"])
    lat: Latitude
    lon: Longitude
    radius_km: float = Field(2.0, gt=0, le=10)
    step_m: float | None = Field(None, ge=50, le=5000,
                                 description="Grid spacing; default: about 49 points in the circle")


class SuggestedSite(Schema):
    lat: float
    lon: float
    probability: float = Field(description="Site-mode probability of the requested category")
    class_rank: int = Field(description="Rank of the requested category among all categories at this site")
    most_likely: str
    category_within_1km: int = Field(description="POIs of the requested category already mapped within 1 km")
    pois_within_1km: int
    town: str
    town_km: float
    adm2_pcode: str


class SuggestResult(Schema):
    category: str
    lat: float
    lon: float
    radius_km: float
    step_m: float
    sites: list[SuggestedSite] = Field(description="Every scored candidate site, best first")
    category_test_f1: float | None
    category_test_top3: float | None


class SuggestJob(JobState):
    result: SuggestResult | None = None
