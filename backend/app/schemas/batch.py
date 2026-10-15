from app.schemas.common import JobState, Mode, Schema


class BatchRow(Schema):
    row: int
    lat: float | None
    lon: float | None
    pred_category: str | None = None
    pred_prob: float | None = None
    top3: list[str] = []
    probabilities: dict[str, float] = {}
    error: str | None = None


class BatchResult(Schema):
    mode: Mode
    rows: list[BatchRow]
    scored: int
    failed: int


class BatchJob(JobState):
    result: BatchResult | None = None
