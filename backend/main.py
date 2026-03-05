"""
MedCoreAI Diagnosis Backend.
FastAPI app: /api/diagnose/* (chat, upload-report, history). Auth via NextAuth JWT.
Powered by BioBERT + ML Ensemble — no OpenAI API needed.
"""
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.diagnose import router as diagnose_router, warmup_image_models_in_background

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(
    title="MedCoreAI Diagnosis API",
    description="ML-powered medical diagnosis: BioBERT symptom extraction + ensemble prediction. Per-user history.",
    version="2.0.0",
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

app.include_router(diagnose_router)


@app.on_event("startup")
def startup_warm_image_models() -> None:
    # Non-blocking warmup so first image inference does not pay full model cold-start cost.
    warmup_image_models_in_background()


@app.get("/")
def root():
    return {"service": "MedCoreAI Diagnosis API (ML-Powered)", "docs": "/docs"}


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
    }


if __name__ == "__main__":
    import uvicorn
    from config import BACKEND_HOST, BACKEND_PORT
    uvicorn.run("main:app", host=BACKEND_HOST, port=BACKEND_PORT, reload=True)
