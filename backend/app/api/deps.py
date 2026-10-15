from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.core.config import Settings, get_settings
from app.ml.predictor import Predictor
from app.schemas.common import JobProgress
from app.services.jobs import Job, JobManager


def get_predictor(request: Request) -> Predictor:
    return request.app.state.predictor


def get_jobs(request: Request) -> JobManager:
    return request.app.state.jobs


PredictorDep = Annotated[Predictor, Depends(get_predictor)]
JobsDep = Annotated[JobManager, Depends(get_jobs)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def find_job(jobs: JobManager, job_id: str, kind: str) -> Job:
    job = jobs.get(job_id, kind)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"no {kind} job {job_id!r} (jobs expire after an hour)")
    return job


def job_fields(job: Job) -> dict:
    """The JobState fields of a job; the caller adds the typed result."""
    return {"id": job.id, "status": job.status, "progress": JobProgress(done=job.done, total=job.total),
            "error": job.error, "created_at": job.created_at, "finished_at": job.finished_at}
