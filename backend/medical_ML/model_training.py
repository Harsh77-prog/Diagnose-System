"""
 Model Training 
=================================================
Trains: Logistic Regression, Random Forest, and XGBoost 
"""

import os
import json
import numpy as np
import pandas as pd
import joblib
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import LabelEncoder
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.metrics import (
    classification_report, accuracy_score, confusion_matrix,
    precision_recall_fscore_support
)
from xgboost import XGBClassifier
from rich.console import Console
from rich.table import Table
from rich.progress import track
from rich.panel import Panel
from rich import box

# Initialize Rich console for beautiful terminal output
console = Console()

# ── Paths ────────────────────────────────────────────────────────────────
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(PROJECT_DIR, "data")
MODEL_DIR = os.path.join(PROJECT_DIR, "models")
PLOTS_DIR = os.path.join(MODEL_DIR, "plots")
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(PLOTS_DIR, exist_ok=True)

# Set plot style
plt.style.use('seaborn-v0_8-darkgrid')
sns.set_palette("husl")

# ═══════════════════════════════════════════════════════════════════════════
# 1. LOAD AUGMENTED DATA
# ═══════════════════════════════════════════════════════════════════════════
console.print("\n")
console.print(Panel.fit("📊 LOADING AUGMENTED DATA", style="bold cyan", box=box.DOUBLE))

augmented_path = os.path.join(DATA_DIR, "dataset_augmented.csv")
original_path = os.path.join(DATA_DIR, "dataset_encoded.csv")

if os.path.exists(augmented_path):
    df = pd.read_csv(augmented_path)
    console.print("  ✓ Using [bold green]AUGMENTED[/bold green] dataset")
else:
    df = pd.read_csv(original_path)
    console.print("  ⚠ Augmented dataset not found, using [yellow]original[/yellow]")

# Create data info table
data_table = Table(title="Dataset Information", box=box.ROUNDED, show_header=True, header_style="bold magenta")
data_table.add_column("Metric", style="cyan", width=25)
data_table.add_column("Value", style="green", justify="right")

data_table.add_row("Total Samples", f"{df.shape[0]:,}")
data_table.add_row("Total Features", f"{df.shape[1] - 1:,}")
data_table.add_row("Number of Diseases", f"{df['Disease'].nunique()}")
data_table.add_row("Avg Samples/Disease", f"{df['Disease'].value_counts().mean():.1f}")

console.print(data_table)

# Features (X) and target (y)
symptom_columns = [c for c in df.columns if c != "Disease"]
X = df[symptom_columns].values
y_raw = df["Disease"].values

# Label-encode the disease names
le = LabelEncoder()
y = le.fit_transform(y_raw)
console.print(f"\n  [bold]Classes:[/bold] {len(le.classes_)}")
console.print(f"  [bold]Feature columns:[/bold] {len(symptom_columns)}")

# ═══════════════════════════════════════════════════════════════════════════
# 2. STRATIFIED K-FOLD CROSS-VALIDATION
# ═══════════════════════════════════════════════════════════════════════════
console.print("\n")
console.print(Panel.fit("🔄 STRATIFIED 5-FOLD CROSS-VALIDATION", style="bold yellow", box=box.DOUBLE))

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

models_for_cv = {
    "Logistic Regression": LogisticRegression(max_iter=1000, random_state=42, multi_class="multinomial"),
    "Random Forest": RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1),
    "XGBoost": XGBClassifier(n_estimators=200, max_depth=6, learning_rate=0.1,
                              random_state=42, use_label_encoder=False,
                              eval_metric="mlogloss", verbosity=0),
}

cv_results = {}
cv_table = Table(title="Cross-Validation Results", box=box.ROUNDED, show_header=True, header_style="bold yellow")
cv_table.add_column("Model", style="cyan", width=30)
cv_table.add_column("Mean Accuracy", style="green", justify="right", width=15)
cv_table.add_column("Std Dev", style="magenta", justify="right", width=12)

for name, model in track(models_for_cv.items(), description="Running CV..."):
    scores = cross_val_score(model, X, y, cv=skf, scoring="accuracy", n_jobs=-1)
    cv_results[name] = {
        "mean": float(scores.mean()),
        "std": float(scores.std()),
        "folds": [float(s) for s in scores],
    }
    cv_table.add_row(name, f"{scores.mean():.4f}", f"±{scores.std():.4f}")

console.print(cv_table)

# ═══════════════════════════════════════════════════════════════════════════
# 3. TRAIN-TEST SPLIT & FINAL MODELS
# ═══════════════════════════════════════════════════════════════════════════
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
console.print(f"\n  [bold]Train:[/bold] {X_train.shape[0]:,}  |  [bold]Test:[/bold] {X_test.shape[0]:,}")

