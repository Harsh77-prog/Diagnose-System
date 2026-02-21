"""
Medical ML Project – Phase 1: Dataset Cleaning
================================================
Cleans all 4 CSVs from the archive and produces ready-to-use files
for model training.

Input:  ../Downloads/archive/{dataset.csv, Symptom-severity.csv,
         symptom_Description.csv, symptom_precaution.csv}
Output: data/{dataset_cleaned.csv, dataset_encoded.csv,
         symptom_severity_cleaned.csv, symptom_description_cleaned.csv,
         symptom_precaution_cleaned.csv, cleaning_report.txt}
"""

import os
import pandas as pd
import numpy as np

# ── Paths ────────────────────────────────────────────────────────────────
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
ARCHIVE_DIR = os.path.expanduser("~/Downloads/archive")
OUTPUT_DIR = os.path.join(PROJECT_DIR, "data")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ── Known symptom-name corrections ───────────────────────────────────────
SYMPTOM_RENAME_MAP = {
    "dischromic _patches": "dischromic_patches",
    "spotting_ urination": "spotting_urination",
    "foul_smell_of urine": "foul_smell_of_urine",
    "foul_smell_ofurine": "foul_smell_of_urine",
}

# ── Known disease-name corrections ───────────────────────────────────────
DISEASE_RENAME_MAP = {
    "Peptic ulcer diseae": "Peptic ulcer disease",
    "Dimorphic hemmorhoids(piles)": "Dimorphic hemorrhoids(piles)",
    "Dimorphic hemorrhoids(piles)": "Dimorphic hemorrhoids(piles)",
    "Osteoarthristis": "Osteoarthritis",
    "(vertigo) Paroymsal  Positional Vertigo": "(vertigo) Paroxysmal Positional Vertigo",
    "hepatitis A": "Hepatitis A",  # capitalise
}

report_lines: list[str] = []


def log(msg: str):
    """Print and buffer for the cleaning report."""
    print(msg)
    report_lines.append(msg)


# ═══════════════════════════════════════════════════════════════════════════
# Helper: standardise a single symptom string
# ═══════════════════════════════════════════════════════════════════════════
def clean_symptom(val):
    """Strip, lowercase, apply rename map."""
    if pd.isna(val) or str(val).strip() == "":
        return np.nan
    val = str(val).strip().lower().replace(" ", "_")
    # Some symptoms have double underscores after lowering + replacing spaces
    while "__" in val:
        val = val.replace("__", "_")
    # Apply rename map (try original first, then lowered version)
    val = SYMPTOM_RENAME_MAP.get(val, val)
    return val


def clean_disease(val):
    """Strip whitespace and apply rename map."""
    if pd.isna(val):
        return val
    val = str(val).strip()
    val = DISEASE_RENAME_MAP.get(val, val)
    return val


# ═══════════════════════════════════════════════════════════════════════════
# 1. CLEAN dataset.csv
# ═══════════════════════════════════════════════════════════════════════════
log("=" * 70)
log("STEP 1: Cleaning dataset.csv")
log("=" * 70)

df = pd.read_csv(os.path.join(ARCHIVE_DIR, "dataset.csv"))
log(f"  Original shape: {df.shape}")
log(f"  Original columns: {list(df.columns)}")

# ── 1a. Clean disease names ──────────────────────────────────────────────
df["Disease"] = df["Disease"].apply(clean_disease)
unique_diseases = sorted(df["Disease"].unique())
log(f"  Unique diseases after cleaning: {len(unique_diseases)}")

# ── 1b. Clean symptom columns ───────────────────────────────────────────
symptom_cols = [c for c in df.columns if c.startswith("Symptom")]
for col in symptom_cols:
    df[col] = df[col].apply(clean_symptom)

log(f"  Symptom columns cleaned: {symptom_cols}")

# ── 1c. Remove fully-duplicate rows ─────────────────────────────────────
rows_before = len(df)
df.drop_duplicates(inplace=True)
rows_after = len(df)
log(f"  Rows before dedup: {rows_before} → after: {rows_after}  (removed {rows_before - rows_after})")

# ── 1d. Collect all unique symptoms ─────────────────────────────────────
all_symptoms = set()
for col in symptom_cols:
    all_symptoms.update(df[col].dropna().unique())
all_symptoms = sorted(all_symptoms)
log(f"  Total unique symptoms: {len(all_symptoms)}")

# ── 1e. Save cleaned wide-format CSV ────────────────────────────────────
cleaned_path = os.path.join(OUTPUT_DIR, "dataset_cleaned.csv")
df.to_csv(cleaned_path, index=False)
log(f"  Saved → {cleaned_path}")

# ── 1f. Build binary-encoded feature matrix ─────────────────────────────
log("\n  Building binary-encoded feature matrix …")

def row_to_binary(row):
    """Convert a row's symptom columns into a binary dict."""
    symptoms_present = set()
    for col in symptom_cols:
        if pd.notna(row[col]):
            symptoms_present.add(row[col])
    return {s: (1 if s in symptoms_present else 0) for s in all_symptoms}

encoded_rows = []
for _, row in df.iterrows():
    binary = row_to_binary(row)
    binary["Disease"] = row["Disease"]
    encoded_rows.append(binary)

df_encoded = pd.DataFrame(encoded_rows)
# Put Disease column first
cols_order = ["Disease"] + all_symptoms
df_encoded = df_encoded[cols_order]

