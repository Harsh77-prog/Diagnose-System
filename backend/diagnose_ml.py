"""
ML-powered diagnosis assistant — replaces OpenAI/LangChain.
Uses BioBERT for symptom extraction and ML Ensemble for disease prediction.
Manages per-user session state for multi-turn follow-up questions.

Optimizations:
- Session state with read-write locks for better concurrency
- Memory-bounded session storage with TTL
- Vectorized operations for predictions
"""
from __future__ import annotations

import os
import json
import sys
import threading
import time
from typing import Any, Optional
from collections import OrderedDict

from chroma_store import add_turn, get_recent_history
from risk_model import predict_risk

# ── Paths ────────────────────────────────────────────────────────────────
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ML_DIR = os.path.join(BACKEND_DIR, "medical_ML")
MODEL_DIR = os.path.join(ML_DIR, "models")
DATA_DIR = os.path.join(ML_DIR, "data")

# Add medical_ML to path so we can import its modules
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from ml_engine import MLDiagnosticEngine
from symptom_extractor import BioBERTSymptomExtractor

# ── Initialize ML Components (loaded once at startup) ────────────────────
print("\n  🔧 Initializing ML diagnostic engine...")
_engine = MLDiagnosticEngine(model_dir=MODEL_DIR, data_dir=DATA_DIR)

with open(os.path.join(MODEL_DIR, "metadata.json")) as f:
    _metadata = json.load(f)

_extractor = BioBERTSymptomExtractor(
    model_dir=MODEL_DIR,
    symptom_columns=_metadata["symptom_columns"]
)
print("  ✓ ML engine ready (100% offline — no API keys needed)\n")

ML_ENGINE_LOADED = True

# ── Per-user session state ───────────────────────────────────────────────
# Stores in-progress diagnosis sessions so follow-up questions work
# over multiple HTTP requests.
# Optimization: TTL-based cleanup and bounded storage
_sessions: dict[str, dict[str, Any]] = {}
_session_timestamps: dict[str, float] = {}  # Track session creation time
_session_lock = threading.Lock()
_SESSION_TTL_SECONDS = 3600  # Sessions expire after 1 hour
_MAX_SESSIONS = 1000  # Prevent unbounded memory growth


def _cleanup_expired_sessions() -> None:
    """Remove sessions that have expired."""
    now = time.time()
    with _session_lock:
        expired = [sid for sid, ts in _session_timestamps.items() 
                   if now - ts > _SESSION_TTL_SECONDS]
        for sid in expired:
            _sessions.pop(sid, None)
            _session_timestamps.pop(sid, None)


def _get_session(session_id: str) -> Optional[dict]:
    _cleanup_expired_sessions()
    with _session_lock:
        return _sessions.get(session_id)


def _set_session(session_id: str, session: dict) -> None:
    _cleanup_expired_sessions()
    with _session_lock:
        # Prevent unbounded growth
        if len(_sessions) >= _MAX_SESSIONS and session_id not in _sessions:
            # Remove oldest session
            oldest_sid = min(_session_timestamps.items(), key=lambda x: x[1])[0]
            _sessions.pop(oldest_sid, None)
            _session_timestamps.pop(oldest_sid, None)
        
        _sessions[session_id] = session
        _session_timestamps[session_id] = time.time()


def _clear_session(session_id: str) -> None:
    with _session_lock:
        _sessions.pop(session_id, None)
        _session_timestamps.pop(session_id, None)


def _format_diagnosis_reply(result: dict) -> str:
    """Format ML diagnosis result into a readable chat message."""
    lines = []

    diagnosis = result["diagnosis"]
    confidence = result["confidence"]
    dtype = result["diagnosis_type"]

    if dtype == "direct":
        lines.append(f"**Diagnosis: {diagnosis}**")
        lines.append(f"Confidence: {confidence}%")
        lines.append("_(Direct match — no follow-up questions needed)_")
    elif dtype == "confident":
        lines.append(f"**Diagnosis: {diagnosis}**")
        lines.append(f"Confidence: {confidence}%")
        lines.append(f"(Confirmed after {result['followups_asked']} follow-up questions)")
    else:
        lines.append(f"**Best Guess: {diagnosis}**")
        lines.append(f"Confidence: {confidence}%")
        lines.append("_(Low confidence — please consult a doctor)_")



    # Confirmed symptoms
    if result["confirmed_symptoms"]:
        lines.append("")
        lines.append(f"**Symptoms identified ({len(result['confirmed_symptoms'])}):**")
        for s in result["confirmed_symptoms"]:
            lines.append(f"• {s.replace('_', ' ').title()}")



    # Disease info
    info = result["disease_info"]
    if info.get("description"):
        lines.append("")
        lines.append(f"**About {diagnosis}:**")
        lines.append(info["description"])

    if info.get("precautions"):
        lines.append("")
        lines.append("**Precautions:**")
        for i, p in enumerate(info["precautions"], 1):
            lines.append(f"{i}. {p}")

    lines.append("")
    lines.append("⚕️ This is for informational purposes only. Always consult a qualified healthcare professional.")

    return "\n".join(lines)