console.print("\n")
console.print(Panel.fit("🤖 TRAINING FINAL MODELS", style="bold green", box=box.DOUBLE))

# --- Logistic Regression ---
console.print("\n[cyan]► Logistic Regression ...[/cyan]")
lr = LogisticRegression(max_iter=1000, random_state=42, multi_class="multinomial")
lr.fit(X_train, y_train)
lr_acc = accuracy_score(y_test, lr.predict(X_test))
console.print(f"  [green]✓ Test accuracy: {lr_acc:.4f}[/green]")

# --- Random Forest ---
console.print("\n[cyan]► Random Forest ...[/cyan]")
rf = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
rf.fit(X_train, y_train)
rf_acc = accuracy_score(y_test, rf.predict(X_test))
console.print(f"  [green]✓ Test accuracy: {rf_acc:.4f}[/green]")

# --- XGBoost ---
console.print("\n[cyan]► XGBoost ...[/cyan]")
xgb = XGBClassifier(
    n_estimators=200, max_depth=6, learning_rate=0.1,
    random_state=42, use_label_encoder=False,
    eval_metric="mlogloss", verbosity=0,
)
xgb.fit(X_train, y_train)
xgb_acc = accuracy_score(y_test, xgb.predict(X_test))
console.print(f"  [green]✓ Test accuracy: {xgb_acc:.4f}[/green]")

# --- Soft Voting Ensemble ---
console.print("\n[cyan]► Ensemble (Soft Voting) ...[/cyan]")
ensemble = VotingClassifier(
    estimators=[("lr", lr), ("rf", rf), ("xgb", xgb)],
    voting="soft",
)
ensemble.fit(X_train, y_train)
ens_acc = accuracy_score(y_test, ensemble.predict(X_test))
console.print(f"  [green]✓ Test accuracy: {ens_acc:.4f}[/green]")

# Create accuracy comparison table
acc_table = Table(title="Model Accuracy Comparison", box=box.ROUNDED, show_header=True, header_style="bold green")
acc_table.add_column("Model", style="cyan", width=25)
acc_table.add_column("Test Accuracy", style="green", justify="right")
acc_table.add_column("Performance", style="yellow")

def get_performance_bar(acc):
    bar_length = int(acc * 50)
    return "█" * bar_length

acc_table.add_row("Logistic Regression", f"{lr_acc:.4f}", get_performance_bar(lr_acc))
acc_table.add_row("Random Forest", f"{rf_acc:.4f}", get_performance_bar(rf_acc))
acc_table.add_row("XGBoost", f"{xgb_acc:.4f}", get_performance_bar(xgb_acc))
acc_table.add_row("Ensemble", f"{ens_acc:.4f}", get_performance_bar(ens_acc))

console.print("\n")
console.print(acc_table)

# ═══════════════════════════════════════════════════════════════════════════
# 4. DETAILED PER-DISEASE ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════
console.print("\n")
console.print(Panel.fit("📈 PER-DISEASE ANALYSIS (Ensemble)", style="bold magenta", box=box.DOUBLE))

y_pred = ensemble.predict(X_test)
report = classification_report(y_test, y_pred, target_names=le.classes_, output_dict=True)

# Calculate per-disease performance (no table display)
disease_performance = {}
for disease in sorted(le.classes_):
    if disease in report:
        metrics = report[disease]
        disease_performance[disease] = {
            "precision": round(metrics["precision"], 4),
            "recall": round(metrics["recall"], 4),
            "f1": round(metrics["f1-score"], 4),
            "support": int(metrics["support"]),
        }

# Show summary statistics
avg_precision = report['weighted avg']['precision']
avg_recall = report['weighted avg']['recall']
avg_f1 = report['weighted avg']['f1-score']

console.print(f"  [bold]Overall Performance:[/bold]")
console.print(f"  Precision: [green]{avg_precision:.4f}[/green]  |  Recall: [yellow]{avg_recall:.4f}[/yellow]  |  F1-Score: [blue]{avg_f1:.4f}[/blue]")
console.print(f"  [dim]Detailed metrics saved to analysis_results.json[/dim]")

# ═══════════════════════════════════════════════════════════════════════════
# 5. FEATURE IMPORTANCE ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════
console.print("\n")
console.print(Panel.fit("🔍 TOP 20 MOST IMPORTANT SYMPTOMS (Random Forest)", style="bold blue", box=box.DOUBLE))

importances = rf.feature_importances_
top_indices = np.argsort(importances)[::-1][:20]

