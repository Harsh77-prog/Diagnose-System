"""
ML-Powered Diagnosis System
============================
Integrates BioBERT symptom extraction, ML diagnostic engine, and session management
for a complete diagnostic experience.
"""

import os
import json
import logging
from typing import Any, Optional

from config import MEDCORE_LOW_MEMORY_MODE, SYMPTOM_EMBEDDING_ENABLED

LOGGER = logging.getLogger("medcore.diagnose_ml")

# ── Paths ────────────────────────────────────────────────────────────────────
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.join(BACKEND_DIR, "medical_ML")
MODEL_DIR = os.path.join(PROJECT_DIR, "models")
DATA_DIR = os.path.join(PROJECT_DIR, "data")

# ── Initialize ML Components ────────────────────────────────────────────────
_engine = None
_extractor = None

def _init_ml_components():
    """Lazy initialization of ML components."""
    global _engine, _extractor
    if _engine is not None and _extractor is not None:
        return
    
    try:
        import sys
        sys.path.insert(0, PROJECT_DIR)
        
        from ml_engine import MLDiagnosticEngine
        from symptom_extractor import BioBERTSymptomExtractor
        
        LOGGER.info("Initializing ML Diagnostic Engine...")
        _engine = MLDiagnosticEngine(model_dir=MODEL_DIR, data_dir=DATA_DIR)
        
        with open(os.path.join(MODEL_DIR, "metadata.json")) as f:
            metadata = json.load(f)
        
        extractor_mode = "biobert" if SYMPTOM_EMBEDDING_ENABLED else "rule-based"
        LOGGER.info(
            "Initializing symptom extractor | mode=%s | low_memory=%s",
            extractor_mode,
            MEDCORE_LOW_MEMORY_MODE,
        )
        _extractor = BioBERTSymptomExtractor(
            model_dir=MODEL_DIR,
            symptom_columns=metadata["symptom_columns"],
            enable_embeddings=SYMPTOM_EMBEDDING_ENABLED,
        )
        
        LOGGER.info("✓ ML components initialized successfully")
    except Exception as e:
        LOGGER.error(f"Failed to initialize ML components: {e}")
        raise

# ── Session Management ──────────────────────────────────────────────────────
_sessions: dict[str, dict] = {}

def _get_session(session_id: str) -> Optional[dict]:
    """Get session data for a user."""
    return _sessions.get(session_id)

def _set_session(session_id: str, session: dict):
    """Save session data for a user."""
    _sessions[session_id] = session

def _clear_session(session_id: str):
    """Clear session data for a user."""
    if session_id in _sessions:
        del _sessions[session_id]

# ── Conversation History ────────────────────────────────────────────────────
_conversation_history: dict[str, list[dict]] = {}

def add_turn(session_id: str, role: str, content: str, metadata: Optional[dict] = None):
    """Add a turn to the conversation history."""
    if session_id not in _conversation_history:
        _conversation_history[session_id] = []
    
    turn = {
        "role": role,
        "content": content,
        "metadata": metadata or {}
    }
    _conversation_history[session_id].append(turn)
    
    # Limit history size
    if len(_conversation_history[session_id]) > 50:
        _conversation_history[session_id] = _conversation_history[session_id][-50:]

def get_history(session_id: str) -> list[dict]:
    """Get conversation history for a session."""
    return _conversation_history.get(session_id, [])


# ── Response Formatting ─────────────────────────────────────────────────────
def _format_followup_question(symptom_display: str, question_num: int) -> str:
    """Format a follow-up question for display."""
    return (
        f"**Question {question_num}:** Do you have {symptom_display.lower()}? "
        f"(yes/no)\n\n"
        f"*Reason: This helps narrow down the possible conditions.*"
    )


