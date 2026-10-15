"""Write the API's OpenAPI schema to backend/openapi.json; the frontend generates its types from it
(npm run gen:api). Run from the backend folder: python -m scripts.export_openapi"""
import json
from pathlib import Path

from app.main import app

out = Path(__file__).resolve().parents[1] / "openapi.json"
out.write_text(json.dumps(app.openapi(), indent=2) + "\n", encoding="utf-8")
print(f"Wrote {out}")
