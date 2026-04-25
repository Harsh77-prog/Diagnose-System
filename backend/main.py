"""
MedCoreAI Diagnosis Backend.
FastAPI app: /api/diagnose/* (chat, upload-report, history). Auth via NextAuth JWT.
"""
import asyncio
import logging
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from config import (
    IMAGE_MODEL_PERIODIC_WARMUP,
    IMAGE_MODEL_WARMUP_ON_STARTUP,
    REQUEST_TIMEOUT_SECONDS,
)
from routers.conversation import router as conversation_router
from routers.diagnose import router as diagnose_router, warmup_image_models_in_background

# Keep torch conservative on small instances.
torch.set_num_threads(2)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

logger = logging.getLogger(__name__)


def _periodic_warmup():
    while True:
        try:
            time.sleep(300)
            warmup_image_models_in_background()
        except Exception:
            logger.exception("Periodic image warmup failed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("MedCoreAI Backend starting...")
    logger.info("torch threads=%s", torch.get_num_threads())

    if IMAGE_MODEL_WARMUP_ON_STARTUP:
        logger.info("Image model startup warmup enabled")
        warmup_image_models_in_background()
    else:
        logger.info("Image model startup warmup disabled")

    if IMAGE_MODEL_PERIODIC_WARMUP:
        logger.info("Image model periodic warmup enabled")
        threading.Thread(target=_periodic_warmup, name="periodic-warmup", daemon=True).start()
    else:
        logger.info("Image model periodic warmup disabled")

    yield
    logger.info("MedCoreAI Backend shutting down...")


app = FastAPI(
    title="MedCoreAI Diagnosis API",
    description="ML-powered medical diagnosis backend with image and report analysis.",
    version="2.0.2",
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
        logger.error("Request timeout after %ss: %s", REQUEST_TIMEOUT_SECONDS, request.url)
        return JSONResponse(
            status_code=504,
            content={"detail": f"Request timeout after {REQUEST_TIMEOUT_SECONDS} seconds."},
        )


app.include_router(diagnose_router)
app.include_router(conversation_router)


@app.get("/")
def root():
    return {"service": "MedCoreAI Diagnosis API", "docs": "/docs"}


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
        "version": "2.0.2",
    }


if __name__ == "__main__":
    import uvicorn
    from config import BACKEND_HOST, BACKEND_PORT

    uvicorn.run(
        "main:app",
        host=BACKEND_HOST,
        port=BACKEND_PORT,
        reload=True,
        workers=1,
    )