def _format_diagnosis_reply(result: dict) -> str:
    """Format the final diagnosis result for display."""
    diagnosis = result.get("diagnosis", "Unknown")
    confidence = result.get("confidence", 0)
    dtype = result.get("diagnosis_type", "best_guess")
    
    lines = []
    
    # Diagnosis header
    if dtype == "direct" or dtype == "confident":
        lines.append(f"**Likely Condition:** {diagnosis}")
        lines.append(f"**Confidence:** {confidence}%")
    else:
        lines.append(f"**Possible Condition:** {diagnosis}")
        lines.append(f"**Confidence:** {confidence}% (Low - please consult a doctor)")
    
    # Symptoms identified
    symptoms = result.get("confirmed_symptoms", [])
    if symptoms:
        lines.append(f"\n**Symptoms Identified:** {len(symptoms)}")
        for s in symptoms:
            lines.append(f"  • {s.title()}")
    
    # Top predictions
    top_preds = result.get("top_predictions", [])
    if top_preds:
        lines.append(f"\n**Differential Diagnosis:**")
        for i, pred in enumerate(top_preds[:5], 1):
            lines.append(f"  {i}. {pred['disease']} ({pred['probability']}%)")
    
    # Disease info
    disease_info = result.get("disease_info", {})
    if disease_info and disease_info.get("description"):
        desc = disease_info["description"]
        if len(desc) > 300:
            desc = desc[:300] + "..."
        lines.append(f"\n**About {diagnosis}:** {desc}")
    
    # Precautions
    precautions = disease_info.get("precautions", [])
    if precautions:
        lines.append(f"\n**Self-Care Steps:**")
        for i, p in enumerate(precautions[:4], 1):
            lines.append(f"  {i}. {p}")
    
    # Disclaimer
    lines.append(f"\n*⚠️ This is for informational purposes only. Always consult a qualified healthcare professional.*")
    
    return "\n".join(lines)


def _format_symptoms_display(symptoms: list[str]) -> str:
    """Format extracted symptoms for display."""
    if not symptoms:
        return "None yet"
    return ", ".join(s.replace("_", " ").title() for s in symptoms)


# ── Image Model Selection ───────────────────────────────────────────────────
def _get_relevant_datasets_for_symptoms(symptoms: list[str]) -> list[str]:
    """
    Determine which MedMNIST datasets are relevant based on extracted symptoms.
    This ensures we use the correct image model for the medical condition.
    """
    # Map symptoms to relevant datasets
    symptom_str = " ".join(symptoms).lower()
    
    dataset_mapping = {
        # Dermamnist - skin conditions
        "dermamnist": [
            "rash", "skin", "itch", "pimple", "acne", "mole", "lesion",
            "spot", "bump", "blister", "eczema", "psoriasis", "dermatitis",
            "skin_rash", "itching", "pus_filled_pimples", "blackheads",
            "nodal_skin_eruptions", "skin_peeling", "dischromic_patches",
            "yellowish_skin", "blister", "silver_like_dusting"
        ],
        # Retinamnist - eye conditions
        "retinamnist": [
            "eye", "vision", "blurry", "red eyes", "watery", "yellowing",
            "blurred_and_distorted_vision", "redness_of_eyes", "watering_from_eyes",
            "yellowing_of_eyes", "pain_behind_the_eyes"
        ],
        # Chestmnist - respiratory/chest conditions
        "chestmnist": [
            "cough", "breath", "chest", "lung", "pneumonia", "respiratory",
            "sputum", "phlegm", "breathlessness", "chest_pain",
            "continuous_sneezing", "runny_nose", "throat_irritation",
            "blood_in_sputum", "rusty_sputum", "mucoid_sputum"
        ],
        # Pathmnist - tissue/pathology
        "pathmnist": [
            "tissue", "biopsy", "tumor", "cancer", "growth", "mass",
            "swelling", "lump", "node", "lymph"
        ],
        # Bloodmnist - blood conditions
        "bloodmnist": [
            "blood", "anemia", "bleeding", "bruise", "hemoglobin",
            "bloody_stool", "blood_in_sputum", "anemia", "iron"
        ],
        # OrganAMNIST / OrganCMNIST / OrganSMNIST - organ-specific
        "organmnist": [
            "liver", "kidney", "stomach", "abdomen", "organ",
            "hepatitis", "jaundice", "cirrhosis", "renal", "gastric"
        ]
    }
    
    relevant_datasets = []
    
    for dataset, keywords in dataset_mapping.items():
        for keyword in keywords:
            if keyword in symptom_str:
                relevant_datasets.append(dataset)
                break
    
    # If no specific dataset matches, return all for comprehensive analysis
    if not relevant_datasets:
        relevant_datasets = ["dermamnist", "chestmnist", "retinamnist", "pathmnist", "bloodmnist"]
    
    return relevant_datasets


