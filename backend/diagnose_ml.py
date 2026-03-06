from typing import Any, Optional
def run_ml_diagnose(
    user_id: str,
    user_message: str,
    session_action: Optional[str] = None,
    image_prediction: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    # Placeholder for risk scoring and session logic
    risk_result = {
        "risk_score": 0.1,
        "risk_level": "Low",
        "suggested_action": "Monitor symptoms.",
    }
    
    # Run the base ML diagnosis
    result = _start_new_diagnosis(user_id, user_message, risk_result)
    
    # MERGE LOGIC: Combine image predictions into the probability chart
    if image_prediction and "per_dataset" in image_prediction:
        combined_preds = []
        
        # Check if we have an existing ML diagnosis result to merge into
        if "ml_diagnosis" in result:
            combined_preds = result["ml_diagnosis"].get("top_predictions", [])
        
        for ds_res in image_prediction["per_dataset"]:
            combined_preds.append({
                "disease": ds_res["top_label_name"],
                "probability": ds_res["top_confidence"],
                "source": f"Image Model ({ds_res['dataset']})"
            })
        
        # Sort by highest probability
        combined_preds.sort(key=lambda x: x["probability"], reverse=True)
        final_top = combined_preds[:8]
        
        # Update result with merged predictions
        result["top_predictions"] = final_top
        
        # Update Likely Condition if image model is more confident
        top_pred = final_top[0]
        result["diagnosis"] = top_pred["disease"]
        result["confidence"] = top_pred["probability"]
        
        # Update Info/Precautions if it matches a known disease in our engine
        if "ml_diagnosis" in result:
            result["ml_diagnosis"]["diagnosis"] = top_pred["disease"]
            result["ml_diagnosis"]["confidence"] = top_pred["probability"]
            result["ml_diagnosis"]["top_predictions"] = final_top
            result["ml_diagnosis"]["disease_info"] = _engine.get_disease_info(top_pred["disease"])
            # Update the reply based on the new diagnosis
            result["reply"] = _format_diagnosis_reply(result["ml_diagnosis"])
        
    return result
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