feature_importance = {}
feat_table = Table(title="Feature Importance", box=box.ROUNDED, show_header=True, header_style="bold blue")
feat_table.add_column("Rank", style="yellow", width=6, justify="right")
feat_table.add_column("Symptom", style="cyan", width=35)
feat_table.add_column("Importance", style="green", justify="right")
feat_table.add_column("Visual", style="magenta")

for rank, idx in enumerate(top_indices, 1):
    symptom = symptom_columns[idx]
    importance = float(importances[idx])
    feature_importance[symptom] = importance
    bar = "█" * int(importance * 200)
    feat_table.add_row(str(rank), symptom, f"{importance:.4f}", bar)

console.print(feat_table)

# ═══════════════════════════════════════════════════════════════════════════
# 6. GENERATE VISUALIZATIONS
# ═══════════════════════════════════════════════════════════════════════════
console.print("\n")
console.print(Panel.fit("📊 GENERATING VISUALIZATIONS", style="bold cyan", box=box.DOUBLE))

# 1. Model Accuracy Comparison
fig, ax = plt.subplots(figsize=(10, 6))
models = ['Logistic\nRegression', 'Random\nForest', 'XGBoost', 'Ensemble']
accuracies = [lr_acc, rf_acc, xgb_acc, ens_acc]
colors = sns.color_palette("husl", 4)
bars = ax.bar(models, accuracies, color=colors, edgecolor='black', linewidth=1.5)

# Add value labels on bars
for bar in bars:
    height = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2., height,
            f'{height:.4f}',
            ha='center', va='bottom', fontweight='bold', fontsize=11)

ax.set_ylabel('Accuracy', fontsize=12, fontweight='bold')
ax.set_xlabel('Models', fontsize=12, fontweight='bold')
ax.set_title('Model Accuracy Comparison', fontsize=14, fontweight='bold', pad=20)
ax.set_ylim([0, 1.1])
ax.grid(axis='y', alpha=0.3, linestyle='--')
plt.tight_layout()
plt.savefig(os.path.join(PLOTS_DIR, 'model_accuracy_comparison.png'), dpi=300, bbox_inches='tight')
console.print("  [green]✓[/green] Saved: model_accuracy_comparison.png")
plt.close()

# 2. Cross-Validation Scores
fig, ax = plt.subplots(figsize=(12, 6))
model_names = list(cv_results.keys())
cv_means = [cv_results[m]['mean'] for m in model_names]
cv_stds = [cv_results[m]['std'] for m in model_names]

x_pos = np.arange(len(model_names))
bars = ax.bar(x_pos, cv_means, yerr=cv_stds, capsize=5, color=colors[:3], 
              edgecolor='black', linewidth=1.5, alpha=0.8)

# Add value labels
for i, (bar, mean, std) in enumerate(zip(bars, cv_means, cv_stds)):
    ax.text(bar.get_x() + bar.get_width()/2., mean,
            f'{mean:.4f}±{std:.4f}',
            ha='center', va='bottom', fontweight='bold', fontsize=10)

ax.set_ylabel('Accuracy', fontsize=12, fontweight='bold')
ax.set_xlabel('Models', fontsize=12, fontweight='bold')
ax.set_title('5-Fold Cross-Validation Results', fontsize=14, fontweight='bold', pad=20)
ax.set_xticks(x_pos)
ax.set_xticklabels(model_names, rotation=15, ha='right')
ax.set_ylim([0, 1.1])
ax.grid(axis='y', alpha=0.3, linestyle='--')
plt.tight_layout()
plt.savefig(os.path.join(PLOTS_DIR, 'cross_validation_results.png'), dpi=300, bbox_inches='tight')
console.print("  [green]✓[/green] Saved: cross_validation_results.png")
plt.close()

# 3. Confusion Matrix
cm = confusion_matrix(y_test, y_pred)
fig, ax = plt.subplots(figsize=(16, 14))
sns.heatmap(cm, annot=False, fmt='d', cmap='YlOrRd', cbar_kws={'label': 'Count'},
            xticklabels=le.classes_, yticklabels=le.classes_, ax=ax, linewidths=0.5)
ax.set_xlabel('Predicted Disease', fontsize=12, fontweight='bold')
ax.set_ylabel('Actual Disease', fontsize=12, fontweight='bold')
ax.set_title('Confusion Matrix (Ensemble Model)', fontsize=14, fontweight='bold', pad=20)
plt.xticks(rotation=90, fontsize=6)
plt.yticks(rotation=0, fontsize=6)
plt.tight_layout()
plt.savefig(os.path.join(PLOTS_DIR, 'confusion_matrix.png'), dpi=300, bbox_inches='tight')
console.print("  [green]✓[/green] Saved: confusion_matrix.png")
plt.close()