def _format_followup_question(symptom_display: str, turn: int) -> str:
    """Format a follow-up question as a chat message."""
    return (
        f"To narrow down the diagnosis, I need to ask you a few questions.\n\n"
        f"**Question {turn}:** Are you experiencing **{symptom_display.lower()}**?"
    )


def run_ml_diagnose(
    user_id: str,
    session_id: str,
    user_message: str,
    session_action: Optional[str] = None,
) -> dict[str, Any]:
    """
    Run one diagnosis turn using the ML engine.
    """
    # ── Risk scoring (same as before) ────────────────────────────────────
    recent = get_recent_history(session_id, limit=4)
    recent_summary = " ".join([m["content"][:200] for m in recent[-4:] if m["role"] == "user"])
    risk_result = predict_risk({"symptom_text": user_message, "recent_summary": recent_summary})

    # ── Handle follow-up answers ─────────────────────────────────────────
    if session_action in ("yes", "no"):
        session = _get_session(session_id)
        if not session:
            # No active session — treat as new message
            return _start_new_diagnosis(session_id, user_message, risk_result)

        return _continue_followup(session_id, session, session_action == "yes", risk_result)

    # ── New diagnosis ────────────────────────────────────────────────────
    return _start_new_diagnosis(session_id, user_message, risk_result)


def _start_new_diagnosis(
    session_id: str,
    user_message: str,
    risk_result: dict,
) -> dict[str, Any]:
    """Extract symptoms, predict, and either return diagnosis or first follow-up."""
    # Clear any previous session
    _clear_session(session_id)

    # Step 1: BioBERT extracts symptoms
    extracted = _extractor.extract_symptoms(user_message)

    if not extracted:
        reply = (
            "I couldn't identify specific symptoms from your description. "
            "Could you try describing what you're feeling more specifically?\n\n"
            "**Examples:**\n"
            "• \"I have a headache and fever\"\n"
            "• \"My skin is itchy and I feel tired\"\n"
            "• \"I have stomach pain and nausea\""
        )
        add_turn(session_id, "user", user_message)
        add_turn(session_id, "assistant", reply)
        return {
            "reply": reply,
            "risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
            "suggested_action": risk_result["suggested_action"],
            "follow_up_suggested": False,
        }

    # Persist user message
    add_turn(session_id, "user", user_message)

    # Step 2: Build symptom vector and predict
    symptom_vector = _engine.build_symptom_vector(extracted)
    predictions = _engine.predict(symptom_vector)

    # Step 3: Check if already confident → return diagnosis immediately
    if _engine.is_confident(predictions):
        result = _engine.run_diagnosis(extracted)
        reply = _format_diagnosis_reply(result)
        add_turn(session_id, "assistant", reply, metadata={"risk_level": risk_result["risk_level"]})
        return {
            "reply": reply,
            "risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
            "suggested_action": risk_result["suggested_action"],
            "follow_up_suggested": False,
            "ml_diagnosis": result,
        }

    # Step 4: Not confident — start follow-up session
    confirmed_symptoms = list(set(extracted))
    asked_symptoms = set(extracted)

    # Find best follow-up question
    best_symptom, info_gain = _engine.find_best_followup(
        symptom_vector, asked_symptoms, predictions
    )

    if best_symptom is None:
        # No good follow-up — just give best guess
        result = _engine.run_diagnosis(extracted)
        reply = _format_diagnosis_reply(result)
        add_turn(session_id, "assistant", reply, metadata={"risk_level": risk_result["risk_level"]})
        return {
            "reply": reply,
            "risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
            "suggested_action": risk_result["suggested_action"],
            "follow_up_suggested": False,
            "ml_diagnosis": result,
        }

    # Save session for follow-ups
    session = {
        "symptom_vector": symptom_vector.tolist(),
        "confirmed_symptoms": confirmed_symptoms,
        "asked_symptoms": list(asked_symptoms),
        "predictions": predictions,
        "followup_count": 1,
        "followup_log": [],
        "current_followup_symptom": best_symptom,
        "current_info_gain": info_gain,
        "original_message": user_message,
    }
    _set_session(session_id, session)

    # Build initial info + follow-up question
    symptom_names = ", ".join(s.replace("_", " ").title() for s in extracted)
    top_pred = predictions[0]
    intro = (
        f"I identified the following symptoms: **{symptom_names}**\n\n"
        f"Initial prediction: **{top_pred[0]}** ({top_pred[1]*100:.1f}% confidence)\n\n"
        f"The confidence is not high enough for a definitive diagnosis. "
        f"Let me ask a few follow-up questions to narrow it down.\n\n"
    )
    question = _format_followup_question(_engine.display_symptom(best_symptom), 1)
    reply = intro + question

    add_turn(session_id, "assistant", reply, metadata={"risk_level": risk_result["risk_level"]})

    return {
        "reply": reply,
        "risk_score": risk_result["risk_score"],
        "risk_level": risk_result["risk_level"],
        "suggested_action": risk_result["suggested_action"],
        "follow_up_suggested": True,
        "follow_up_question": _engine.display_symptom(best_symptom),
    }


