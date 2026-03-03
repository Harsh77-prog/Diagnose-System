"""
Diagnose API: chat, upload report, history.
All routes require valid JWT (NextAuth).
ML-powered — no OpenAI dependency.
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from auth import require_user_id
from chroma_store import get_full_history
from report_parser import parse_report_content

router = APIRouter(prefix="/api/diagnose", tags=["diagnose"])
_image_predictor = None
LOGGER = logging.getLogger("medcore.router.diagnose")


def _run_ml_diagnose(*, user_id: str, session_id: str, user_message: str, session_action: Optional[str] = None):
    # Lazy import so app can boot and bind port before heavy ML initialization.
    from diagnose_ml import run_ml_diagnose

    return run_ml_diagnose(
        user_id=user_id,
        session_id=session_id,
        user_message=user_message,
        session_action=session_action,
    )


def _get_image_predictor():
    global _image_predictor
    if _image_predictor is not None:
        return _image_predictor

    from image_predictor import ImagePredictor

    backend_root = Path(__file__).resolve().parents[1]
    candidates = [
        backend_root / "medical_ML" / "models",
        Path.cwd() / "medical_ML" / "models",
        Path.cwd() / "backend" / "medical_ML" / "models",
    ]
    chosen = next((p for p in candidates if p.exists()), candidates[0])
    LOGGER.info(
        "Initializing ImagePredictor | cwd=%s | chosen=%s | candidates=%s",
        os.getcwd(),
        chosen,
        [str(c) for c in candidates],
    )
    _image_predictor = ImagePredictor(model_dir=str(chosen))
    return _image_predictor


@router.post("/chat")
async def diagnose_chat(
    request: Request,
    message: str = Form(..., description="User message / symptom description"),
    session_action: Optional[str] = Form(None, description="Follow-up action: yes/no"),
) -> dict[str, Any]:
    """Send a message and get ML-powered diagnosis or follow-up question."""
    user_id = require_user_id(request)
    session_id = request.headers.get("X-Session-Id") or user_id 
    if not message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message is required")

    result = _run_ml_diagnose(
        user_id=user_id,
        session_id=session_id,
        user_message=message.strip(),
        session_action=session_action,
    )
    return result


@router.post("/upload-report")
async def upload_report(
    request: Request,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Upload a report (PDF or text). Returns extracted text for the client to send in the next /chat call."""
    user_id = require_user_id(request)
    content = await file.read()
    filename = file.filename or ""
    mime = file.content_type or ""

    text = parse_report_content(content_bytes=content, filename=filename, mime_type=mime)
    return {
        "extracted_text": text,
        "filename": filename,
        "user_id": user_id,
    }


@router.get("/history")
async def get_history(request: Request) -> dict[str, Any]:
    """Get current user's diagnosis conversation history."""
    user_id = require_user_id(request)
    limit = 200
    history = get_full_history(user_id, limit=limit)
    return {"user_id": user_id, "history": history, "count": len(history)}


@router.post("/chat/json")
async def diagnose_chat_json(request: Request) -> dict[str, Any]:
    """JSON body: { message, session_action? }. ML-powered diagnosis."""
    user_id = require_user_id(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message is required")

    session_action = body.get("session_action")
    session_id = request.headers.get("X-Session-Id") or user_id

    result = _run_ml_diagnose(
        user_id=user_id,
        session_id=session_id,
        user_message=message,
        session_action=session_action,
    )
    return result


@router.post("/image-predict")
async def image_predict(request: Request) -> dict[str, Any]:
    """JSON body: { image_base64, preferred_datasets? }. Runs prediction across trained MedMNIST image models."""
    try:
        user_id = require_user_id(request)
    except HTTPException:
        LOGGER.warning(
            "Unauthorized /image-predict call | has_auth=%s | has_internal_secret=%s | has_user_id_header=%s",
            bool(request.headers.get("Authorization")),
            bool(request.headers.get("X-Internal-Secret")),
            bool(request.headers.get("X-User-Id")),
        )
        raise
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    image_base64 = (body.get("image_base64") or "").strip()
    if not image_base64:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="image_base64 is required")
    preferred_datasets = body.get("preferred_datasets")
    if preferred_datasets is not None and not isinstance(preferred_datasets, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="preferred_datasets must be an array")

    try:
        started = time.perf_counter()
        predictor = _get_image_predictor()
        prediction = predictor.predict_selected(image_base64, preferred_datasets)
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        debug = predictor.diagnostics()
        LOGGER.info(
            "Image prediction success | user_id=%s | requested=%s | in_memory=%s | best_dataset=%s | best_label=%s | best_confidence=%.2f | duration_ms=%s",
            user_id,
            preferred_datasets if isinstance(preferred_datasets, list) else "all",
            debug["models_in_memory"],
            prediction["best_dataset"],
            prediction["best_label_name"],
            prediction["best_confidence"],
            duration_ms,
        )
    except ValueError as exc:
        LOGGER.warning("Image prediction value error: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:
        debug = {}
        try:
            debug = predictor.diagnostics()  # type: ignore[name-defined]
        except Exception:  # noqa: BLE001
            pass
        LOGGER.exception("Image prediction runtime error | diagnostics=%s", debug)
        detail = str(exc)
        if debug:
            detail = f"{detail} | diagnostics={debug}"
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail)
    except Exception as exc:
        LOGGER.exception("Image prediction unexpected error")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Image prediction failed: {exc}")

    return {"image_prediction": prediction, "image_debug": debug, "latency_ms": duration_ms}


@router.post("/image-predict/warmup")
async def image_predict_warmup(request: Request) -> dict[str, Any]:
    """JSON body: { preferred_datasets? }. Preloads selected model weights into memory."""
    require_user_id(request)
    try:
        body = await request.json()
    except Exception:
        body = {}

    preferred_datasets = body.get("preferred_datasets")
    if preferred_datasets is not None and not isinstance(preferred_datasets, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="preferred_datasets must be an array")

    predictor = _get_image_predictor()
    requested = preferred_datasets if isinstance(preferred_datasets, list) else None
    started = time.perf_counter()
    warmed = predictor.warmup(requested)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    debug = predictor.diagnostics()
    return {
        "ok": True,
        "warmed_datasets": warmed,
        "latency_ms": duration_ms,
        "image_debug": debug,
    }


@router.post("/translate")
async def translate_endpoint(request: Request) -> dict[str, Any]:
    """JSON body: { text, target_lang? }. Returns machine-translated text."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    text = (body.get("text") or "").strip()
    target_lang = (body.get("target_lang") or "hi").strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="text is required")

    try:
        from translator.service import translate_text

        translated = translate_text(text=text, target_lang=target_lang)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Translation failed: {exc}",
        )

    return {
        "source_text": text,
        "target_lang": target_lang,
        "translated_text": translated,
    }
