"""
Diagnose API: chat, upload report, history.
All routes require valid JWT (NextAuth).
ML-powered — no OpenAI dependency.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from auth import require_user_id
from chroma_store import get_full_history
from report_parser import parse_report_content

router = APIRouter(prefix="/api/diagnose", tags=["diagnose"])


def _run_ml_diagnose(*, user_id: str, session_id: str, user_message: str, session_action: Optional[str] = None):
    # Lazy import so app can boot and bind port before heavy ML initialization.
    from diagnose_ml import run_ml_diagnose

    return run_ml_diagnose(
        user_id=user_id,
        session_id=session_id,
        user_message=user_message,
        session_action=session_action,
    )


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
