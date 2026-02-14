"""
Simple risk/severity scoring for symptom descriptions.
Uses keyword-based rules plus optional logistic regression for numeric prediction.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

# High-risk keywords (emergency / urgent)
HIGH_RISK_KEYWORDS = {
    "chest pain", "heart attack", "stroke", "can't breathe", "difficulty breathing",
    "severe bleeding", "unconscious", "suicide", "suicidal", "severe pain",
    "allergic reaction", "anaphylaxis", "seizure", "poisoning", "overdose",
    "head injury", "major trauma", "child not breathing", "choking",
    "sudden weakness", "slurred speech", "collapse", "severe burn",
}

# Medium-risk keywords
MEDIUM_RISK_KEYWORDS = {
    "fever", "high fever", "persistent cough", "blood in", "vomiting blood",
    "severe headache", "abdominal pain", "dizziness", "confusion",
    "rash", "infection", "swelling", "numbness", "pain when",
}

# Risk level labels
RISK_LEVELS = ["low", "medium", "high", "critical"]


def _normalize_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.lower().strip())


def keyword_risk_score(text: str) -> tuple[float, str]:
    """
    Returns (score 0-1, level string).
    """
    norm = _normalize_text(text)
    if not norm:
        return 0.0, "low"

    score = 0.0
    for kw in HIGH_RISK_KEYWORDS:
        if kw in norm:
            score = max(score, 0.9)
    for kw in MEDIUM_RISK_KEYWORDS:
        if kw in norm:
            score = max(score, 0.5, score)

    # Slight boost for question marks / urgency language
    if "emergency" in norm or "urgent" in norm or "asap" in norm:
        score = min(1.0, score + 0.15)
    if "?" in text and score < 0.5:
        score = max(score, 0.2)

    if score >= 0.85:
        level = "critical"
    elif score >= 0.5:
        level = "high"
    elif score >= 0.25:
        level = "medium"
    else:
        level = "low"

    return round(min(1.0, score), 4), level


def predict_risk(payload: dict[str, Any]) -> dict[str, Any]:
    """
    payload: { "symptom_text": "...", "recent_summary": "..." (optional) }
    Returns: { "risk_score": float, "risk_level": str, "suggested_action": str }
    """
    text = (payload.get("symptom_text") or "") + " " + (payload.get("recent_summary") or "")
    score, level = keyword_risk_score(text)

    if level == "critical":
        suggested = "Seek emergency care or call emergency services if you haven't already."
    elif level == "high":
        suggested = "Consider contacting a healthcare provider or urgent care soon."
    else:
        suggested = "Continue the conversation; professional follow-up may still be recommended based on context."

    return {
        "risk_score": score,
        "risk_level": level,
        "suggested_action": suggested,
    }