# 4. Top 20 Feature Importance
fig, ax = plt.subplots(figsize=(12, 8))
top_20_symptoms = [symptom_columns[i] for i in top_indices]
top_20_importances = [importances[i] for i in top_indices]

y_pos = np.arange(len(top_20_symptoms))
bars = ax.barh(y_pos, top_20_importances, color=sns.color_palette("viridis", 20), 
               edgecolor='black', linewidth=0.8)

# Add value labels
for i, (bar, imp) in enumerate(zip(bars, top_20_importances)):
    ax.text(imp, bar.get_y() + bar.get_height()/2.,
            f' {imp:.4f}',
            ha='left', va='center', fontweight='bold', fontsize=9)

ax.set_yticks(y_pos)
ax.set_yticklabels(top_20_symptoms, fontsize=9)
ax.set_xlabel('Importance Score', fontsize=12, fontweight='bold')
ax.set_title('Top 20 Most Important Symptoms (Random Forest)', fontsize=14, fontweight='bold', pad=20)
ax.invert_yaxis()
ax.grid(axis='x', alpha=0.3, linestyle='--')
plt.tight_layout()
plt.savefig(os.path.join(PLOTS_DIR, 'feature_importance.png'), dpi=300, bbox_inches='tight')
console.print("  [green]✓[/green] Saved: feature_importance.png")
plt.close()

# 5. Per-Disease F1 Scores (Top 20 and Bottom 20)
disease_f1_scores = [(disease, disease_performance[disease]['f1']) 
                     for disease in disease_performance.keys()]
disease_f1_scores.sort(key=lambda x: x[1], reverse=True)

# Top 20
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 8))

top_20_diseases = disease_f1_scores[:20]
diseases_top = [d[0] for d in top_20_diseases]
f1_top = [d[1] for d in top_20_diseases]

y_pos = np.arange(len(diseases_top))
bars1 = ax1.barh(y_pos, f1_top, color=sns.color_palette("Greens_r", 20), 
                 edgecolor='black', linewidth=0.8)

for i, (bar, f1) in enumerate(zip(bars1, f1_top)):
    ax1.text(f1, bar.get_y() + bar.get_height()/2.,
             f' {f1:.3f}',
             ha='left', va='center', fontweight='bold', fontsize=8)

ax1.set_yticks(y_pos)
ax1.set_yticklabels(diseases_top, fontsize=8)
ax1.set_xlabel('F1-Score', fontsize=11, fontweight='bold')
ax1.set_title('Top 20 Diseases by F1-Score', fontsize=12, fontweight='bold', pad=15)
ax1.invert_yaxis()
ax1.grid(axis='x', alpha=0.3, linestyle='--')
ax1.set_xlim([0, 1.1])

# Bottom 20
bottom_20_diseases = disease_f1_scores[-20:]
diseases_bottom = [d[0] for d in bottom_20_diseases]
f1_bottom = [d[1] for d in bottom_20_diseases]

y_pos = np.arange(len(diseases_bottom))
bars2 = ax2.barh(y_pos, f1_bottom, color=sns.color_palette("Reds_r", 20), 
                 edgecolor='black', linewidth=0.8)

for i, (bar, f1) in enumerate(zip(bars2, f1_bottom)):
    ax2.text(f1, bar.get_y() + bar.get_height()/2.,
             f' {f1:.3f}',
             ha='left', va='center', fontweight='bold', fontsize=8)

ax2.set_yticks(y_pos)
ax2.set_yticklabels(diseases_bottom, fontsize=8)
ax2.set_xlabel('F1-Score', fontsize=11, fontweight='bold')
ax2.set_title('Bottom 20 Diseases by F1-Score', fontsize=12, fontweight='bold', pad=15)
ax2.invert_yaxis()
ax2.grid(axis='x', alpha=0.3, linestyle='--')
ax2.set_xlim([0, 1.1])

plt.tight_layout()
plt.savefig(os.path.join(PLOTS_DIR, 'disease_f1_comparison.png'), dpi=300, bbox_inches='tight')
console.print("  [green]✓[/green] Saved: disease_f1_comparison.png")
plt.close()

console.print(f"\n  [bold green]All visualizations saved to:[/bold green] {os.path.abspath(PLOTS_DIR)}")


# ═══════════════════════════════════════════════════════════════════════════
# 7. SAVE MODELS & COMPREHENSIVE METADATA
# ═══════════════════════════════════════════════════════════════════════════
console.print("\n")
console.print(Panel.fit("💾 SAVING MODELS", style="bold green", box=box.DOUBLE))

