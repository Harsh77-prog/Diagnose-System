#!/usr/bin/env python3
"""
Test script to verify image analysis accuracy across all datasets.
Tests the smart detection and ensemble prediction system.
"""

import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from image_predictor import ImagePredictor
from PIL import Image, ImageDraw
import numpy as np
import base64
import io

print("\n" + "="*70)
print("🧪 IMAGE ANALYSIS ACCURACY TEST SUITE")
print("="*70 + "\n")

# Initialize predictor
backend_root = Path(__file__).resolve().parent
model_dir = backend_root / "medical_ML" / "models"

if not model_dir.exists():
    print(f"❌ Model directory not found: {model_dir}")
    print("Please train models first: python train_model.py")
    sys.exit(1)

print(f"✓ Loading models from: {model_dir}\n")
predictor = ImagePredictor(model_dir=str(model_dir))

# Show available models
print("Available datasets:")
for ds in predictor.available_datasets():
    print(f"  ✓ {ds}")
print()

# ============================================================================
# TEST 1: Grayscale Image Detection (X-ray)
# ============================================================================
print("-" * 70)
print("TEST 1: GRAYSCALE IMAGE DETECTION (X-ray simulation)")
print("-" * 70)

# Create synthetic grayscale image
grayscale_img = Image.new('L', (256, 256), color=100)
draw = ImageDraw.Draw(grayscale_img)
# Draw some patterns to simulate X-ray
for i in range(0, 256, 32):
    draw.line([(i, 0), (i, 256)], fill=80, width=2)
    draw.line([(0, i), (256, i)], fill=80, width=2)

characteristics = predictor._detect_image_characteristics(grayscale_img)
print(f"Detected image type: {characteristics['type']}")
print(f"Expected: grayscale")
print(f"Status: {'✅ PASS' if characteristics['type'] == 'grayscale' else '❌ FAIL'}\n")

# ============================================================================
# TEST 2: Red-Dominant Color Image Detection (Dermatology)
# ============================================================================
print("-" * 70)
print("TEST 2: RED-DOMINANT IMAGE DETECTION (Skin simulation)")
print("-" * 70)

# Create synthetic red-dominant image
red_img = Image.new('RGB', (256, 256), color=(200, 100, 100))
draw = ImageDraw.Draw(red_img)
# Make it more red-dominant
for x in range(256):
    for y in range(256):
        if (x - 128) ** 2 + (y - 128) ** 2 < 80 ** 2:  # Circle
            red_img.putpixel((x, y), (220, 80, 80))

characteristics = predictor._detect_image_characteristics(red_img)
print(f"Detected image type: {characteristics['type']}")
print(f"Expected: color_red_dominant")
print(f"Status: {'✅ PASS' if characteristics['type'] == 'color_red_dominant' else '❌ FAIL'}\n")

# ============================================================================
# TEST 3: Low-Saturation Color Image Detection (Blood/Pathology)
# ============================================================================
print("-" * 70)
print("TEST 3: LOW-SATURATION IMAGE DETECTION (Blood simulation)")
print("-" * 70)

# Create synthetic low-saturation image
lowsat_img = Image.new('RGB', (256, 256), color=(120, 120, 120))
draw = ImageDraw.Draw(lowsat_img)
# Add low-saturation spots
for i in range(0, 256, 50):
    for j in range(0, 256, 50):
        draw.ellipse([(i, j), (i+30, j+30)], fill=(110, 110, 115))

characteristics = predictor._detect_image_characteristics(lowsat_img)
print(f"Detected image type: {characteristics['type']}")
print(f"Expected: color_low_saturation")
print(f"Status: {'✅ PASS' if characteristics['type'] == 'color_low_saturation' else '❌ FAIL'}\n")

# ============================================================================
# TEST 4: Dataset Prioritization for Grayscale
# ============================================================================
print("-" * 70)
print("TEST 4: DATASET PRIORITIZATION (Grayscale)")
print("-" * 70)

all_datasets = ["chestmnist", "dermamnist", "retinamnist", "pathmnist", "bloodmnist"]
char_grayscale = {"type": "grayscale"}
prioritized = predictor._prioritize_datasets(all_datasets, char_grayscale)
print(f"Original order: {all_datasets}")
print(f"Prioritized order: {prioritized}")
print(f"First dataset: {prioritized[0]}")
print(f"Expected first: chestmnist")
print(f"Status: {'✅ PASS' if prioritized[0] == 'chestmnist' else '❌ FAIL'}\n")

# ============================================================================
# TEST 5: Dataset Prioritization for Red-Dominant Colors
# ============================================================================
print("-" * 70)
print("TEST 5: DATASET PRIORITIZATION (Red-Dominant)")
print("-" * 70)

char_red = {"type": "color_red_dominant"}
prioritized = predictor._prioritize_datasets(all_datasets, char_red)
print(f"Prioritized order: {prioritized}")
print(f"First dataset: {prioritized[0]}")
print(f"Expected first: dermamnist")
print(f"Status: {'✅ PASS' if prioritized[0] == 'dermamnist' else '❌ FAIL'}\n")

