"""
ML Diagnostic Engine – Pure Machine Learning
==============================================
All diagnostic intelligence without any LLM/GPT dependency.

Key ML components:
  1. Information Gain Follow-ups: Entropy-based symptom selection
  2. Confidence Scoring: Probability gap analysis
  3. Early Exit Logic: Skip follow-ups when confident
  4. Symptom Importance Ranking: Per-disease feature analysis

This module is designed to be the core contribution for a research paper
on ML-based medical diagnosis systems.
"""

import numpy as np
import pandas as pd
import json
import os
import joblib
from scipy.stats import entropy


# ── Configuration ────────────────────────────────────────────────────────
CONFIDENCE_THRESHOLD = 0.55       # Min probability for confident diagnosis
CONFIDENCE_GAP_THRESHOLD = 0.15   # Min gap between top-1 and top-2
MAX_FOLLOWUPS = 5                 # Max follow-up questions
MIN_ENTROPY_REDUCTION = 0.01     # Min entropy reduction to justify a question


class MLDiagnosticEngine:
    """
    Pure ML diagnostic engine for symptom-based disease prediction.
    
    Uses information gain (entropy reduction) to select the most 
    discriminative follow-up symptom at each step.
    """

    def __init__(self, model_dir: str, data_dir: str):
        # Load trained models
        self.ensemble = joblib.load(os.path.join(model_dir, "ensemble.pkl"))
        self.label_encoder = joblib.load(os.path.join(model_dir, "label_encoder.pkl"))

        with open(os.path.join(model_dir, "metadata.json")) as f:
            metadata = json.load(f)
        self.symptom_columns = metadata["symptom_columns"]
        self.n_symptoms = len(self.symptom_columns)

        # Load encoded data for disease-symptom mapping
        df_encoded = pd.read_csv(os.path.join(data_dir, "dataset_encoded.csv"))

        # Build disease → symptom probability map
        # P(symptom | disease) = fraction of samples with that symptom
        self.disease_symptom_probs: dict[str, dict[str, float]] = {}
        for disease in df_encoded["Disease"].unique():
            disease_rows = df_encoded[df_encoded["Disease"] == disease]
            probs = {}
            for col in self.symptom_columns:
                probs[col] = disease_rows[col].mean()
            self.disease_symptom_probs[disease] = probs

        # Build canonical symptom sets
        self.disease_symptoms: dict[str, set[str]] = {}
        for disease, probs in self.disease_symptom_probs.items():
            self.disease_symptoms[disease] = {
                s for s, p in probs.items() if p > 0.3
            }

        # Load severity weights
        try:
            df_sev = pd.read_csv(os.path.join(data_dir, "symptom_severity_cleaned.csv"))
            self.severity_map = dict(zip(df_sev["Symptom"], df_sev["weight"]))
        except:
            self.severity_map = {}

        # Load disease descriptions
        try:
            df_desc = pd.read_csv(os.path.join(data_dir, "symptom_description_cleaned.csv"))
            self.disease_descriptions = dict(zip(df_desc["Disease"], df_desc["Description"]))
        except:
            self.disease_descriptions = {}

        # Load precautions
        try:
            df_prec = pd.read_csv(os.path.join(data_dir, "symptom_precaution_cleaned.csv"))
            self.disease_precautions = {}
            for _, row in df_prec.iterrows():
                precs = [row[f"Precaution_{i}"] for i in range(1, 5)
                         if pd.notna(row.get(f"Precaution_{i}", None))]
                self.disease_precautions[row["Disease"]] = precs
        except:
            self.disease_precautions = {}

    # ═══════════════════════════════════════════════════════════════════════
    # PREDICTION
    # ═══════════════════════════════════════════════════════════════════════
    def predict(self, symptom_vector: np.ndarray, top_n: int = 5) -> list[tuple[str, float]]:
        """Run ensemble model, return top-N (disease, probability) pairs."""
        probs = self.ensemble.predict_proba(symptom_vector.reshape(1, -1))[0]
        top_indices = np.argsort(probs)[::-1][:top_n]
        return [
            (self.label_encoder.inverse_transform([i])[0], float(probs[i]))
            for i in top_indices
        ]

    def build_symptom_vector(self, symptoms: list[str]) -> np.ndarray:
        """Convert symptom names to binary feature vector."""
        vec = np.zeros(self.n_symptoms, dtype=int)
        for s in symptoms:
            if s in self.symptom_columns:
                vec[self.symptom_columns.index(s)] = 1
        return vec

    # ═══════════════════════════════════════════════════════════════════════
    # CONFIDENCE ANALYSIS
    # ═══════════════════════════════════════════════════════════════════════
    def is_confident(self, predictions: list[tuple[str, float]]) -> bool:
        """
        Check if the model is confident enough for a diagnosis.
        
        Confident if:
          - Top prediction probability ≥ CONFIDENCE_THRESHOLD, AND
          - Gap between top-1 and top-2 ≥ CONFIDENCE_GAP_THRESHOLD
        """
        if not predictions or len(predictions) < 2:
            return predictions[0][1] >= CONFIDENCE_THRESHOLD if predictions else False

        top_prob = predictions[0][1]
        runner_prob = predictions[1][1]
        gap = top_prob - runner_prob

        return top_prob >= CONFIDENCE_THRESHOLD and gap >= CONFIDENCE_GAP_THRESHOLD

    def get_prediction_entropy(self, symptom_vector: np.ndarray) -> float:
        """Calculate Shannon entropy of the prediction distribution."""
        probs = self.ensemble.predict_proba(symptom_vector.reshape(1, -1))[0]
        # Filter out zeros to avoid log(0)
        probs = probs[probs > 0]
        return float(entropy(probs, base=2))

    # ═══════════════════════════════════════════════════════════════════════
    # INFORMATION GAIN FOLLOW-UP SELECTION
    # ═══════════════════════════════════════════════════════════════════════
    def find_best_followup(
        self,
        symptom_vector: np.ndarray,
        asked_symptoms: set[str],
        predictions: list[tuple[str, float]],
    ) -> tuple[str | None, float]:
        """
        Find the symptom with the highest INFORMATION GAIN.

        For each unchecked symptom s:
          1. Simulate: "What if patient says YES to s?"
             → new_vector_yes = vector with s = 1
             → entropy_yes = H(predictions | s=1)
          
          2. Simulate: "What if patient says NO to s?"
             → new_vector_no = vector unchanged (s stays 0)
             → entropy_no = H(predictions | s=0)
          
          3. Expected entropy reduction:
             P(s=1) * entropy_yes + P(s=0) * entropy_no
             
          4. Information gain = current_entropy - expected_entropy
          
        The symptom with the HIGHEST information gain is the best
        question to ask — it maximally reduces diagnostic uncertainty.
        
        Returns: (best_symptom_name, info_gain) or (None, 0.0)
        """
        current_entropy = self.get_prediction_entropy(symptom_vector)

        if current_entropy < 0.5:
            # Already very certain — no need to ask more
            return None, 0.0

        # Get candidate symptoms: unchecked, relevant to top diseases
        candidates = self._get_candidate_symptoms(symptom_vector, asked_symptoms, predictions)

        if not candidates:
            return None, 0.0

        best_symptom = None
        best_gain = 0.0

        for symptom in candidates:
            idx = self.symptom_columns.index(symptom)

            # Estimate P(symptom = 1) based on top predicted diseases
            p_yes = self._estimate_symptom_probability(symptom, predictions)
            p_no = 1.0 - p_yes

            # Simulate YES
            vec_yes = symptom_vector.copy()
            vec_yes[idx] = 1
            entropy_yes = self.get_prediction_entropy(vec_yes)

            # NO case: entropy stays the same (we already have s=0)
            entropy_no = current_entropy

            # Expected entropy after asking
            expected_entropy = p_yes * entropy_yes + p_no * entropy_no

            # Information gain
            info_gain = current_entropy - expected_entropy

            # Add severity bonus (prefer asking about severe symptoms)
            severity = self.severity_map.get(symptom, 3) / 7.0  # Normalize to 0-1
            weighted_gain = info_gain + 0.05 * severity

            if weighted_gain > best_gain:
                best_gain = weighted_gain
                best_symptom = symptom

        if best_gain < MIN_ENTROPY_REDUCTION:
            return None, 0.0

        return best_symptom, best_gain

    def _get_candidate_symptoms(
        self,
        symptom_vector: np.ndarray,
        asked_symptoms: set[str],
        predictions: list[tuple[str, float]],
    ) -> list[str]:
        """Get candidate symptoms to ask about — relevant to top diseases."""
        already_known = set()
        for i, col in enumerate(self.symptom_columns):
            if symptom_vector[i] == 1:
                already_known.add(col)
        already_known |= asked_symptoms

        # Gather symptoms from top-3 predicted diseases
        relevant_symptoms = set()
        for disease, prob in predictions[:3]:
            if prob > 0.05:  # Only consider diseases with >5% probability
                relevant_symptoms |= self.disease_symptoms.get(disease, set())

        # Candidates = relevant but not yet known
        candidates = list(relevant_symptoms - already_known)
        return candidates

    def _estimate_symptom_probability(
        self, symptom: str, predictions: list[tuple[str, float]]
    ) -> float:
        """Estimate P(symptom = 1) based on current disease predictions."""
        p_symptom = 0.0
        total_prob = sum(p for _, p in predictions[:5])
        if total_prob == 0:
            return 0.5

        for disease, prob in predictions[:5]:
            disease_probs = self.disease_symptom_probs.get(disease, {})
            p_symptom += (prob / total_prob) * disease_probs.get(symptom, 0.0)

        return max(0.1, min(0.9, p_symptom))  # Clamp to avoid 0/1

    # ═══════════════════════════════════════════════════════════════════════
    # DISEASE INFORMATION
    # ═══════════════════════════════════════════════════════════════════════
    def get_disease_info(self, disease: str) -> dict:
        """Get description and precautions for a disease."""
        return {
            "disease": disease,
            "description": self.disease_descriptions.get(disease, ""),
            "precautions": self.disease_precautions.get(disease, []),
            "symptoms": [s.replace("_", " ") for s in self.disease_symptoms.get(disease, set())],
        }

    def display_symptom(self, symptom: str) -> str:
        """Convert symptom_name to 'Symptom Name' for display."""
        return symptom.replace("_", " ").title()

    # ═══════════════════════════════════════════════════════════════════════
    # FULL DIAGNOSTIC SESSION
    # ═══════════════════════════════════════════════════════════════════════
    def run_diagnosis(
        self,
        initial_symptoms: list[str],
        ask_followup_fn=None,
    ) -> dict:
        """
        Run a complete diagnostic session.
        
        Args:
            initial_symptoms: List of symptom names extracted from user input
            ask_followup_fn: Callback function(symptom_display_name) -> bool
                            Returns True if patient confirms symptom
        
        Returns:
            dict with diagnosis results, confidence, symptoms used, etc.
        """
        # Build initial vector
        confirmed_symptoms = list(set(initial_symptoms))
        symptom_vector = self.build_symptom_vector(confirmed_symptoms)
        asked_symptoms = set(initial_symptoms)

        # Initial prediction
        predictions = self.predict(symptom_vector)
        followups_asked = 0
        followup_log = []

        # Check if already confident
        if self.is_confident(predictions):
            return self._build_result(
                predictions, confirmed_symptoms, followups_asked, followup_log,
                "direct"
            )

        # Follow-up loop (pure ML — no GPT involved)
        while followups_asked < MAX_FOLLOWUPS:
            best_symptom, info_gain = self.find_best_followup(
                symptom_vector, asked_symptoms, predictions
            )

            if best_symptom is None:
                break

            followups_asked += 1
            asked_symptoms.add(best_symptom)

            # Ask the patient (via callback)
            display_name = self.display_symptom(best_symptom)
            confirmed = ask_followup_fn(display_name) if ask_followup_fn else False

            followup_log.append({
                "symptom": best_symptom,
                "display": display_name,
                "confirmed": confirmed,
                "info_gain": round(info_gain, 4),
                "turn": followups_asked,
            })

            if confirmed:
                idx = self.symptom_columns.index(best_symptom)
                symptom_vector[idx] = 1
                confirmed_symptoms.append(best_symptom)

            # Re-predict
            predictions = self.predict(symptom_vector)

            if self.is_confident(predictions):
                break

        diagnosis_type = "confident" if self.is_confident(predictions) else "best_guess"
        return self._build_result(
            predictions, confirmed_symptoms, followups_asked, followup_log,
            diagnosis_type
        )

    def _build_result(
        self, predictions, confirmed_symptoms, followups_asked, followup_log, diagnosis_type
    ) -> dict:
        """Build the diagnosis result dictionary."""
        top_disease, top_prob = predictions[0]
        disease_info = self.get_disease_info(top_disease)

        return {
            "diagnosis": top_disease,
            "confidence": round(top_prob * 100, 1),
            "diagnosis_type": diagnosis_type,
            "top_predictions": [
                {"disease": d, "probability": round(p * 100, 1)}
                for d, p in predictions[:5]
            ],
            "confirmed_symptoms": [s.replace("_", " ") for s in confirmed_symptoms],
            "followups_asked": followups_asked,
            "followup_log": followup_log,
            "disease_info": disease_info,
        }
