"""
MedCoreAI Diagnosis Backend.
FastAPI app: /api/diagnose/* (chat, upload-report, history). Auth via NextAuth JWT.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import OPENAI_API_KEY
from routers.diagnose import router as diagnose_router

app = FastAPI(
    title="MedCoreAI Diagnosis API",
    description="AI-powered medical guidance: chat, reports, images. Per-user history via ChromaDB.",
    version="1.0.0",
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


@app.get("/")
def root():
    return {"service": "MedCoreAI Diagnosis API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok", "openai_configured": bool(OPENAI_API_KEY)}


if __name__ == "__main__":
    import uvicorn
    from config import BACKEND_HOST, BACKEND_PORT
    uvicorn.run("main:app", host=BACKEND_HOST, port=BACKEND_PORT, reload=True)
