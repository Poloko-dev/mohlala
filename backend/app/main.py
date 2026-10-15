"""FastAPI application: the dual-mode GNN of gnn_location_model.ipynb as a web API.

Run with `uvicorn app.main:app --reload` from the backend folder; the interactive docs are at /docs.
"""
import logging
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.ml.predictor import InputError, Predictor
from app.services.jobs import JobManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.torch_threads:
        torch.set_num_threads(settings.torch_threads)
    app.state.predictor = Predictor(settings.model_dir, settings.data_dir)    # loaded once, shared by all requests
    app.state.jobs = JobManager(settings.job_workers, settings.job_ttl_seconds)
    yield
    app.state.jobs.shutdown()


async def input_error_handler(_: Request, exc: InputError) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={"detail": str(exc)})


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan,
                  description="Business location intelligence for Lesotho from a dual-mode GraphSAGE trained on "
                              "OpenStreetMap points of interest. Data © OpenStreetMap contributors (ODbL 1.0).")
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"],
                       allow_headers=["*"], expose_headers=["Content-Disposition", "Location"])
    app.add_exception_handler(InputError, input_error_handler)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