joblib.dump(lr, os.path.join(MODEL_DIR, "logistic_regression.pkl"))
joblib.dump(rf, os.path.join(MODEL_DIR, "random_forest.pkl"))
joblib.dump(xgb, os.path.join(MODEL_DIR, "xgboost.pkl"))
joblib.dump(ensemble, os.path.join(MODEL_DIR, "ensemble.pkl"))
joblib.dump(le, os.path.join(MODEL_DIR, "label_encoder.pkl"))

console.print("  [green]✓[/green] logistic_regression.pkl")
console.print("  [green]✓[/green] random_forest.pkl")
console.print("  [green]✓[/green] xgboost.pkl")
console.print("  [green]✓[/green] ensemble.pkl")
console.print("  [green]✓[/green] label_encoder.pkl")

# Comprehensive metadata for research
metadata = {
    "symptom_columns": symptom_columns,
    "diseases": list(le.classes_),
    "dataset": {
        "source": "dataset_augmented.csv" if os.path.exists(augmented_path) else "dataset_encoded.csv",
        "total_samples": len(df),
        "n_diseases": len(le.classes_),
        "n_features": len(symptom_columns),
        "train_size": int(X_train.shape[0]),
        "test_size": int(X_test.shape[0]),
    },
    "accuracy": {
        "logistic_regression": round(lr_acc, 4),
        "random_forest": round(rf_acc, 4),
        "xgboost": round(xgb_acc, 4),
        "ensemble": round(ens_acc, 4),
    },
    "cross_validation": cv_results,
    "per_disease_performance": disease_performance,
    "top_features": feature_importance,
}

with open(os.path.join(MODEL_DIR, "metadata.json"), "w") as f:
    json.dump(metadata, f, indent=2)

# Save analysis results separately for paper
with open(os.path.join(MODEL_DIR, "analysis_results.json"), "w") as f:
    json.dump({
        "cross_validation": cv_results,
        "per_disease": disease_performance,
        "feature_importance": feature_importance,
        "test_accuracy": {
            "logistic_regression": round(lr_acc, 4),
            "random_forest": round(rf_acc, 4),
            "xgboost": round(xgb_acc, 4),
            "ensemble": round(ens_acc, 4),
        },
    }, f, indent=2)

console.print(f"\n  [green]✓[/green] metadata.json")
console.print(f"  [green]✓[/green] analysis_results.json")
console.print(f"\n  [bold cyan]Models saved to:[/bold cyan] {os.path.abspath(MODEL_DIR)}")

# ═══════════════════════════════════════════════════════════════════════════
# 8. SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
console.print("\n")
console.print(Panel.fit("📋 TRAINING SUMMARY", style="bold white on blue", box=box.DOUBLE))

summary_table = Table(box=box.ROUNDED, show_header=True, header_style="bold white")
summary_table.add_column("Metric", style="cyan", width=30)
summary_table.add_column("Value", style="green", justify="right")

summary_table.add_row("Dataset Samples", f"{len(df):,}")
summary_table.add_row("Number of Diseases", f"{len(le.classes_)}")
summary_table.add_row("Number of Features", f"{len(symptom_columns)}")
summary_table.add_row("", "")
summary_table.add_row("[bold]Logistic Regression[/bold]", f"[bold]{lr_acc:.4f}[/bold]")
summary_table.add_row("[bold]Random Forest[/bold]", f"[bold]{rf_acc:.4f}[/bold]")
summary_table.add_row("[bold]XGBoost[/bold]", f"[bold]{xgb_acc:.4f}[/bold]")
summary_table.add_row("[bold yellow]Ensemble[/bold yellow]", f"[bold yellow]{ens_acc:.4f}[/bold yellow]")

console.print(summary_table)

# CV Summary
cv_summary_table = Table(title="Cross-Validation Summary", box=box.ROUNDED, show_header=True, header_style="bold yellow")
cv_summary_table.add_column("Model", style="cyan", width=25)
cv_summary_table.add_column("Mean ± Std", style="green", justify="right")

for name, res in cv_results.items():
    cv_summary_table.add_row(name, f"{res['mean']:.4f} ± {res['std']:.4f}")

console.print("\n")
console.print(cv_summary_table)

console.print("\n")
console.print(Panel.fit("✅ MODEL TRAINING COMPLETE!", style="bold green on black", box=box.DOUBLE))
console.print(f"\n[bold cyan]📊 Visualizations:[/bold cyan] {os.path.abspath(PLOTS_DIR)}")
console.print(f"[bold cyan]💾 Models:[/bold cyan] {os.path.abspath(MODEL_DIR)}\n")

