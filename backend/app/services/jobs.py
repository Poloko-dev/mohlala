"""In-process background jobs for the slow model tasks (suggest, batch), with progress for polling clients.

Jobs live in memory, so run the API with a single worker process (uvicorn's default). Finished jobs are dropped
after job_ttl_seconds.
"""
import logging
import threading
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from app.ml.predictor import InputError, ProgressFn

logger = logging.getLogger(__name__)

JobStatus = Literal["queued", "running", "succeeded", "failed"]


@dataclass
class Job:
    id: str
    kind: str
    status: JobStatus = "queued"
    done: int = 0
    total: int = 0
    error: str | None = None
    result: Any = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None


class JobManager:
    def __init__(self, workers: int, ttl_seconds: int):
        self._pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="model-job")
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._ttl = timedelta(seconds=ttl_seconds)

    def submit(self, kind: str, fn: Callable[[ProgressFn], Any], total: int = 0) -> Job:
        """Run fn(progress) in the background; fn reports progress(done, total) and returns the job's result."""
        self._prune()
        job = Job(id=uuid.uuid4().hex, kind=kind, total=total)
        with self._lock:
            self._jobs[job.id] = job
        self._pool.submit(self._run, job, fn)
        return job

    def get(self, job_id: str, kind: str) -> Job | None:
        with self._lock:
            job = self._jobs.get(job_id)
        return job if job is not None and job.kind == kind else None

    def shutdown(self) -> None:
        self._pool.shutdown(wait=False, cancel_futures=True)

    def _run(self, job: Job, fn: Callable[[ProgressFn], Any]) -> None:
        job.status = "running"

        def progress(done: int, total: int) -> None:
            job.done, job.total = done, total

        try:
            job.result = fn(progress)
            job.status = "succeeded"
        except InputError as e:
            job.error, job.status = str(e), "failed"
        except Exception:
            logger.exception("%s job %s failed", job.kind, job.id)
            job.error, job.status = "internal error while scoring; see the server log", "failed"
        finally:
            job.finished_at = datetime.now(UTC)

    def _prune(self) -> None:
        cutoff = datetime.now(UTC) - self._ttl
        with self._lock:
            for job_id in [j.id for j in self._jobs.values() if j.finished_at and j.finished_at < cutoff]:
                del self._jobs[job_id]
