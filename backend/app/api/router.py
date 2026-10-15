from fastapi import APIRouter

from app.api.routes import areas, batch, meta, pois, predictions, suggestions

api_router = APIRouter()
api_router.include_router(meta.router)
api_router.include_router(predictions.router)
api_router.include_router(suggestions.router)
api_router.include_router(areas.router)
api_router.include_router(pois.router)
api_router.include_router(batch.router)