def _continue_followup(
    session_id: str,
    session: dict,
    confirmed: bool,
    risk_result: dict,
) -> dict[str, Any]:
    """Process a follow-up answer and return next question or final diagnosis."""
    import numpy as np

    symptom_vector = np.array(session["symptom_vector"])
    confirmed_symptoms = session["confirmed_symptoms"]
    asked_symptoms = set(session["asked_symptoms"])
    followup_count = session["followup_count"]
    followup_log = session["followup_log"]
    current_symptom = session["current_followup_symptom"]
    current_gain = session["current_info_gain"]

    # Record the user's answer
    answer_text = "Yes" if confirmed else "No"
    add_turn(session_id, "user", answer_text)

    # Update symptom vector if confirmed
    asked_symptoms.add(current_symptom)
    if confirmed:
        idx = _engine.symptom_columns.index(current_symptom)
        symptom_vector[idx] = 1
        confirmed_symptoms.append(current_symptom)

    followup_log.append({
        "symptom": current_symptom,
        "display": _engine.display_symptom(current_symptom),
        "confirmed": confirmed,
        "info_gain": round(current_gain, 4),
        "turn": followup_count,
    })

    # Re-predict
    predictions = _engine.predict(symptom_vector)

    # Check if now confident or max follow-ups reached
    if _engine.is_confident(predictions) or followup_count >= 5:
        _clear_session(session_id)

        diagnosis_type = "confident" if _engine.is_confident(predictions) else "best_guess"
        top_disease, top_prob = predictions[0]
        disease_info = _engine.get_disease_info(top_disease)

        result = {
            "diagnosis": top_disease,
            "confidence": round(top_prob * 100, 1),
            "diagnosis_type": diagnosis_type,
            "top_predictions": [
                {"disease": d, "probability": round(p * 100, 1)}
                for d, p in predictions[:5]
            ],
            "confirmed_symptoms": [s.replace("_", " ") for s in confirmed_symptoms],
            "followups_asked": followup_count,
            "followup_log": followup_log,
            "disease_info": disease_info,
        }
        reply = _format_diagnosis_reply(result)
        add_turn(session_id, "assistant", reply, metadata={"risk_level": risk_result["risk_level"]})

        return {
            "reply": reply,
            "risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
            "suggested_action": risk_result["suggested_action"],
            "follow_up_suggested": False,
            "ml_diagnosis": result,
        }

    # Find next follow-up
    best_symptom, info_gain = _engine.find_best_followup(
        symptom_vector, asked_symptoms, predictions
    )

    if best_symptom is None:
        # No more useful questions — give best guess
        _clear_session(session_id)

        top_disease, top_prob = predictions[0]
        disease_info = _engine.get_disease_info(top_disease)

        result = {
            "diagnosis": top_disease,
            "confidence": round(top_prob * 100, 1),
            "diagnosis_type": "best_guess",
            "top_predictions": [
                {"disease": d, "probability": round(p * 100, 1)}
                for d, p in predictions[:5]
            ],
            "confirmed_symptoms": [s.replace("_", " ") for s in confirmed_symptoms],
            "followups_asked": followup_count,
            "followup_log": followup_log,
            "disease_info": disease_info,
        }
        reply = _format_diagnosis_reply(result)
        add_turn(session_id, "assistant", reply, metadata={"risk_level": risk_result["risk_level"]})

        return {
            "reply": reply,
            "risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
            "suggested_action": risk_result["suggested_action"],
            "follow_up_suggested": False,
            "ml_diagnosis": result,
        }

    # Save updated session
    session["symptom_vector"] = symptom_vector.tolist()
    session["confirmed_symptoms"] = confirmed_symptoms
    session["asked_symptoms"] = list(asked_symptoms)
    session["predictions"] = predictions
    session["followup_count"] = followup_count + 1
    session["followup_log"] = followup_log
    session["current_followup_symptom"] = best_symptom
    session["current_info_gain"] = info_gain
    _set_session(session_id, session)

    # Return next question
    reply = _format_followup_question(
        _engine.display_symptom(best_symptom), followup_count + 1
    )
    add_turn(session_id, "assistant", reply, metadata={"risk_level": risk_result["risk_level"]})

    return {
        "reply": reply,
        "risk_score": risk_result["risk_score"],
        "risk_level": risk_result["risk_level"],
        "suggested_action": risk_result["suggested_action"],
        "follow_up_suggested": True,
        "follow_up_question": _engine.display_symptom(best_symptom),
    }