encoded_path = os.path.join(OUTPUT_DIR, "dataset_encoded.csv")
df_encoded.to_csv(encoded_path, index=False)
log(f"  Encoded shape: {df_encoded.shape}")
log(f"  Saved → {encoded_path}")


# ═══════════════════════════════════════════════════════════════════════════
# 2. CLEAN Symptom-severity.csv
# ═══════════════════════════════════════════════════════════════════════════
log("\n" + "=" * 70)
log("STEP 2: Cleaning Symptom-severity.csv")
log("=" * 70)

df_sev = pd.read_csv(os.path.join(ARCHIVE_DIR, "Symptom-severity.csv"))
log(f"  Original shape: {df_sev.shape}")

df_sev["Symptom"] = df_sev["Symptom"].apply(clean_symptom)
df_sev.drop_duplicates(subset=["Symptom"], inplace=True)

# Check alignment with dataset symptoms
sev_symptoms = set(df_sev["Symptom"].dropna())
dataset_symptoms = set(all_symptoms)

only_in_dataset = dataset_symptoms - sev_symptoms
only_in_severity = sev_symptoms - dataset_symptoms

if only_in_dataset:
    log(f"  ⚠ Symptoms in dataset but NOT in severity file: {only_in_dataset}")
else:
    log("  ✓ All dataset symptoms found in severity file")

if only_in_severity:
    log(f"  ⚠ Symptoms in severity but NOT in dataset: {only_in_severity}")
else:
    log("  ✓ All severity symptoms found in dataset")

sev_path = os.path.join(OUTPUT_DIR, "symptom_severity_cleaned.csv")
df_sev.to_csv(sev_path, index=False)
log(f"  Saved → {sev_path}")


# ═══════════════════════════════════════════════════════════════════════════
# 3. CLEAN symptom_Description.csv
# ═══════════════════════════════════════════════════════════════════════════
log("\n" + "=" * 70)
log("STEP 3: Cleaning symptom_Description.csv")
log("=" * 70)

df_desc = pd.read_csv(os.path.join(ARCHIVE_DIR, "symptom_Description.csv"))
log(f"  Original shape: {df_desc.shape}")

df_desc["Disease"] = df_desc["Disease"].apply(clean_disease)

only_in_dataset_d = set(unique_diseases) - set(df_desc["Disease"])
only_in_desc = set(df_desc["Disease"]) - set(unique_diseases)

if only_in_dataset_d:
    log(f"  ⚠ Diseases in dataset but NOT in description: {only_in_dataset_d}")
else:
    log("  ✓ All dataset diseases found in description file")

if only_in_desc:
    log(f"  ⚠ Diseases in description but NOT in dataset: {only_in_desc}")
else:
    log("  ✓ All description diseases found in dataset")

desc_path = os.path.join(OUTPUT_DIR, "symptom_description_cleaned.csv")
df_desc.to_csv(desc_path, index=False)
log(f"  Saved → {desc_path}")


# ═══════════════════════════════════════════════════════════════════════════
# 4. CLEAN symptom_precaution.csv
# ═══════════════════════════════════════════════════════════════════════════
log("\n" + "=" * 70)
log("STEP 4: Cleaning symptom_precaution.csv")
log("=" * 70)

df_prec = pd.read_csv(os.path.join(ARCHIVE_DIR, "symptom_precaution.csv"))
log(f"  Original shape: {df_prec.shape}")

df_prec["Disease"] = df_prec["Disease"].apply(clean_disease)

only_in_dataset_p = set(unique_diseases) - set(df_prec["Disease"])
only_in_prec = set(df_prec["Disease"]) - set(unique_diseases)

if only_in_dataset_p:
    log(f"  ⚠ Diseases in dataset but NOT in precaution: {only_in_dataset_p}")
else:
    log("  ✓ All dataset diseases found in precaution file")

if only_in_prec:
    log(f"  ⚠ Diseases in precaution but NOT in dataset: {only_in_prec}")
else:
    log("  ✓ All precaution diseases found in dataset")

prec_path = os.path.join(OUTPUT_DIR, "symptom_precaution_cleaned.csv")
df_prec.to_csv(prec_path, index=False)
log(f"  Saved → {prec_path}")


# ═══════════════════════════════════════════════════════════════════════════
# 5. SUMMARY REPORT
# ═══════════════════════════════════════════════════════════════════════════
log("\n" + "=" * 70)
log("CLEANING SUMMARY")
log("=" * 70)
log(f"  Diseases:  {len(unique_diseases)}")
log(f"  Symptoms:  {len(all_symptoms)}")
log(f"  Dataset rows (cleaned):  {len(df)}")
log(f"  Encoded matrix shape:    {df_encoded.shape}")
log(f"  Symptom name corrections applied: {SYMPTOM_RENAME_MAP}")
log(f"  Disease name corrections applied: {DISEASE_RENAME_MAP}")
log(f"\n  All cleaned files saved to: {os.path.abspath(OUTPUT_DIR)}")

# ── Save report to file ─────────────────────────────────────────────────
report_path = os.path.join(OUTPUT_DIR, "cleaning_report.txt")
with open(report_path, "w") as f:
    f.write("\n".join(report_lines))
log(f"\n  Report saved → {report_path}")

log("\n✅ Data cleaning complete!")