# ── Main Diagnosis Functions ────────────────────────────────────────────────
def run_ml_diagnose(
    user_id: str,
    user_message: str,
    session_action: Optional[str] = None,
    image_prediction: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Main diagnosis function that handles both new diagnoses and follow-ups.
    
    Args:
        user_id: Unique user identifier
        user_message: User's symptom description or follow-up answer
        session_action: "yes"/"no" for follow-up questions
        image_prediction: Optional image analysis results
    
    Returns:
        Dictionary with diagnosis results and reply
    """
    # Initialize ML components if needed
    _init_ml_components()
    
    session_id = user_id  # Use user_id as session_id for simplicity
    
    # Risk scoring placeholder
    risk_result = {
        "risk_score": 0.1,
        "risk_level": "Low",
        "suggested_action": "Monitor symptoms.",
    }
    
    # Check if this is a follow-up or new diagnosis
    session = _get_session(session_id)
    
    if session and session_action is not None:
        # Continue existing follow-up session
        confirmed = session_action.lower() in ("yes", "y", "yeah", "yep", "true", "1")
        result = _continue_followup(session_id, session, confirmed, risk_result, image_prediction)
    else:
        # Start new diagnosis
        result = _start_new_diagnosis(session_id, user_message, risk_result, image_prediction)
    
    return result


def _start_new_diagnosis(
    session_id: str,
    user_message: str,
    risk_result: dict,
    image_prediction: Optional[dict[str, Any]] = None,
    report_prediction: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Extract symptoms, predict, and either return diagnosis or first follow-up."""
    # Clear any previous session
    _clear_session(session_id)
    
    # Step 1: BioBERT extracts symptoms from user's natural language description
    extracted = _extractor.extract_symptoms(user_message)
    
    # Step 1b: Extract symptoms from report if provided
    report_symptoms = []
    report_summary = ""
    if report_prediction and "symptoms" in report_prediction:
        report_symptoms = report_prediction.get("symptoms", [])
        report_summary = report_prediction.get("summary", "")
    
    # Combine symptoms from text and report
    all_symptoms = list(set(extracted + report_symptoms))
    
    # Use combined symptoms for display, but original extracted for BioBERT processing
    display_symptoms = all_symptoms if all_symptoms else extracted
    
    if not display_symptoms:
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
            "symptoms_identified": [],
        }
    
    # Persist user message
    add_turn(session_id, "user", user_message)
    
    # Step 2: Build symptom vector and predict using combined symptoms
    symptom_vector = _engine.build_symptom_vector(display_symptoms)
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
            "symptoms_identified": extracted,
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
            "symptoms_identified": extracted,
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
        "extracted_symptoms": extracted,
    }
    _set_session(session_id, session)
    
    # Build initial info + follow-up question
    symptom_names = _format_symptoms_display(extracted)
    top_pred = predictions[0]
    intro = (
        f"**Symptoms identified so far:** {symptom_names}\n\n"
        f"**Initial prediction:** {top_pred[0]} ({top_pred[1]*100:.1f}% confidence)\n\n"
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
        "symptoms_identified": extracted,
    }


