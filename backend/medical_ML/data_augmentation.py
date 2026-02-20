"""
Data Augmentation for Medical Symptom Dataset
==============================================
Expands the original 304-sample dataset to ~2500+ samples by:
"""

import os
import random
import numpy as np
import pandas as pd

random.seed(42)
np.random.seed(42)

# ── Paths ────────────────────────────────────────────────────────────────
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(PROJECT_DIR, "data")

# ── Load original encoded dataset ────────────────────────────────────────
df_original = pd.read_csv(os.path.join(DATA_DIR, "dataset_encoded.csv"))
symptom_columns = [c for c in df_original.columns if c != "Disease"]

print("=" * 70)
print("DATA AUGMENTATION")
print("=" * 70)
print(f"\nOriginal dataset: {len(df_original)} samples, {len(symptom_columns)} symptoms")
print(f"Diseases: {df_original['Disease'].nunique()}")

# ── Extract canonical symptom sets per disease ───────────────────────────
disease_canonical: dict[str, set[str]] = {}
for disease in df_original["Disease"].unique():
    disease_rows = df_original[df_original["Disease"] == disease]
    # Union of all symptoms seen for this disease
    all_symptoms = set()
    for _, row in disease_rows.iterrows():
        for col in symptom_columns:
            if row[col] == 1:
                all_symptoms.add(col)
    disease_canonical[disease] = all_symptoms

# Show canonical symptom counts
print("\nCanonical symptoms per disease:")
for disease, symptoms in sorted(disease_canonical.items(), key=lambda x: len(x[1])):
    print(f"  {disease:<45} {len(symptoms)} symptoms")

# ═══════════════════════════════════════════════════════════════════════════
# AUGMENTATION STRATEGIES
# ═══════════════════════════════════════════════════════════════════════════

all_symptoms_set = set(symptom_columns)
augmented_rows = []


def create_sample(disease: str, active_symptoms: set[str]) -> dict:
    """Create a single sample row from disease name and active symptoms."""
    row = {"Disease": disease}
    for col in symptom_columns:
        row[col] = 1 if col in active_symptoms else 0
    return row


# ── Strategy 1: Keep all original samples ────────────────────────────────
print("\n► Strategy 1: Original samples")
for _, row in df_original.iterrows():
    augmented_rows.append(row.to_dict())
print(f"  Added {len(df_original)} original samples")

# ── Strategy 2: Drop-K Symptom Variations ────────────────────────────────
print("\n► Strategy 2: Partial symptom variations (drop 1-3 symptoms)")
drop_count = 0

for disease, canonical in disease_canonical.items():
    n_symptoms = len(canonical)
    symptoms_list = list(canonical)

    if n_symptoms <= 2:
        # Too few symptoms to drop — just keep originals
        continue

    # Drop-1: Create variations dropping 1 symptom at a time
    for i in range(n_symptoms):
        reduced = canonical - {symptoms_list[i]}
        if len(reduced) >= 2:  # Minimum 2 symptoms
            augmented_rows.append(create_sample(disease, reduced))
            drop_count += 1

    # Drop-2: Random combinations of dropping 2 symptoms
    n_drop2 = min(n_symptoms * 2, 15)  # Cap per disease
    for _ in range(n_drop2):
        to_drop = set(random.sample(symptoms_list, min(2, n_symptoms - 2)))
        reduced = canonical - to_drop
        if len(reduced) >= 2:
            augmented_rows.append(create_sample(disease, reduced))
            drop_count += 1

    # Drop-3: Random combinations of dropping 3 symptoms (harder cases)
    if n_symptoms >= 5:
        n_drop3 = min(n_symptoms, 10)
        for _ in range(n_drop3):
            to_drop = set(random.sample(symptoms_list, min(3, n_symptoms - 2)))
            reduced = canonical - to_drop
            if len(reduced) >= 2:
                augmented_rows.append(create_sample(disease, reduced))
                drop_count += 1

print(f"  Added {drop_count} partial-symptom variations")

# ── Strategy 3: Noise Injection ──────────────────────────────────────────
print("\n► Strategy 3: Noise injection (add 1-2 random symptoms)")
noise_count = 0

