import asyncio
import base64
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from auth import require_user_id
from chroma_store import get_full_history
from report_parser import parse_report_content

router = APIRouter(prefix="/api/diagnose", tags=["diagnose"])
_image_predictor = None
_image_predictor_lock = threading.Lock()
_image_warmup_started = False
_image_warmup_lock = threading.Lock()

# simple in-memory per-user rate limiter
_rate_limit_data: dict[str, list[float]] = {}
_RATE_LIMIT_PER_MINUTE = 10  # requests per minute per user

LOGGER = logging.getLogger("medcore.router.diagnose")


def _run_ml_diagnose(
    *,
    user_id: str,
    session_id: str,
    user_message: str,
    session_action: Optional[str] = None,
    image_prediction: Optional[dict[str, Any]] = None,
):
    # Lazy import so app can boot and bind port before heavy ML initialization.
    from diagnose_ml import run_ml_diagnose

    return run_ml_diagnose(
        user_id=user_id,
        session_id=session_id,
        user_message=user_message,
        session_action=session_action,
        image_prediction=image_prediction,
    )


def _get_image_predictor():
    global _image_predictor
    if _image_predictor is not None:
        return _image_predictor

    with _image_predictor_lock:
        if _image_predictor is not None:
            return _image_predictor

        from image_predictor import ImagePredictor

        backend_root = Path(__file__).resolve().parents[1]
        # allow override via env var for deploys without persistent disk
        env_dir = os.getenv("MODEL_DIR")
        candidates = []
        if env_dir:
            candidates.append(Path(env_dir))
        # common repository locations
        candidates.extend([
            backend_root / "medical_ML" / "models",
            backend_root / "models",
            Path.cwd() / "medical_ML" / "models",
            Path.cwd() / "backend" / "medical_ML" / "models",
        ])
        # also check sibling of routers for situations where code is packaged differently
        candidates.append(Path(__file__).resolve().parent / "models")
        # final fallback: CWD itself
        candidates.append(Path.cwd())
        chosen = next((p for p in candidates if p.exists()), candidates[0] if candidates else backend_root)
        LOGGER.info(
            "Initializing ImagePredictor | cwd=%s | chosen=%s | candidates=%s",
            os.getcwd(),
            chosen,
            [str(c) for c in candidates],
        )
        _image_predictor = ImagePredictor(model_dir=str(chosen))
    return _image_predictor


def warmup_image_models_in_background(requested_datasets: Optional[list[str]] = None) -> None:
    """Warm image models in a daemon thread so first user inference avoids cold-start delays."""
    global _image_warmup_started
    with _image_warmup_lock:
        if _image_warmup_started:
            return
        _image_warmup_started = True

    def _runner() -> None:
        global _image_warmup_started
        try:
            predictor = _get_image_predictor()
            started = time.perf_counter()
            warmed = predictor.warmup(requested_datasets)
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            LOGGER.info(
                "Image model warmup completed | warmed=%s | duration_ms=%s | diagnostics=%s",
                warmed,
                duration_ms,
                predictor.diagnostics(),
            )
        except Exception:  # noqa: BLE001
            LOGGER.exception("Image model warmup failed")
        finally:
            with _image_warmup_lock:
                _image_warmup_started = False

    threading.Thread(target=_runner, name="image-model-warmup", daemon=True).start()


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


@router.get("/history")
async def get_history(request: Request) -> dict[str, Any]:
    """Get current user's diagnosis conversation history."""
    user_id = require_user_id(request)
    limit = 200
    history = get_full_history(user_id, limit=limit)
    return {"user_id": user_id, "history": history, "count": len(history)}