def _continue_followup(
    session_id: str,
    session: dict,
    confirmed: bool,
    risk_result: dict,
    image_prediction: Optional[dict[str, Any]] = None,
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
    extracted_symptoms = session.get("extracted_symptoms", [])
    
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
    if _engine.is_confident(predictions) or followup_count >= 10:
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
        
        # Merge image predictions if available
        if image_prediction and "per_dataset" in image_prediction:
            result = _merge_image_predictions(result, image_prediction)
        
        reply = _format_diagnosis_reply(result)
        add_turn(session_id, "assistant", reply, metadata={"risk_level": risk_result["risk_level"]})
        
        return {
            "reply": reply,
            "risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
            "suggested_action": risk_result["suggested_action"],
            "follow_up_suggested": False,
            "ml_diagnosis": result,
            "symptoms_identified": extracted_symptoms,
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
        
        # Merge image predictions if available
        if image_prediction and "per_dataset" in image_prediction:
            result = _merge_image_predictions(result, image_prediction)
        
        reply = _format_diagnosis_reply(result)
        add_turn(session_id, "assistant", reply, metadata={"risk_level": risk_result["risk_level"]})
        
        return {
            "reply": reply,
            "risk_score": risk_result["risk_score"],
            "risk_level": risk_result["risk_level"],
            "suggested_action": risk_result["suggested_action"],
            "follow_up_suggested": False,
            "ml_diagnosis": result,
            "symptoms_identified": extracted_symptoms,
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
        "symptoms_identified": extracted_symptoms,
    }


def _merge_image_predictions(
    diagnosis_result: dict,
    image_prediction: dict[str, Any],
) -> dict:
    """
    Merge image model predictions into the diagnosis result.
    Uses context-aware weighting based on extracted symptoms.
    """
    combined_preds = []
    
    # Start with existing ML predictions
    ml_preds = diagnosis_result.get("top_predictions", [])
    for pred in ml_preds:
        combined_preds.append({
            "disease": pred["disease"],
            "probability": pred["probability"],
            "source": "ML Model (Symptoms)"
        })
    
    # Add image predictions with context weighting
    for ds_res in image_prediction.get("per_dataset", []):
        # Apply context-aware weighting
        weight = _calculate_image_weight(ds_res["dataset"], diagnosis_result)
        weighted_prob = ds_res["top_confidence"] * weight
        
        combined_preds.append({
            "disease": ds_res["top_label_name"],
            "probability": round(weighted_prob, 1),
            "source": f"Image Model ({ds_res['dataset']})"
        })
    
    # Sort by highest probability
    combined_preds.sort(key=lambda x: x["probability"], reverse=True)
    final_top = combined_preds[:8]
    
    # Update result with merged predictions
    diagnosis_result["top_predictions"] = final_top
    
    # Update diagnosis if image model is more confident
    if final_top:
        top_pred = final_top[0]
        diagnosis_result["diagnosis"] = top_pred["disease"]
        diagnosis_result["confidence"] = top_pred["probability"]
        diagnosis_result["disease_info"] = _engine.get_disease_info(top_pred["disease"])
    
    return diagnosis_result


def _calculate_image_weight(dataset: str, diagnosis_result: dict) -> float:
    """
    Calculate context-aware weight for image predictions.
    Returns higher weight if the dataset is relevant to the symptoms.
    """
    symptoms = diagnosis_result.get("confirmed_symptoms", [])
    relevant_datasets = _get_relevant_datasets_for_symptoms(symptoms)
    
    # If the dataset is relevant to the symptoms, use full confidence
    if dataset in relevant_datasets:
        return 1.0
    
    # If not directly relevant, reduce weight
    return 0.5


def get_recommended_datasets(symptoms: list[str]) -> list[str]:
    """
    Get recommended MedMNIST datasets based on symptoms.
    This helps the frontend select the right image models.
    """
    return _get_relevant_datasets_for_symptoms(symptoms)