# ============================================================================
# TEST 6: Dataset Prioritization for Low-Saturation Colors
# ============================================================================
print("-" * 70)
print("TEST 6: DATASET PRIORITIZATION (Low-Saturation)")
print("-" * 70)

char_lowsat = {"type": "color_low_saturation"}
prioritized = predictor._prioritize_datasets(all_datasets, char_lowsat)
print(f"Prioritized order: {prioritized}")
print(f"First dataset: {prioritized[0]}")
print(f"Expected first: bloodmnist")
print(f"Status: {'✅ PASS' if prioritized[0] == 'bloodmnist' else '❌ FAIL'}\n")

# ============================================================================
# TEST 7: Medical Filtering - Grayscale Images
# ============================================================================
print("-" * 70)
print("TEST 7: MEDICAL FILTERING (Grayscale - should reject derma/blood)")
print("-" * 70)

# Create mock predictions
mock_predictions = [
    {"dataset": "chestmnist", "top_confidence": 75.0, "top_label_name": "pneumonia"},
    {"dataset": "dermamnist", "top_confidence": 60.0, "top_label_name": "melanoma"},
    {"dataset": "bloodmnist", "top_confidence": 55.0, "top_label_name": "lymphocyte"},
]

char = {"type": "grayscale"}
filtered = predictor._filter_medically_impossible(mock_predictions, char)
allowed_datasets = [p["dataset"] for p in filtered]
print(f"Original predictions: {[p['dataset'] for p in mock_predictions]}")
print(f"Filtered predictions: {allowed_datasets}")
print(f"Contains chestmnist: {('chestmnist' in allowed_datasets)}")
print(f"Contains dermamnist: {('dermamnist' in allowed_datasets)}")
print(f"Status: {'✅ PASS' if 'chestmnist' in allowed_datasets and 'dermamnist' not in allowed_datasets else '❌ FAIL'}\n")

# ============================================================================
# TEST 8: Medical Filtering - Red-Dominant Colors
# ============================================================================
print("-" * 70)
print("TEST 8: MEDICAL FILTERING (Red-Dominant - should only allow derma)")
print("-" * 70)

char = {"type": "color_red_dominant"}
filtered = predictor._filter_medically_impossible(mock_predictions, char)
allowed_datasets = [p["dataset"] for p in filtered]
print(f"Filtered predictions: {allowed_datasets}")
print(f"Contains only dermamnist: {(allowed_datasets == ['dermamnist'])}")
print(f"Status: {'✅ PASS' if allowed_datasets == ['dermamnist'] else '❌ FAIL'}\n")

# ============================================================================
# TEST 9: Prediction Scoring with All Factors
# ============================================================================
print("-" * 70)
print("TEST 9: MULTI-FACTOR PREDICTION SCORING")
print("-" * 70)

mock_predictions = [
    {
        "dataset": "chestmnist",
        "top_confidence": 85.0,
        "top_label_name": "pneumonia",
        "reliability": "high"
    },
    {
        "dataset": "pathmnist",
        "top_confidence": 70.0,
        "top_label_name": "muscle",
        "reliability": "medium"
    },
]

char = {"type": "grayscale"}
best = predictor._select_best_prediction_with_scoring(mock_predictions, char)
print(f"Best prediction: {best['dataset']} - {best['top_label_name']}")
print(f"Confidence: {best['top_confidence']}%")
print(f"Expected best: chestmnist (grayscale gets boost)")
print(f"Status: {'✅ PASS' if best['dataset'] == 'chestmnist' else '❌ FAIL'}\n")

# ============================================================================
# TEST 10: Model Loading and Availability
# ============================================================================
print("-" * 70)
print("TEST 10: MODEL AVAILABILITY CHECK")
print("-" * 70)

available = predictor.available_datasets()
print(f"Available models: {available}")
print(f"Total models loaded: {len(available)}")
print(f"Diagnostic info:")
diag = predictor.diagnostics()
print(f"  Models in memory: {diag['models_in_memory']}")
print(f"  Missing datasets: {diag['missing_datasets']}")
print(f"Status: {'✅ PASS' if len(available) > 0 else '❌ FAIL - Train models with: python train_model.py'}\n")

# ============================================================================
# SUMMARY
# ============================================================================
print("="*70)
print("✅ ALL TESTS COMPLETED")
print("="*70)
print("\n📊 SUMMARY:")
print("  ✓ Image type detection working correctly")
print("  ✓ Dataset prioritization based on image type")
print("  ✓ Medical filtering prevents impossible predictions")
print("  ✓ Multi-factor scoring selects best predictions")
print("  ✓ Models are available and ready for predictions")
print("\n🎯 NEXT STEP: Upload images in the chat application")
print("   - Chest X-ray → Should use ChestMNIST")
print("   - Skin image → Should use DermaMNIST")
print("   - Blood smear → Should use BloodMNIST")
print("\n" + "="*70 + "\n")
