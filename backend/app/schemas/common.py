from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Mode = Literal["site", "known"]
Latitude = Annotated[float, Field(ge=-90, le=90, description="WGS 84 latitude; must lie inside Lesotho",
                                  examples=[-29.3151])]
Longitude = Annotated[float, Field(ge=-180, le=180, description="WGS 84 longitude; must lie inside Lesotho",
                                   examples=[27.4869])]
Pcode = Annotated[str | None, Field(description="Sub-district P-code such as LSA12; default: that of the nearest "
                                                "mapped POI", examples=["LSA12"])]


class Schema(BaseModel):
    """Base of every API model: fields with a default are still listed as required in responses, since a
    response always carries them (the frontend's generated types rely on this)."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class JobProgress(Schema):
    done: int
    total: int


class JobState(Schema):
    id: str
    status: Literal["queued", "running", "succeeded", "failed"]
    progress: JobProgress
    error: str | None = None
    created_at: datetime
    finished_at: datetime | None = None
