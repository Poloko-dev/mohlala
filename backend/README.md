# Backend: FastAPI service for the dual-mode GNN

Serves the model of `gnn_location_model.ipynb` (25 GraphSAGE models, site and known mode) as a web API. The
prediction code is that of `predict_poi.py`, reorganised for a server. Its results equal the CLI's exactly: the
parity tests rerun `predict_poi.py --check`.

## Layout

```
backend/
├── app/
│   ├── main.py            app factory, lifespan (loads the model once), CORS, gzip, error handler
│   ├── core/config.py     settings from the environment (prefix POI_) or .env
│   ├── ml/                the model: gnn.py (GraphSAGE), features.py (feature engineering), predictor.py
│   ├── schemas/           pydantic request and response models (the API contract)
│   ├── services/          presenters (model output → schemas), catalog, batch CSV, background jobs
│   └── api/               dependencies and one router per resource
├── model/                 trained model: the files of ../model_outputs_v2/ the predictor reads
├── data/                  the graph the model runs on: processed_poi.csv, poi_engineered.csv, points_of_interest.csv
├── tests/                 API tests, and the slow parity tests against the notebook
├── scripts/export_openapi.py   writes openapi.json, from which the frontend generates its types
├── openapi.json
├── requirements.txt, requirements-dev.txt, pyproject.toml (pytest, ruff), .env.example
```

## Run

The model needs PyTorch and PyTorch Geometric. The venv is created with `--system-site-packages`, so it reuses the
copies installed for the notebooks instead of installing them a second time.

```powershell
cd backend
python -m venv --system-site-packages .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload            # http://127.0.0.1:8000/docs
```

The model loads at startup (under a second). Run a single worker process: background jobs are kept in memory.

## Endpoints (`/api/v1`)

| Method and path | What it does | Time |
|---|---|---|
| `GET /health` | Model loaded, number of models and POIs | instant |
| `GET /model` | Architecture, configuration and every evaluation table of `metrics.json` (RO1, RO2, RO4) | instant |
| `POST /predictions/site` | What a candidate location suits (site mode): probabilities, context, 8 graph neighbours, market signals | ~0.3 s |
| `POST /predictions/new-poi` | A POI described as it would be mapped (known mode) | ~2 s |
| `POST /suggestions` → `GET /suggestions/{id}` | Background job: rank a grid of candidate sites around a location for one category | ~0.4 s per site |
| `GET /market-gaps` | Rows of `market_gaps.csv` (RO3), flagged only by default | instant |
| `GET /areas` | The 78 sub-districts with the mean position of their POIs | instant |
| `GET /pois`, `GET /pois/search?q=`, `GET /pois/{id}` | The mapped POIs, search by name or OSM id, one POI | instant |
| `GET /pois/{id}/prediction` | The notebook's out-of-fold predictions for a mapped POI, both modes | instant |
| `POST /batch` → `GET /batch/{id}`, `GET /batch/{id}/csv` | Background job: score every row of an uploaded CSV; the CSV gets the predictions appended | per row as above |

Invalid input, such as a location outside Lesotho, an unknown sub-district or an unknown category, returns 422 with
a readable `detail`.

## Test

```powershell
pytest                 # API tests (about 20 s)
pytest -m slow         # the four checks of predict_poi.py --check against the notebook outputs (about 3 min)
ruff check app tests
```

## After retraining the model

The notebook writes to `../model_outputs_v2/`. Either copy the new files over `model/` (and the CSVs over `data/` if
the earlier notebooks were rerun), or point the API at the research folder without copying:

```powershell
$env:POI_MODEL_DIR = "..\model_outputs_v2"; $env:POI_DATA_DIR = ".."
```

If the API changes, regenerate the contract for the frontend:
`python -m scripts.export_openapi`, then `npm run gen:api` in `frontend/`.
