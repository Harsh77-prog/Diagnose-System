"""
MedCoreAI Diagnosis Backend.
FastAPI app: /api/diagnose/* (chat, upload-report, history). Auth via NextAuth JWT.
Powered by BioBERT + ML Ensemble — no OpenAI API needed.

Performance Optimizations:
- Prediction caching with LRU eviction
- Entropy calculation caching
- Vectorized ML operations
- Session TTL with automatic cleanup
- Image prediction LRU cache with OrderedDict
- BioBERT embedding caching
"""
import asyncio
import logging
import time
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
import torch

# limit CPU threads for Render-friendly consumption
torch.set_num_threads(1)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers.diagnose import router as diagnose_router, warmup_image_models_in_background
from config import REQUEST_TIMEOUT_SECONDS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("🚀 MedCoreAI Backend starting...")
    logger.info("torch threads=%s", torch.get_num_threads())
    warmup_image_models_in_background()
    yield
    logger.info("🛑 MedCoreAI Backend shutting down...")


app = FastAPI(
    title="MedCoreAI Diagnosis API",
    description="ML-powered medical diagnosis: BioBERT symptom extraction + ensemble prediction. Per-user history.",
    version="2.0.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request timeout middleware
@app.middleware("http")
async def timeout_middleware(request: Request, call_next):
    """Add request timeout protection."""
    try:
        start_time = time.time()
        response = await asyncio.wait_for(call_next(request), timeout=REQUEST_TIMEOUT_SECONDS)
        duration = time.time() - start_time
        response.headers["X-Process-Time"] = str(duration)
        return response
    except asyncio.TimeoutError:
        logger.error(f"Request timeout after {REQUEST_TIMEOUT_SECONDS}s: {request.url}")
        return JSONResponse(
            status_code=504,
            content={"detail": f"Request timeout after {REQUEST_TIMEOUT_SECONDS} seconds"}
        )


app.include_router(diagnose_router)


@app.get("/")
def root():
    return {"service": "MedCoreAI Diagnosis API (ML-Powered v2.0.1)", "docs": "/docs"}


@app.get("/health")
def health():
    backend_root = Path(__file__).resolve().parent
    model_dir = backend_root / "medical_ML" / "models"
    model_files = sorted(str(p.name) for p in model_dir.glob("*_model.pth")) if model_dir.exists() else []
    return {
        "status": "ok",
        "ml_engine_loaded": "lazy",
        "image_models_available": model_files,
        "image_model_count": len(model_files),
        "version": "2.0.1",
    }


if __name__ == "__main__":
    import asyncio
    import uvicorn
    from config import BACKEND_HOST, BACKEND_PORT
    # default to 2 workers for better concurrency on Render
    uvicorn.run(
        "main:app",
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        reload=True,
        workers=2,
    )
