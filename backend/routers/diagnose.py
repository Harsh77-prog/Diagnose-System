"""
Diagnose API: chat, upload report, history.
All routes require valid JWT (NextAuth).
"""
from __future__ import annotations

import base64
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from auth import require_user_id
from chroma_store import get_full_history
from diagnose_chain import run_diagnose
from report_parser import parse_report_content

router = APIRouter(prefix="/api/diagnose", tags=["diagnose"])


@router.post("/chat")
async def diagnose_chat(
    request: Request,
    message: str = Form(..., description="User message / symptom description"),
    report_text: Optional[str] = Form(None, description="Optional pasted report text"),
    image_b64: Optional[str] = Form(None, description="Optional image as base64"),
) -> dict[str, Any]:
    """Send a message (and optional report context or image) and get diagnosis-style reply with follow-ups and risk."""
    user_id = require_user_id(request)
    if not message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message is required")

    report_context = (report_text or "").strip()
    image_data: Optional[str] = None
    if image_b64:
        try:
            base64.b64decode(image_b64)
            image_data = image_b64
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image base64")

    result = run_diagnose(
        user_id=user_id,
        user_message=message.strip(),
        report_context=report_context or "",
        image_b64=image_data,
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
    """Same as /chat but JSON body: { message, report_text?, image_b64? }."""
    user_id = require_user_id(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="message is required")

    report_text = (body.get("report_text") or "").strip()
    image_b64 = body.get("image_b64")

    result = run_diagnose(
        user_id=user_id,
        user_message=message,
        report_context=report_text,
        image_b64=image_b64,
    )
    return result
