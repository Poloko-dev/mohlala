import time

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:          # runs the lifespan: the model is loaded once for the whole session
        yield c


@pytest.fixture(scope="session")
def predictor(client):
    return app.state.predictor


def wait_for_job(client, url, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        job = client.get(url).json()
        if job["status"] in ("succeeded", "failed"):
            return job
        time.sleep(0.2)
    raise TimeoutError(url)