@router.post("/chat/json")
async def diagnose_chat_json(request: Request) -> dict[str, Any]:
    """JSON body: { message, session_action?, image_prediction?, report_prediction? }. ML-powered diagnosis."""
    user_id = require_user_id(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message is required")

    session_action = body.get("session_action")
    image_prediction = body.get("image_prediction")  # Image analysis results
    report_prediction = body.get("report_prediction")  # Report analysis results
    session_id = request.headers.get("X-Session-Id") or user_id

    # Call diagnosis with all available data
    from diagnose_ml import run_ml_diagnose
    
    result = run_ml_diagnose(
        user_id=user_id,
        session_id=session_id,
        user_message=message,
        session_action=session_action,
        image_prediction=image_prediction,
        report_prediction=report_prediction,
    )
    return result


@router.post("/upload-report")
async def upload_report(
    request: Request,
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Upload a medical report (PDF, image, or text). 
    Extracts text using OCR and analyzes with API to extract symptoms.
    """
    user_id = require_user_id(request)
    
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")
    
    content = await file.read()
    filename = file.filename
    mime_type = file.content_type or ""
    
    # Process the report
    from report_analyzer import process_report
    
    try:
        result = await process_report(
            file_content=content,
            filename=filename,
            mime_type=mime_type,
        )
        
        if "error" in result and not result.get("symptoms"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result.get("error", "Failed to process report")
            )
        
        return {
            "report_prediction": result,
            "user_id": user_id,
            "filename": filename,
        }
        
    except Exception as e:
        LOGGER.error(f"Report processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Report processing failed: {str(e)}"
        )


@router.post("/image-predict")
async def image_predict(request: Request) -> dict[str, Any]:
    """JSON body: { image_base64, preferred_datasets? }.
    Runs prediction across trained MedMNIST image models.

    Implements numerous performance and safety checks:
      * per-user rate limit
      * size/format validation (jpg/png, <=5MB, max dimension 1024px)
      * asynchronous timeout wrapper (configured via IMAGE_INFERENCE_TIMEOUT_SECONDS)
      * non‑blocking image decode/resizing
    """
    from PIL import Image
    import io

    # rate limiting
    user_id = require_user_id(request)
    now_ts = time.time()
    bucket = _rate_limit_data.get(user_id, [])
    # drop old entries
    bucket = [t for t in bucket if now_ts - t < 60]
    if len(bucket) >= _RATE_LIMIT_PER_MINUTE:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")
    bucket.append(now_ts)
    _rate_limit_data[user_id] = bucket

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

    # decode and validate size/format
    predictor = _get_image_predictor()
    try:
        image_bytes = predictor._decode_base64(image_base64)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    MAX_SIZE = getattr(__import__('config'), 'MAX_IMAGE_UPLOAD_SIZE', 5 * 1024 * 1024)
    if len(image_bytes) > MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Uploaded image too large")

    try:
        img = Image.open(io.BytesIO(image_bytes))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to parse image data")

    fmt = (img.format or "").upper()
    if fmt not in {"JPEG", "JPG", "PNG"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported image format: {fmt}")

    max_dim = getattr(__import__('config'), 'MAX_IMAGE_DIMENSION', 1024)
    if max(img.size) > max_dim:
        ratio = max_dim / max(img.size)
        new_size = (int(img.width * ratio), int(img.height * ratio))
        img = img.resize(new_size, Image.ANTIALIAS)
        buf = io.BytesIO()
        img.save(buf, format=fmt)
        image_bytes = buf.getvalue()
        image_base64 = base64.b64encode(image_bytes).decode('ascii')

    # run prediction with timeout
    try:
        started = time.perf_counter()
        duration_limit = getattr(__import__('config'), 'IMAGE_INFERENCE_TIMEOUT_SECONDS', 180)
        full_prediction = await asyncio.wait_for(
            asyncio.to_thread(predictor.predict_selected, image_base64, preferred_datasets),
            timeout=duration_limit,
        )
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        debug = predictor.diagnostics()
        LOGGER.info(
            "Image prediction success | user_id=%s | requested=%s | in_memory=%s | best_dataset=%s | best_label=%s | best_confidence=%.2f | duration_ms=%s",
            user_id,
            preferred_datasets if isinstance(preferred_datasets, list) else "all",
            debug["models_in_memory"],
            full_prediction["best_dataset"],
            full_prediction["best_label_name"],
            full_prediction["best_confidence"],
            duration_ms,
        )
        # trim payload to top 3 per_dataset entries for response
        trimmed = {
            **full_prediction,
            "per_dataset": full_prediction.get("per_dataset", [])[:3],
        }
        prediction = trimmed
    except asyncio.TimeoutError:
        LOGGER.warning("Image inference timeout (>%ss) for user=%s", duration_limit, user_id)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"status": "timeout", "message": "Image inference exceeded allowed processing time"},
        )
    except RuntimeError as exc:
        debug = {}
        try:
            debug = predictor.diagnostics()
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


@router.post("/recommend-datasets")
async def recommend_datasets(request: Request) -> dict[str, Any]:
    """JSON body: { symptoms: list[str] }.
    Returns recommended MedMNIST datasets based on the extracted symptoms.
    This helps the frontend select the right image models for diagnosis.
    """
    require_user_id(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    symptoms = body.get("symptoms", [])
    if not symptoms or not isinstance(symptoms, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="symptoms array is required")

    # Get recommended datasets based on symptoms
    from diagnose_ml import get_recommended_datasets
    
    recommended = get_recommended_datasets(symptoms)
    
    return {
        "symptoms": symptoms,
        "recommended_datasets": recommended,
        "explanation": f"Based on your symptoms, we recommend using these image analysis models for more accurate diagnosis."
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
        import re

        if re.search(r"\*?\*?Question\s+\d+\s*:\*?\*?", text):
            from translator.service import translate_diagnosis_message

            result = translate_diagnosis_message(text=text, target_lang=target_lang)
            translated = result["translated_text"]
        else:
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
