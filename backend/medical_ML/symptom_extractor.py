"""
NLP BioBERT Model for symptom extraction
"""

import os
import json
import re
import pickle
import numpy as np
import torch
from transformers import AutoTokenizer, AutoModel


class BioBERTSymptomExtractor:
    """
    Extract medical symptoms from natural language using BioBERT embeddings.
    
    Three-stage pipeline:
      1. Direct symptom name matching
      2. Phrase mapping (natural language → symptom_column)
      3. BioBERT cosine similarity for remaining phrases
    """

    # BioBERT threshold — lowered for better natural language coverage
    SIMILARITY_THRESHOLD = 0.85

    def __init__(self, model_dir: str, symptom_columns: list[str]):
        self.symptom_columns = symptom_columns
        self.symptom_set = set(symptom_columns)
        self.model_dir = model_dir
        self.cache_path = os.path.join(model_dir, "symptom_embeddings.pkl")

        # ── Comprehensive phrase → symptom mappings ──────────────────
        self.phrase_mappings = {
            # Pain
            "head hurts": "headache", "head pain": "headache",
            "headache": "headache", "my head hurts": "headache",
            "head is paining": "headache", "head is aching": "headache",
            "stomach hurts": "stomach_pain", "stomach ache": "stomach_pain",
            "stomach pain": "stomach_pain", "tummy ache": "stomach_pain",
            "stomach is paining": "stomach_pain",
            "belly hurts": "belly_pain", "belly pain": "belly_pain",
            "abdominal pain": "abdominal_pain", "abdomen pain": "abdominal_pain",
            "pain in abdomen": "abdominal_pain", "tummy pain": "abdominal_pain",
            "back hurts": "back_pain", "back pain": "back_pain",
            "back ache": "back_pain", "lower back pain": "back_pain",
            "back is paining": "back_pain",
            "chest hurts": "chest_pain", "chest pain": "chest_pain",
            "chest tightness": "chest_pain", "pain in chest": "chest_pain",
            "joint hurts": "joint_pain", "joints hurt": "joint_pain",
            "joint pain": "joint_pain", "painful joints": "joint_pain",
            "joints are paining": "joint_pain", "pain in joints": "joint_pain",
            "knee hurts": "knee_pain", "knee pain": "knee_pain",
            "neck hurts": "neck_pain", "neck pain": "neck_pain",
            "stiff neck": "stiff_neck", "neck stiff": "stiff_neck",
            "muscle hurts": "muscle_pain", "muscle pain": "muscle_pain",
            "muscle ache": "muscle_pain", "body ache": "muscle_pain",
            "body pain": "muscle_pain", "muscles ache": "muscle_pain",
            "body is aching": "muscle_pain", "full body pain": "muscle_pain",
            "pain behind eyes": "pain_behind_the_eyes",
            "eyes hurt": "pain_behind_the_eyes",
            "pain in eyes": "pain_behind_the_eyes",
            "hip pain": "hip_joint_pain", "hip hurts": "hip_joint_pain",
            "painful walking": "painful_walking",
            "pain when walking": "painful_walking",

            # Fever & Temperature
            "fever": "high_fever", "high fever": "high_fever",
            "very high fever": "high_fever", "temperature": "high_fever",
            "have fever": "high_fever", "got fever": "high_fever",
            "feverish": "high_fever", "feeling feverish": "high_fever",
            "mild fever": "mild_fever", "slight fever": "mild_fever",
            "low grade fever": "mild_fever", "low fever": "mild_fever",
            "feeling cold": "chills", "feel cold": "chills",
            "chills": "chills", "cold chills": "chills",
            "shivering": "shivering", "shiver": "shivering",
            "sweating": "sweating", "sweat": "sweating",
            "night sweats": "sweating", "sweats a lot": "sweating",
            "sweating too much": "sweating", "excessive sweating": "sweating",

            # GI / Digestive
            "throwing up": "vomiting", "puking": "vomiting",
            "vomit": "vomiting", "vomiting": "vomiting",
            "feel like vomiting": "vomiting", "want to vomit": "vomiting",
            "nausea": "nausea", "nauseous": "nausea",
            "feel sick": "nausea", "feeling sick": "nausea",
            "feeling nauseous": "nausea", "feel nauseous": "nausea",
            "diarrhea": "diarrhoea", "diarrhoea": "diarrhoea",
            "loose stool": "diarrhoea", "loose motion": "diarrhoea",
            "loose motions": "diarrhoea", "watery stool": "diarrhoea",
            "runny stool": "diarrhoea",
            "constipation": "constipation", "constipated": "constipation",
            "hard stool": "constipation", "cant pass stool": "constipation",
            "no appetite": "loss_of_appetite", "not hungry": "loss_of_appetite",
            "lost appetite": "loss_of_appetite", "loss of appetite": "loss_of_appetite",
            "cant eat": "loss_of_appetite", "dont feel like eating": "loss_of_appetite",
            "not feeling hungry": "loss_of_appetite",
            "indigestion": "indigestion", "acidity": "acidity",
            "acid reflux": "acidity", "heartburn": "acidity",
            "gas": "passage_of_gases", "gastric": "passage_of_gases",
            "passing gas": "passage_of_gases", "gas problem": "passage_of_gases",
            "bloating": "distention_of_abdomen", "bloated": "distention_of_abdomen",
            "stomach bloated": "distention_of_abdomen",
            "blood in stool": "bloody_stool", "bloody stool": "bloody_stool",
            "stomach bleeding": "stomach_bleeding",
            "dehydrated": "dehydration", "dehydration": "dehydration",
            "dry mouth": "dehydration",

            # Respiratory
            "cough": "cough", "coughing": "cough", "dry cough": "cough",
            "keep coughing": "cough", "continuous cough": "cough",
            "cant breathe": "breathlessness",
            "shortness of breath": "breathlessness",
            "breathing difficulty": "breathlessness",
            "difficulty breathing": "breathlessness",
            "breathless": "breathlessness",
            "trouble breathing": "breathlessness",
            "hard to breathe": "breathlessness",
            "breathing problem": "breathlessness",
            "runny nose": "runny_nose", "nose running": "runny_nose",
            "nose is running": "runny_nose", "running nose": "runny_nose",
            "sneezing": "continuous_sneezing", "keep sneezing": "continuous_sneezing",
            "sneezing a lot": "continuous_sneezing",
            "phlegm": "phlegm", "mucus": "phlegm",
            "congestion": "congestion", "stuffy nose": "congestion",
            "nasal congestion": "congestion", "blocked nose": "congestion",
            "nose blocked": "congestion", "nose is blocked": "congestion",
            "sinus": "sinus_pressure", "sinus pressure": "sinus_pressure",
            "sore throat": "throat_irritation", "throat pain": "throat_irritation",
            "throat irritation": "throat_irritation",
            "throat hurts": "throat_irritation", "scratchy throat": "throat_irritation",
            "blood in sputum": "blood_in_sputum",
            "coughing blood": "blood_in_sputum",
            "rusty sputum": "rusty_sputum",
            "mucoid sputum": "mucoid_sputum",

            # Skin — GREATLY EXPANDED
            "rash": "skin_rash", "skin rash": "skin_rash",
            "rashes": "skin_rash", "rash on skin": "skin_rash",
            "rash on my skin": "skin_rash", "rash on body": "skin_rash",
            "skin problem": "skin_rash", "skin problems": "skin_rash",
            "skin issue": "skin_rash", "skin issues": "skin_rash",
            "skin infection": "skin_rash",
            "itching": "itching", "itchy": "itching", "itch": "itching",
            "itchy skin": "itching", "skin itching": "itching",
            "itching all over": "itching", "body itching": "itching",
            "skin is itchy": "itching", "feeling itchy": "itching",
            "scratching": "itching", "itchiness": "itching",
            "pimples": "pus_filled_pimples", "pimple": "pus_filled_pimples",
            "pimples on skin": "pus_filled_pimples",
            "pimples on my skin": "pus_filled_pimples",
            "pimples on face": "pus_filled_pimples",
            "pimples on my face": "pus_filled_pimples",
            "many pimples": "pus_filled_pimples",
            "pus pimples": "pus_filled_pimples",
            "pus filled": "pus_filled_pimples",
            "acne": "blackheads", "acne on face": "blackheads",
            "acne on skin": "blackheads", "acne problem": "blackheads",
            "blackheads": "blackheads", "black heads": "blackheads",
            "whiteheads": "blackheads",
            "bumps on skin": "nodal_skin_eruptions",
            "skin bumps": "nodal_skin_eruptions",
            "lumps on skin": "nodal_skin_eruptions",
            "skin lumps": "nodal_skin_eruptions",
            "skin eruptions": "nodal_skin_eruptions",
            "eruptions on skin": "nodal_skin_eruptions",
            "bumps": "nodal_skin_eruptions",
            "red spots": "red_spots_over_body",
            "red spots on body": "red_spots_over_body",
            "red spots on skin": "red_spots_over_body",
            "spots on skin": "red_spots_over_body",
            "spots on body": "red_spots_over_body",
            "spots on face": "red_spots_over_body",
            "spots on my face": "red_spots_over_body",
            "spots on my skin": "red_spots_over_body",
            "dark spots": "dischromic_patches",
            "patches on skin": "dischromic_patches",
            "skin patches": "dischromic_patches",
            "discolored skin": "dischromic_patches",
            "dark patches": "dischromic_patches",
            "skin discoloration": "dischromic_patches",
            "skin peeling": "skin_peeling", "peeling skin": "skin_peeling",
            "skin is peeling": "skin_peeling", "flaky skin": "skin_peeling",
            "dry skin": "skin_peeling", "scaly skin": "skin_peeling",
            "yellow skin": "yellowish_skin", "yellowish skin": "yellowish_skin",
            "skin turned yellow": "yellowish_skin", "skin is yellow": "yellowish_skin",
            "yellow eyes": "yellowing_of_eyes", "yellowing of eyes": "yellowing_of_eyes",
            "eyes yellow": "yellowing_of_eyes", "eyes turned yellow": "yellowing_of_eyes",
            "eyes are yellow": "yellowing_of_eyes",
            "bruising": "bruising", "bruises": "bruising",
            "easy bruising": "bruising", "bruise easily": "bruising",
            "blister": "blister", "blisters": "blister",
            "blisters on skin": "blister", "water filled blisters": "blister",
            "red sore around nose": "red_sore_around_nose",
            "sore on nose": "red_sore_around_nose",
            "nodal skin eruptions": "nodal_skin_eruptions",
            "silver like dusting": "silver_like_dusting",
            "silvery scales": "silver_like_dusting",
            "yellow crust ooze": "yellow_crust_ooze",
            "yellow crust": "yellow_crust_ooze",
            "oozing": "yellow_crust_ooze",
            "inflammatory nails": "inflammatory_nails",
            "nail inflammation": "inflammatory_nails",
            "brittle nails": "brittle_nails", "nails breaking": "brittle_nails",
            "nails are brittle": "brittle_nails",
            "small dents in nails": "small_dents_in_nails",
            "dents in nails": "small_dents_in_nails",
            "nail pitting": "small_dents_in_nails",

            # General / Systemic
            "tired": "fatigue", "fatigue": "fatigue",
            "exhausted": "fatigue", "no energy": "fatigue",
            "always tired": "fatigue", "feel tired": "fatigue",
            "feeling tired": "fatigue", "very tired": "fatigue",
            "lack of energy": "fatigue", "low energy": "fatigue",
            "weak": "malaise", "weakness": "malaise",
            "feeling weak": "malaise", "general weakness": "malaise",
            "feel weak": "malaise", "very weak": "malaise",
            "lethargy": "lethargy", "lethargic": "lethargy",
            "sluggish": "lethargy", "feeling sluggish": "lethargy",
            "dizzy": "dizziness", "dizziness": "dizziness",
            "lightheaded": "dizziness", "light headed": "dizziness",
            "feeling dizzy": "dizziness", "head spinning": "dizziness",
            "weight loss": "weight_loss", "losing weight": "weight_loss",
            "lost weight": "weight_loss", "weight is dropping": "weight_loss",
            "getting thinner": "weight_loss", "losing weight rapidly": "weight_loss",
            "weight gain": "weight_gain", "gaining weight": "weight_gain",
            "gained weight": "weight_gain", "putting on weight": "weight_gain",
            "getting fat": "weight_gain",
            "depressed": "depression", "depression": "depression",
            "feeling low": "depression", "feeling sad": "depression",
            "sad all the time": "depression",
            "anxious": "anxiety", "anxiety": "anxiety",
            "feeling anxious": "anxiety", "worried": "anxiety",
            "nervous": "anxiety",
            "restless": "restlessness", "cant sleep": "restlessness",
            "restlessness": "restlessness", "insomnia": "restlessness",
            "trouble sleeping": "restlessness", "cant fall asleep": "restlessness",
            "sleep problems": "restlessness", "not sleeping well": "restlessness",
            "irritable": "irritability", "irritability": "irritability",
            "easily irritated": "irritability", "getting annoyed": "irritability",
            "mood swings": "mood_swings", "mood changes": "mood_swings",
            "blurred vision": "blurred_and_distorted_vision",
            "blurry vision": "blurred_and_distorted_vision",
            "cant see clearly": "blurred_and_distorted_vision",
            "vision is blurry": "blurred_and_distorted_vision",
            "difficulty seeing": "blurred_and_distorted_vision",
            "dark urine": "dark_urine", "brown urine": "dark_urine",
            "dark colored urine": "dark_urine", "urine is dark": "dark_urine",
            "urine dark color": "dark_urine", "dark coloured urine": "dark_urine",
            "yellow urine": "yellow_urine",
            "thirsty": "dehydration", "very thirsty": "dehydration",
            "always thirsty": "dehydration", "excessive thirst": "dehydration",
            "very hungry": "excessive_hunger",
            "always hungry": "excessive_hunger",
            "excessive hunger": "excessive_hunger",
            "eating too much": "excessive_hunger",
            "increased appetite": "increased_appetite",
            "frequent urination": "polyuria",
            "peeing a lot": "polyuria", "urinating a lot": "polyuria",
            "urinating frequently": "polyuria", "pee too much": "polyuria",
            "burning urination": "burning_micturition",
            "burns when i pee": "burning_micturition",
            "burning when urinating": "burning_micturition",
            "painful urination": "burning_micturition",
            "burning sensation when urinating": "burning_micturition",
            "urine burns": "burning_micturition",
            "swollen": "swelling_joints",
            "swelling": "swelling_joints",
            "swollen joints": "swelling_joints",
            "swollen legs": "swollen_legs",
            "legs are swollen": "swollen_legs",
            "swollen lymph nodes": "swelled_lymph_nodes",
            "lymph nodes swollen": "swelled_lymph_nodes",
            "fast heartbeat": "fast_heart_rate",
            "heart racing": "fast_heart_rate",
            "rapid heartbeat": "fast_heart_rate",
            "heart beating fast": "fast_heart_rate",
            "palpitations": "palpitations", "heart palpitations": "palpitations",
            "lost smell": "loss_of_smell",
            "cant smell": "loss_of_smell", "loss of smell": "loss_of_smell",
            "cant concentrate": "lack_of_concentration",
            "lack of concentration": "lack_of_concentration",
            "cant focus": "lack_of_concentration",
            "stiff": "movement_stiffness",
            "stiffness": "movement_stiffness",
            "body stiff": "movement_stiffness",
            "unsteady": "unsteadiness",
            "loss of balance": "loss_of_balance",
            "losing balance": "loss_of_balance",
            "spinning": "spinning_movements",
            "vertigo": "spinning_movements",
            "room spinning": "spinning_movements",
            "coma": "coma", "unconscious": "coma",
            "altered sensorium": "altered_sensorium",
            "confused": "altered_sensorium", "confusion": "altered_sensorium",
            "slurred speech": "slurred_speech",
            "speech is slurred": "slurred_speech",
            "muscle wasting": "muscle_wasting",
            "muscle weakness": "muscle_weakness",
            "weak muscles": "muscle_weakness",
            "sunken eyes": "sunken_eyes", "eyes sunken": "sunken_eyes",
            "puffy face": "puffy_face_and_eyes",
            "face is puffy": "puffy_face_and_eyes",
            "swollen face": "puffy_face_and_eyes",
            "red eyes": "redness_of_eyes", "eyes are red": "redness_of_eyes",
            "eyes red": "redness_of_eyes", "eye redness": "redness_of_eyes",
            "bloodshot eyes": "redness_of_eyes",
            "watery eyes": "watering_from_eyes",
            "eyes watering": "watering_from_eyes",
            "eyes are watery": "watering_from_eyes",
            "tearing": "watering_from_eyes",
            "tears from eyes": "watering_from_eyes",
            "obesity": "obesity", "overweight": "obesity",
            "irregular sugar": "irregular_sugar_level",
            "blood sugar": "irregular_sugar_level",
            "sugar level": "irregular_sugar_level",
            "sugar problem": "irregular_sugar_level",
            "diabetes": "irregular_sugar_level",
            "enlarged thyroid": "enlarged_thyroid",
            "thyroid problem": "enlarged_thyroid",
            "thyroid swollen": "enlarged_thyroid",
            "abnormal menstruation": "abnormal_menstruation",
            "irregular periods": "abnormal_menstruation",
            "missed periods": "abnormal_menstruation",
            "period problems": "abnormal_menstruation",
            "ulcers on tongue": "ulcers_on_tongue",
            "mouth ulcers": "ulcers_on_tongue",
            "tongue ulcers": "ulcers_on_tongue",
            "sores in mouth": "ulcers_on_tongue",
            "spotting urination": "spotting_urination",
            "foul smell of urine": "foul_smell_of_urine",
            "urine smells bad": "foul_smell_of_urine",
            "smelly urine": "foul_smell_of_urine",
            "urine smells": "foul_smell_of_urine",
            "bladder discomfort": "bladder_discomfort",
            "bladder problem": "bladder_discomfort",
            "continuous feel of urine": "continuous_feel_of_urine",
            "always feel like peeing": "continuous_feel_of_urine",
            "cramps": "cramps", "cramping": "cramps",
            "weakness in limbs": "weakness_in_limbs",
            "arms are weak": "weakness_in_limbs",
            "legs feel weak": "weakness_in_limbs",
            "weakness of one side": "weakness_of_one_body_side",
            "one side weakness": "weakness_of_one_body_side",
            "one sided weakness": "weakness_of_one_body_side",
            "toxic look": "toxic_look_(typhos)",
            "prominent veins": "prominent_veins_on_calf",
            "varicose veins": "prominent_veins_on_calf",
            "swollen blood vessels": "swollen_blood_vessels",
            "extra marital contacts": "extra_marital_contacts",
            "history of alcohol": "history_of_alcohol_consumption",
            "alcohol": "history_of_alcohol_consumption",
            "drink alcohol": "history_of_alcohol_consumption",
            "drinking problem": "history_of_alcohol_consumption",
            "family history": "family_history",
            "genetic": "family_history", "runs in family": "family_history",
            "blood transfusion": "receiving_blood_transfusion",
            "unsterile injections": "receiving_unsterile_injections",
            "fluid overload": "fluid_overload",
            "cold hands": "cold_hands_and_feets",
            "cold feet": "cold_hands_and_feets",
            "cold hands and feet": "cold_hands_and_feets",
            "hands and feet cold": "cold_hands_and_feets",
            "internal itching": "internal_itching",
            "itching inside": "internal_itching",
            "irritation in anus": "irritation_in_anus",
            "anal irritation": "irritation_in_anus",
            "pain during bowel movements": "pain_during_bowel_movements",
            "hurts when passing stool": "pain_during_bowel_movements",
            "pain in anal region": "pain_in_anal_region",
            "visual disturbances": "visual_disturbances",
            "vision problems": "visual_disturbances",
            "eye problems": "visual_disturbances",
        }

        # Load BioBERT model
        print("  Loading BioBERT model...")
        self.tokenizer = AutoTokenizer.from_pretrained("dmis-lab/biobert-v1.1")
        self.model = AutoModel.from_pretrained("dmis-lab/biobert-v1.1")
        self.model.eval()

        # Pre-compute symptom embeddings
        self.symptom_embeddings = self._load_or_compute_embeddings()
        print(f"  ✓ BioBERT ready ({len(self.symptom_columns)} symptom embeddings)")

    def _get_embedding(self, text: str) -> np.ndarray:
        """Get BioBERT [CLS] embedding for a text string."""
        inputs = self.tokenizer(
            text, return_tensors="pt", padding=True,
            truncation=True, max_length=64
        )
        with torch.no_grad():
            outputs = self.model(**inputs)

        # Use [CLS] token embedding (more stable than mean pooling for similarity)
        cls_embedding = outputs.last_hidden_state[:, 0, :].squeeze().numpy()
        return cls_embedding / np.linalg.norm(cls_embedding)

    def _load_or_compute_embeddings(self) -> dict[str, np.ndarray]:
        """Load cached symptom embeddings or compute them."""
        if os.path.exists(self.cache_path):
            with open(self.cache_path, "rb") as f:
                cached = pickle.load(f)
            if set(cached.keys()) == set(self.symptom_columns):
                print("  ✓ Loaded cached symptom embeddings")
                return cached

        print("  Computing symptom embeddings (first time only)...")
        embeddings = {}
        for i, symptom in enumerate(self.symptom_columns):
            display = symptom.replace("_", " ")
            embeddings[symptom] = self._get_embedding(display)
            if (i + 1) % 30 == 0:
                print(f"    {i+1}/{len(self.symptom_columns)}...")

        with open(self.cache_path, "wb") as f:
            pickle.dump(embeddings, f)
        print(f"  ✓ Cached embeddings saved")
        return embeddings

    def extract_symptoms(self, user_text: str) -> list[str]:
        """
        Extract symptoms from user's natural language input.
        
        Three-stage pipeline:
          1. Direct symptom name match (exact)
          2. Phrase mapping (comprehensive dictionary)
          3. BioBERT embedding similarity (for novel phrases)
        """
        text_lower = user_text.lower().strip()
        text_clean = re.sub(r'[^\w\s]', ' ', text_lower)
        text_clean = re.sub(r'\s+', ' ', text_clean).strip()

        matched = set()

        # ── Stage 1: Direct symptom name match ───────────────────────
        for symptom in self.symptom_columns:
            display = symptom.replace("_", " ")
            if display in text_clean:
                matched.add(symptom)

        # ── Stage 2: Phrase mapping ──────────────────────────────────
        for phrase, symptom in self.phrase_mappings.items():
            if phrase in text_clean and symptom in self.symptom_set:
                matched.add(symptom)

        # ── Stage 3: BioBERT for unmatched phrases ───────────────────
        # Split into clause-level chunks
        clauses = re.split(r'\band\b|\balso\b|\bplus\b|\bwith\b|,|;', text_clean)
        clauses = [c.strip() for c in clauses if len(c.strip()) >= 4]

        # Also add the full text as a chunk (for short inputs)
        if text_clean not in clauses and len(text_clean) >= 4:
            clauses.append(text_clean)

        # Generate n-grams (bigrams + trigrams) from the full text for
        # better coverage of embedded phrases
        words = text_clean.split()
        ngrams = set()
        for n in (2, 3, 4):
            for i in range(len(words) - n + 1):
                ngram = " ".join(words[i:i+n])
                ngrams.add(ngram)

        # Check n-grams against phrase mappings (catches phrases
        # that clause splitting might break apart)
        for ngram in ngrams:
            for phrase, symptom in self.phrase_mappings.items():
                if phrase in ngram and symptom in self.symptom_set:
                    matched.add(symptom)

        for clause in clauses:
            # Skip if this clause already matched something via phrases
            clause_matched = False
            for phrase in self.phrase_mappings:
                if phrase in clause:
                    clause_matched = True
                    break
            if clause_matched:
                continue

            # Embed the clause and find closest symptom
            clause_emb = self._get_embedding(clause)
            best_symptom = None
            best_sim = 0.0

            for symptom, sym_emb in self.symptom_embeddings.items():
                sim = float(np.dot(clause_emb, sym_emb))
                if sim > best_sim:
                    best_sim = sim
                    best_symptom = symptom

            if best_symptom and best_sim >= self.SIMILARITY_THRESHOLD:
                matched.add(best_symptom)

        return list(matched)


# ═══════════════════════════════════════════════════════════════════════════
# STANDALONE TEST
# ═══════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(PROJECT_DIR, "models", "metadata.json")) as f:
        metadata = json.load(f)

    extractor = BioBERTSymptomExtractor(
        model_dir=os.path.join(PROJECT_DIR, "models"),
        symptom_columns=metadata["symptom_columns"]
    )

    test_inputs = [
        "I have a headache and I feel very tired",
        "my stomach hurts and I've been throwing up",
        "I have a high fever with chills and body pain",
        "I'm itching everywhere and I have a rash on my skin",
        "I can't breathe properly and I have a cough",
        "my joints are swollen and painful, hard to move",
        "I feel dizzy and nauseous, also blurred vision",
        "I have dark urine and yellow eyes",
    ]

    print("\n" + "=" * 70)
    print("BIOBERT SYMPTOM EXTRACTION TEST")
    print("=" * 70)

    for text in test_inputs:
        symptoms = extractor.extract_symptoms(text)
        display = [s.replace("_", " ") for s in symptoms]
        print(f"\n  Input:     \"{text}\"")
        print(f"  Extracted: {', '.join(display) if display else 'None'}")
        print(f"  Count:     {len(symptoms)}")
