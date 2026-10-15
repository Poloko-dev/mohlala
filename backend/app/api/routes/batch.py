from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.api.deps import JobsDep, PredictorDep, SettingsDep, find_job, job_fields
from app.schemas.batch import BatchJob
from app.schemas.common import Mode
from app.services import batch
from app.services.jobs import Job

router = APIRouter(prefix="/batch", tags=["batch"])

MODE_HELP = "site: rows are candidate sites; known: rows describe mapped POIs (has_name, has_address, ...)"


def _view(job: Job) -> BatchJob:
    return BatchJob(**job_fields(job), result=job.result.result if job.result else None)


@router.post("", status_code=status.HTTP_202_ACCEPTED, summary="Start scoring every row of a CSV")
async def create_batch(pred: PredictorDep, jobs: JobsDep, settings: SettingsDep, response: Response,
                       file: Annotated[UploadFile, File(description="CSV with lat and lon columns")],
                       mode: Annotated[Mode, Form(description=MODE_HELP)] = "site") -> BatchJob:
    content = await file.read(settings.batch_max_bytes + 1)
    if len(content) > settings.batch_max_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE,
                            f"the file is larger than {settings.batch_max_bytes:,} bytes")
    src = await run_in_threadpool(batch.read_csv, content, settings.batch_max_rows)
    job = jobs.submit("batch", lambda progress: batch.run_batch(pred, src, mode == "known", progress), total=len(src))
    response.headers["Location"] = f"{settings.api_prefix}/batch/{job.id}"
    return _view(job)


@router.get("/{job_id}", summary="Progress and, when finished, the prediction of every row")
def get_batch(jobs: JobsDep, job_id: str) -> BatchJob:
    return _view(find_job(jobs, job_id, "batch"))


@router.get("/{job_id}/csv", summary="The input CSV with the predictions appended", response_class=Response,
            responses={200: {"content": {"text/csv": {}}}})
def download_batch(jobs: JobsDep, job_id: str) -> Response:
    job = find_job(jobs, job_id, "batch")
    if job.status != "succeeded":
        raise HTTPException(status.HTTP_409_CONFLICT, f"the job is {job.status}")
    return Response(job.result.table.to_csv(index=False), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="predictions_{job_id[:8]}.csv"'})
