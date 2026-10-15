from fastapi import APIRouter, Response, status

from app.api.deps import JobsDep, PredictorDep, SettingsDep, find_job, job_fields
from app.ml.predictor import InputError
from app.schemas.suggestions import SuggestJob, SuggestRequest
from app.services.jobs import Job

router = APIRouter(prefix="/suggestions", tags=["suggestions"])


def _view(job: Job) -> SuggestJob:
    return SuggestJob(**job_fields(job), result=job.result)


@router.post("", status_code=status.HTTP_202_ACCEPTED,
             summary="Start ranking a grid of candidate sites around a location for one category (site mode)")
def create_suggestion(pred: PredictorDep, jobs: JobsDep, settings: SettingsDep, body: SuggestRequest,
                      response: Response) -> SuggestJob:
    pred.class_index(body.category)
    sites, step = pred.suggest_grid(body.lat, body.lon, body.radius_km, body.step_m)
    if len(sites) > settings.suggest_max_points:
        raise InputError(f"{len(sites)} candidate sites; the limit is {settings.suggest_max_points}. "
                         "Use a smaller radius or a larger grid spacing")
    f1, top3 = pred.class_metrics["site"].get(body.category, (None, None))

    def work(progress):
        ranked = pred.suggest(body.category, sites, progress)
        return {"category": body.category, "lat": body.lat, "lon": body.lon, "radius_km": body.radius_km,
                "step_m": step, "sites": ranked, "category_test_f1": f1, "category_test_top3": top3}

    job = jobs.submit("suggest", work, total=len(sites))
    response.headers["Location"] = f"{settings.api_prefix}/suggestions/{job.id}"
    return _view(job)


@router.get("/{job_id}", summary="Progress and, when finished, the ranked candidate sites")
def get_suggestion(jobs: JobsDep, job_id: str) -> SuggestJob:
    return _view(find_job(jobs, job_id, "suggest"))