for disease, canonical in disease_canonical.items():
    non_disease_symptoms = list(all_symptoms_set - canonical)
    if not non_disease_symptoms:
        continue

    # Add 1 random incorrect symptom
    n_noisy = min(8, len(non_disease_symptoms))
    for _ in range(n_noisy):
        noise_symptom = random.choice(non_disease_symptoms)
        noisy_set = canonical | {noise_symptom}
        augmented_rows.append(create_sample(disease, noisy_set))
        noise_count += 1

    # Drop 1 correct + add 1 incorrect (most realistic)
    symptoms_list = list(canonical)
    n_swap = min(6, len(symptoms_list))
    for _ in range(n_swap):
        drop = random.choice(symptoms_list)
        add = random.choice(non_disease_symptoms)
        swapped = (canonical - {drop}) | {add}
        if len(swapped) >= 2:
            augmented_rows.append(create_sample(disease, swapped))
            noise_count += 1

print(f"  Added {noise_count} noisy variations")

# ── Strategy 4: Minimal Symptom Sets ─────────────────────────────────────
print("\n► Strategy 4: Minimal symptom sets (2-3 symptoms only)")
minimal_count = 0

for disease, canonical in disease_canonical.items():
    symptoms_list = list(canonical)
    if len(symptoms_list) < 3:
        continue

    # Create samples with only 2 symptoms
    n_minimal = min(10, len(symptoms_list) * (len(symptoms_list) - 1) // 2)
    pairs_seen = set()
    for _ in range(n_minimal):
        pair = tuple(sorted(random.sample(symptoms_list, 2)))
        if pair not in pairs_seen:
            pairs_seen.add(pair)
            augmented_rows.append(create_sample(disease, set(pair)))
            minimal_count += 1

    # Create samples with only 3 symptoms
    if len(symptoms_list) >= 4:
        n_triple = min(8, len(symptoms_list))
        for _ in range(n_triple):
            triple = set(random.sample(symptoms_list, 3))
            augmented_rows.append(create_sample(disease, triple))
            minimal_count += 1

print(f"  Added {minimal_count} minimal-symptom variations")

# ═══════════════════════════════════════════════════════════════════════════
# BUILD FINAL DATASET
# ═══════════════════════════════════════════════════════════════════════════
df_augmented = pd.DataFrame(augmented_rows)

# Remove exact duplicates
before_dedup = len(df_augmented)
df_augmented = df_augmented.drop_duplicates()
after_dedup = len(df_augmented)

# Shuffle
df_augmented = df_augmented.sample(frac=1, random_state=42).reset_index(drop=True)

# ── Save ─────────────────────────────────────────────────────────────────
output_path = os.path.join(DATA_DIR, "dataset_augmented.csv")
df_augmented.to_csv(output_path, index=False)

# ── Summary Report ───────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("AUGMENTATION SUMMARY")
print("=" * 70)
print(f"  Original samples:     {len(df_original)}")
print(f"  After augmentation:   {before_dedup}")
print(f"  After deduplication:  {after_dedup}")
print(f"  Expansion ratio:      {after_dedup / len(df_original):.1f}x")
print(f"  Saved to:             {output_path}")

print("\n  Samples per disease:")
disease_counts = df_augmented["Disease"].value_counts()
for disease, count in disease_counts.items():
    bar = "█" * (count // 5)
    print(f"    {disease:<45} {count:4d} {bar}")

print(f"\n  Mean per disease:     {disease_counts.mean():.1f}")
print(f"  Min per disease:      {disease_counts.min()}")
print(f"  Max per disease:      {disease_counts.max()}")

# ── Verify quality ───────────────────────────────────────────────────────
print("\n  Quality checks:")
n_zero_rows = (df_augmented[symptom_columns].sum(axis=1) == 0).sum()
print(f"    Rows with 0 symptoms:  {n_zero_rows} (should be 0)")
avg_symptoms = df_augmented[symptom_columns].sum(axis=1).mean()
print(f"    Avg symptoms per row:  {avg_symptoms:.2f}")
min_symptoms = df_augmented[symptom_columns].sum(axis=1).min()
print(f"    Min symptoms per row:  {min_symptoms}")

print("\n✅ Data augmentation complete!")
