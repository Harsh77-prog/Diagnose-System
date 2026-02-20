

import os
import json
import numpy as np
from ml_engine import MLDiagnosticEngine
from symptom_extractor import BioBERTSymptomExtractor

# ── Paths ────────────────────────────────────────────────────────────────
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(PROJECT_DIR, "models")
DATA_DIR = os.path.join(PROJECT_DIR, "data")

# ── Initialize ML Components ────────────────────────────────────────────
print("\n  🔧 Initializing ML system...")
engine = MLDiagnosticEngine(model_dir=MODEL_DIR, data_dir=DATA_DIR)

with open(os.path.join(MODEL_DIR, "metadata.json")) as f:
    metadata = json.load(f)

extractor = BioBERTSymptomExtractor(
    model_dir=MODEL_DIR,
    symptom_columns=metadata["symptom_columns"]
)
print("  ✓ System ready (100% ML — no API keys needed)\n")


# ═══════════════════════════════════════════════════════════════════════════
# DISPLAY HELPERS
# ═══════════════════════════════════════════════════════════════════════════
def display_symptom(symptom: str) -> str:
    """Convert symptom_name to 'Symptom Name'."""
    return symptom.replace("_", " ").title()


def print_diagnosis_report(result: dict):
    """Print a detailed diagnosis report from ML engine result."""
    print("\n" + "=" * 60)
    print("  🏥  DIAGNOSIS REPORT")
    print("=" * 60)

    diagnosis = result["diagnosis"]
    confidence = result["confidence"]
    dtype = result["diagnosis_type"]

    if dtype == "direct":
        print(f"\n  ✅ DIAGNOSIS: {diagnosis}")
        print(f"     Confidence: {confidence}%")
        print(f"     (Direct match — no follow-up questions needed)")
    elif dtype == "confident":
        print(f"\n  ✅ DIAGNOSIS: {diagnosis}")
        print(f"     Confidence: {confidence}%")
        print(f"     (Confirmed after {result['followups_asked']} follow-up questions)")
    else:
        print(f"\n  ⚠️  BEST GUESS: {diagnosis}")
        print(f"     Confidence: {confidence}%")
        print(f"     (Low confidence — please consult a doctor)")

    # Top predictions bar chart
    print(f"\n  📊 Top Predictions:")
    for i, pred in enumerate(result["top_predictions"][:5], 1):
        bar_len = int(pred["probability"] / 2)
        bar = "█" * bar_len + "░" * (50 - bar_len)
        marker = " ◄" if i == 1 else ""
        print(f"     {i}. {pred['disease']:<35} {pred['probability']:>5.1f}% {bar}{marker}")

    # Symptoms
    print(f"\n  🩺 Symptoms identified: {len(result['confirmed_symptoms'])}")
    for s in result["confirmed_symptoms"]:
        print(f"     • {s.replace('_', ' ').title()}")

    # Follow-up log
    if result["followup_log"]:
        print(f"\n  🔎 Follow-up questions ({result['followups_asked']}):")
        for fu in result["followup_log"]:
            status = "✓ Yes" if fu["confirmed"] else "✗ No"
            print(f"     {fu['turn']}. {fu['display']:<30} [{status}]  "
                  f"(info gain: {fu['info_gain']:.4f})")

    # Disease info
    info = result["disease_info"]
    if info["description"]:
        print(f"\n  📖 About {diagnosis}:")
        words = info["description"].split()
        line = "     "
        for word in words:
            if len(line) + len(word) + 1 > 75:
                print(line)
                line = "     " + word
            else:
                line += " " + word if line.strip() else "     " + word
        if line.strip():
            print(line)

    if info["precautions"]:
        print(f"\n  💊 Precautions:")
        for i, p in enumerate(info["precautions"], 1):
            print(f"     {i}. {p}")

    print("\n  ⚕️  DISCLAIMER: This is for informational purposes only.")
    print("     Always consult a qualified healthcare professional.")
    print("=" * 60)


# ═══════════════════════════════════════════════════════════════════════════
# MAIN CHATBOT LOOP
# ═══════════════════════════════════════════════════════════════════════════
def main():
    print("=" * 60)
    print("  🏥  Medical Symptom Checker (100% ML-Powered)  🏥")
    print("=" * 60)
    print("  Describe your symptoms in natural language.")
    print("  Powered by BioBERT + ML Ensemble — no API needed!")
    print()
    print("  💡 Tips:")
    print("     • Describe how you feel naturally")
    print("     • Example: 'I have a headache and feel tired'")
    print("     • Type 'quit' to exit")
    print()

    while True:
        print("\n  💬 Describe your symptoms (or type 'quit'):")
        user_input = input("  > ").strip()

        if user_input.lower() in ("quit", "exit", "q"):
            print("\n  👋 Goodbye! Stay healthy!")
            break

        if not user_input:
            continue

        # ── Step 1: BioBERT extracts symptoms (offline NLP) ──────────
        print("\n  🔍 Extracting symptoms with BioBERT...")
        extracted = extractor.extract_symptoms(user_input)

        if not extracted:
            print("  ❌ Could not identify any symptoms from your description.")
            print("  Try describing what you're feeling more specifically.")
            print("  Examples: 'I have a headache and fever'")
            print("           'my skin is itchy and I feel tired'")
            continue

        print(f"  ✓ BioBERT identified {len(extracted)} symptom(s): "
              f"{', '.join(display_symptom(s) for s in extracted)}")

        # ── Step 2: ML initial prediction ────────────────────────────
        symptom_vector = engine.build_symptom_vector(extracted)
        initial_predictions = engine.predict(symptom_vector)

        print(f"\n  🤖 ML Initial Prediction: {initial_predictions[0][0]} "
              f"({initial_predictions[0][1]*100:.1f}%)")

        # ── Step 3: Check if already confident ───────────────────────
        if engine.is_confident(initial_predictions):
            print("  ✅ High confidence — skipping follow-ups!")
            result = engine.run_diagnosis(extracted)
            print_diagnosis_report(result)
            continue

        print(f"  ⚠ Confidence too low ({initial_predictions[0][1]*100:.1f}%), "
              f"asking follow-up questions...")

        # ── Step 4: ML follow-ups (information gain) ─────────────────
        def ask_followup(symptom_display: str) -> bool:
            """Callback: ask patient about a symptom."""
            while True:
                print(f"\n  ❓ Are you experiencing {symptom_display.lower()}? (yes/no)")
                answer = input("  > ").strip().lower()

                if answer in ("yes", "y", "yeah", "yep", "true", "1"):
                    return True
                elif answer in ("no", "n", "nah", "nope", "false", "0"):
                    return False
                else:
                    print("  Please answer yes or no.")

        result = engine.run_diagnosis(extracted, ask_followup_fn=ask_followup)

        # ── Step 5: Display results ──────────────────────────────────
        print_diagnosis_report(result)


if __name__ == "__main__":
    main()
