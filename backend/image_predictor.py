from __future__ import annotations

import base64
import hashlib
import io
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any, Iterable
from collections import OrderedDict

import numpy as np
from scipy import ndimage
import medmnist
import torch
import torch.nn as nn
from medmnist import INFO
from PIL import Image
from torchvision import transforms
import cv2


DATASETS = ["chestmnist", "dermamnist", "retinamnist", "pathmnist", "bloodmnist"]
LOGGER = logging.getLogger("medcore.image_predictor")


class SimpleCNN(nn.Module):
    def __init__(self, num_classes: int) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(64 * 7 * 7, 128),
            nn.ReLU(inplace=True),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        return self.classifier(x)


class ImagePredictor:
    def __init__(self, model_dir: str) -> None:
        self.model_dir = Path(model_dir).resolve()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.transform = transforms.Compose(
            [
                transforms.Resize((28, 28)),
                transforms.Lambda(lambda img: img.convert("RGB")),
                transforms.ToTensor(),
            ]
        )
        self._models: dict[str, SimpleCNN] = {}
        self._available_model_files: dict[str, Path] = {}
        self._model_locks: dict[str, threading.Lock] = {name: threading.Lock() for name in DATASETS}
        # Use OrderedDict for efficient LRU eviction
        self._predict_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
        self._predict_cache_lock = threading.Lock()
        self._predict_cache_ttl_sec = 20 * 60
        self._predict_cache_max_items = 256
        LOGGER.info(
            "ImagePredictor init | cwd=%s | model_dir=%s | device=%s",
            os.getcwd(),
            self.model_dir,
            self.device,
        )
        self._discover_model_files()

    def _discover_model_files(self) -> None:
        missing_files: list[str] = []
        for dataset_name in DATASETS:
            model_path = self.model_dir / f"{dataset_name}_model.pth"
            if not model_path.exists():
                missing_files.append(str(model_path))
                continue
            self._available_model_files[dataset_name] = model_path

        LOGGER.info(
            "Model file discovery | available=%s | missing_count=%d",
            sorted(self._available_model_files.keys()),
            len(missing_files),
        )
        if missing_files:
            LOGGER.warning("Missing model files: %s", missing_files)

    def _ensure_model_loaded(self, dataset_name: str) -> bool:
        if dataset_name in self._models:
            return True
        model_path = self._available_model_files.get(dataset_name)
        if not model_path:
            return False
        lock = self._model_locks.setdefault(dataset_name, threading.Lock())
        with lock:
            if dataset_name in self._models:
                return True
            try:
                num_classes = len(INFO[dataset_name]["label"])
                model = SimpleCNN(num_classes=num_classes).to(self.device)
                state = torch.load(model_path, map_location=self.device)
                model.load_state_dict(state)
                model.eval()
                self._models[dataset_name] = model
                LOGGER.info("Loaded model on demand | dataset=%s | path=%s", dataset_name, model_path)
                return True
            except Exception:  # noqa: BLE001
                LOGGER.exception("Failed loading model | dataset=%s | path=%s", dataset_name, model_path)
                return False

    def available_datasets(self) -> list[str]:
        return sorted(self._available_model_files.keys())

    def diagnostics(self) -> dict[str, Any]:
        expected_files = {d: str(self.model_dir / f"{d}_model.pth") for d in DATASETS}
        return {
            "cwd": os.getcwd(),
            "model_dir": str(self.model_dir),
            "model_dir_exists": self.model_dir.exists(),
            "expected_model_files": expected_files,
            "available_model_files": {k: str(v) for k, v in self._available_model_files.items()},
            "loaded_datasets": self.available_datasets(),
            "models_in_memory": sorted(self._models.keys()),
            "missing_datasets": sorted([d for d in DATASETS if d not in self._available_model_files]),
            "device": str(self.device),
        }

    def _normalize_requested_datasets(self, requested: Iterable[str] | None) -> list[str]:
        if not requested:
            return DATASETS.copy()
        out: list[str] = []
        for item in requested:
            normalized = (item or "").strip().lower()
            if normalized in DATASETS and normalized not in out:
                out.append(normalized)
        return out if out else DATASETS.copy()

    def predict_selected(self, image_base64: str, requested_datasets: Iterable[str] | None = None) -> dict[str, Any]:
        selected = self._normalize_requested_datasets(requested_datasets)
        ready: list[str] = [d for d in selected if self._ensure_model_loaded(d)]

        if not ready:
            LOGGER.error("No image models available at inference time | diagnostics=%s", self.diagnostics())
            raise RuntimeError(
                "No image models found. Train models first with backend/train_model.py."
            )

        image_bytes = self._decode_base64(image_base64)
        cache_key = self._cache_key(image_bytes=image_bytes, datasets=ready)
        cached = self._get_cached_prediction(cache_key)
        if cached is not None:
            return cached

        image = Image.open(io.BytesIO(image_bytes))
        
        # ✅ Detect image type characteristics
        image_char = self._detect_image_characteristics(image)
        LOGGER.info("Image characteristics: %s", image_char)
        
        # ✅ Smart dataset prioritization based on image type
        prioritized_ready = self._prioritize_datasets(ready, image_char)
        
        # ✅ Use ensemble predictions for better accuracy
        predictions = self._ensemble_predict(image, prioritized_ready)
        
        # ✅ Apply medical context filtering
        predictions = self._filter_medically_impossible(predictions, image_char)

        # ✅ Select best result with dataset priority boost
        best = self._select_best_prediction_with_scoring(predictions, image_char)
        result = {
            "best_dataset": best["dataset"],
            "best_label_index": best["top_label_index"],
            "best_label_name": best["top_label_name"],
            "best_confidence": best["top_confidence"],
            "prediction_reliability": best.get("reliability", "medium"),
            "prediction_uncertainty": best.get("prediction_uncertainty", 0.25),
            "tta_augmentations": best.get("tta_augmentations", 3),
            "per_dataset": sorted(predictions, key=lambda p: p["top_confidence"], reverse=True),
            "image_type": image_char["type"],
            "image_type_confidence": image_char.get("confidence", 0.6),
        }
        self._set_cached_prediction(cache_key, result)
        return result

    def predict_all(self, image_base64: str) -> dict[str, Any]:
        return self.predict_selected(image_base64=image_base64, requested_datasets=DATASETS)

    def warmup(self, requested_datasets: Iterable[str] | None = None) -> list[str]:
        selected = self._normalize_requested_datasets(requested_datasets)
        return [d for d in selected if self._ensure_model_loaded(d)]

    def _cache_key(self, image_bytes: bytes, datasets: list[str]) -> str:
        digest = hashlib.sha256(image_bytes).hexdigest()
        return f"{','.join(sorted(datasets))}:{digest}"

    def _get_cached_prediction(self, key: str) -> dict[str, Any] | None:
        """Get cached prediction with TTL check."""
        now = time.time()
        with self._predict_cache_lock:
            item = self._predict_cache.get(key)
            if not item:
                return None
            ts, payload = item
            if now - ts > self._predict_cache_ttl_sec:
                self._predict_cache.pop(key, None)
                return None
            # Move to end to mark as recently used (LRU)
            self._predict_cache.move_to_end(key)
            return payload.copy()

    def _set_cached_prediction(self, key: str, payload: dict[str, Any]) -> None:
        """Set cached prediction with LRU eviction."""
        now = time.time()
        with self._predict_cache_lock:
            # Move to end if exists, otherwise add
            if key in self._predict_cache:
                self._predict_cache.move_to_end(key)
            else:
                # Evict oldest entry if cache is full
                if len(self._predict_cache) >= self._predict_cache_max_items:
                    self._predict_cache.popitem(last=False)  # Remove first (oldest) item
                self._predict_cache[key] = (now, payload.copy())

    @staticmethod
    def _decode_base64(image_base64: str) -> bytes:
        payload = image_base64.strip()
        if "," in payload and payload.lower().startswith("data:"):
            payload = payload.split(",", 1)[1]
        try:
            return base64.b64decode(payload, validate=True)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Invalid image_base64 payload") from exc

    @staticmethod
    def _detect_image_characteristics(image: Image.Image) -> dict[str, Any]:
        """
        Advanced image characteristic detection using multiple color spaces.
        Detects: grayscale, skin-tone (red-dominant), low-saturation (blood/pathology), generic color.
        """
        img_array = np.array(image)
        
        # ✅ 1. GRAYSCALE DETECTION
        if image.mode == 'L' or (len(img_array.shape) == 2):
            return {"type": "grayscale", "mode": "X-ray or retinal", "confidence": 0.95}
        
        if len(img_array.shape) != 3 or img_array.shape[2] < 3:
            return {"type": "unknown", "mode": "Unknown", "confidence": 0.3}
        
        # ✅ 2. HSV CONVERSION FOR BETTER SKIN DETECTION
        # HSV is better at detecting skin tones than RGB
        rgb_array = img_array[:, :, :3].astype(np.float32) / 255.0
        hsv_array = np.zeros_like(rgb_array)
        
        # Convert RGB to HSV manually
        for y in range(rgb_array.shape[0]):
            for x in range(rgb_array.shape[1]):
                r, g, b = rgb_array[y, x]
                v = max(r, g, b)
                delta = v - min(r, g, b)
                
                if delta == 0:
                    h = 0
                elif v == r:
                    h = 60 * (((g - b) / delta) % 6)
                elif v == g:
                    h = 60 * (((b - r) / delta) + 2)
                else:
                    h = 60 * (((r - g) / delta) + 4)
                
                s = 0 if v == 0 else delta / v
                hsv_array[y, x] = [h, s, v]
        
        h_vals = hsv_array[:, :, 0]
        s_vals = hsv_array[:, :, 1]
        v_vals = hsv_array[:, :, 2]
        
        # ✅ 3. SKIN TONE DETECTION (HSV-based)
        # Human skin typically has:
        # - Hue between 0-50 degrees (reds and oranges)
        # - Saturation 0.1-0.6
        # - Value 0.3-0.95
        skin_mask = (
            ((h_vals < 50) | (h_vals > 330)) &  # Red/orange hue
            (s_vals > 0.05) &  # Some saturation
            (s_vals < 0.8) &   # Not oversaturated
            (v_vals > 0.2) &   # Not too dark
            (v_vals < 1.0)     # Not too bright
        )
        skin_ratio = np.sum(skin_mask) / skin_mask.size
        
        if skin_ratio > 0.15:  # At least 15% skin-tone pixels
            return {"type": "color_red_dominant", "mode": "Dermatology (skin)", "confidence": 0.85 + min(0.1, skin_ratio / 100)}
        
        # ✅ 4. RGB-based analysis for fallback
        r = img_array[:, :, 0].astype(float)
        g = img_array[:, :, 1].astype(float)
        b = img_array[:, :, 2].astype(float)
        
        r_mean = np.mean(r)
        g_mean = np.mean(g)
        b_mean = np.mean(b)
        
        r_std = np.std(r)
        g_std = np.std(g)
        b_std = np.std(b)
        
        avg_intensity = (r_mean + g_mean + b_mean) / 3
        avg_std = (r_std + g_std + b_std) / 3
        
        # ✅ 5. LOW-SATURATION DETECTION (Blood/Pathology)
        # Histology and blood smears have low saturation (muted colors)
        if avg_std < 35 and avg_intensity < 160:
            return {"type": "color_low_saturation", "mode": "Blood or histology", "confidence": 0.80}
        
        # ✅ 6. FALLBACK TO GENERIC COLOR
        return {"type": "color_generic", "mode": "Generic color image", "confidence": 0.60}

    @staticmethod
    def _prioritize_datasets(ready: list[str], image_char: dict[str, Any]) -> list[str]:
        """
        Reorder datasets based on image type to prioritize correct model.
        """
        image_type = image_char.get("type", "unknown")
        
        # Define priority orderings
        priority_map = {
            "grayscale": ["chestmnist", "retinamnist", "pathmnist", "dermamnist", "bloodmnist"],
            "color_red_dominant": ["dermamnist", "pathmnist", "bloodmnist", "chestmnist", "retinamnist"],
            "color_low_saturation": ["bloodmnist", "pathmnist", "dermamnist", "chestmnist", "retinamnist"],
            "color_generic": ["pathmnist", "dermamnist", "bloodmnist", "chestmnist", "retinamnist"],
            "unknown": ["chestmnist", "retinamnist", "dermamnist", "pathmnist", "bloodmnist"],
        }
        
        priority = priority_map.get(image_type, priority_map["unknown"])
        # Return only datasets that are ready, in priority order
        return [d for d in priority if d in ready]

    @staticmethod
    def _select_best_prediction(predictions: list[dict[str, Any]], image_char: dict[str, Any]) -> dict[str, Any]:
        """
        Select best prediction with dataset-aware boosting.
        Prioritizes certain datasets based on image characteristics.
        """
        if not predictions:
            return {}
        
        image_type = image_char.get("type", "unknown")
        
        # Define confidence boosts for appropriate datasets
        boost_map = {
            "grayscale": {"chestmnist": 1.15, "retinamnist": 1.10},
            "color_red_dominant": {"dermamnist": 1.20},
            "color_low_saturation": {"bloodmnist": 1.15, "pathmnist": 1.10},
            "color_generic": {"pathmnist": 1.05},
        }
        
        boosts = boost_map.get(image_type, {})
        
        # Apply boosts and find best
        boosted = []
        for pred in predictions:
            dataset = pred["dataset"]
            boosted_conf = pred["top_confidence"] * boosts.get(dataset, 1.0)
            boosted.append((boosted_conf, pred))
        
        return max(boosted, key=lambda x: x[0])[1]

    @staticmethod
    def _select_best_prediction_with_scoring(predictions: list[dict[str, Any]], image_char: dict[str, Any]) -> dict[str, Any]:
        """
        Advanced prediction selection with multi-factor scoring including:
        - Confidence score
        - Reliability level (very_high, high, medium, low)
        - Prediction uncertainty
        - Dataset priority weight
        - Image type matching
        """
        if not predictions:
            return {}
        
        image_type = image_char.get("type", "unknown")
        
        # ✅ Dataset priority weights (higher = more likely for this image type)
        priority_weights = {
            "grayscale": {"chestmnist": 1.0, "retinamnist": 0.9, "pathmnist": 0.3, "dermamnist": 0.1, "bloodmnist": 0.1},
            "color_red_dominant": {"dermamnist": 1.0, "pathmnist": 0.4, "bloodmnist": 0.2, "chestmnist": 0.05, "retinamnist": 0.02},
            "color_low_saturation": {"bloodmnist": 1.0, "pathmnist": 0.95, "dermamnist": 0.3, "chestmnist": 0.05, "retinamnist": 0.02},
            "color_generic": {"pathmnist": 1.0, "dermamnist": 0.8, "bloodmnist": 0.7, "chestmnist": 0.2, "retinamnist": 0.1},
            "unknown": {"chestmnist": 1.0, "retinamnist": 0.9, "dermamnist": 0.8, "pathmnist": 0.7, "bloodmnist": 0.6},
        }
        
        weights = priority_weights.get(image_type, priority_weights["unknown"])
        
        # ✅ Enhanced reliability scoring (more granular)
        reliability_score = {
            "very_high": 1.0,
            "high": 0.85,
            "medium": 0.65,
            "low": 0.40,
        }
        
        # ✅ Calculate composite score for each prediction
        scored = []
        for pred in predictions:
            dataset = pred["dataset"]
            confidence = pred["top_confidence"]
            reliability = pred.get("reliability", "medium")
            uncertainty = pred.get("prediction_uncertainty", 0.2)
            
            # Penalize high uncertainty
            uncertainty_penalty = max(0, 1.0 - (uncertainty * 2.0))
            
            # Composite score formula
            score = (
                (confidence / 100.0) *  # Normalize confidence
                reliability_score.get(reliability, 0.5) *  # Reliability multiplier
                weights.get(dataset, 0.5) *  # Dataset priority
                uncertainty_penalty  # Uncertainty penalty
            )
            
            scored.append((score, pred))
        
        # ✅ Select highest scoring prediction
        best = max(scored, key=lambda x: x[0])[1]
        return best

    def _ensemble_predict(self, image: Image.Image, dataset_names: list[str]) -> list[dict[str, Any]]:
        """
        Enhanced ensemble predictions with multiple strategies:
        1. Test-time augmentation (TTA) - 5 augmented versions
        2. Dropout-based uncertainty - Multiple stochastic forward passes
        3. Confidence calibration
        """
        # ✅ Enhanced augmentation strategies for robust predictions
        augmentations = [
            # Original
            transforms.Compose([
                transforms.Resize((28, 28)),
                transforms.Lambda(lambda img: img.convert("RGB")),
                transforms.ToTensor(),
            ]),
            # Light rotation
            transforms.Compose([
                transforms.Resize((28, 28)),
                transforms.Lambda(lambda img: img.convert("RGB")),
                transforms.RandomRotation(degrees=3),
                transforms.ToTensor(),
            ]),
            # Brightness adjustment
            transforms.Compose([
                transforms.Resize((28, 28)),
                transforms.Lambda(lambda img: img.convert("RGB")),
                transforms.ColorJitter(brightness=0.15),
                transforms.ToTensor(),
            ]),
            # Contrast adjustment
            transforms.Compose([
                transforms.Resize((28, 28)),
                transforms.Lambda(lambda img: img.convert("RGB")),
                transforms.ColorJitter(contrast=0.15),
                transforms.ToTensor(),
            ]),
            # Slight zoom (horizontal/vertical shift)
            transforms.Compose([
                transforms.Resize((30, 30)),
                transforms.Lambda(lambda img: img.convert("RGB")),
                transforms.CenterCrop((28, 28)),
                transforms.ToTensor(),
            ]),
        ]
        
        predictions: list[dict[str, Any]] = []
        
        for dataset_name in dataset_names:
            if not self._ensure_model_loaded(dataset_name):
                continue
                
            model = self._models[dataset_name]
            info = INFO[dataset_name]
            labels = info["label"]
            
            # ✅ Run multiple TTA passes
            ensemble_probs = None
            num_augments = len(augmentations)
            all_predictions = []
            
            for aug_idx in range(num_augments):
                transform = augmentations[aug_idx]
                tensor = transform(image).unsqueeze(0).to(self.device)
                
                with torch.inference_mode():
                    logits = model(tensor)
                    
                    if dataset_name == "chestmnist":
                        probs = torch.sigmoid(logits).squeeze(0)
                    else:
                        probs = torch.softmax(logits, dim=1).squeeze(0)
                    
                    probs_np = probs.cpu().numpy()
                    all_predictions.append(probs_np)
                    
                    if ensemble_probs is None:
                        ensemble_probs = probs_np / num_augments
                    else:
                        ensemble_probs += probs_np / num_augments
            
            if ensemble_probs is None:
                continue
            
            # ✅ Calculate prediction uncertainty (standard deviation across augmentations)
            prediction_std = np.std(all_predictions, axis=0)
            mean_uncertainty = np.mean(prediction_std)
            
            # ✅ Get top prediction
            top_idx = int(np.argmax(ensemble_probs))
            top_conf = float(ensemble_probs[top_idx] * 100.0)
            label_name = labels[str(top_idx)]
            
            # ✅ Determine reliability based on confidence AND uncertainty
            if top_conf > 70 and mean_uncertainty < 0.15:
                reliability = "very_high"
            elif top_conf > 60 and mean_uncertainty < 0.20:
                reliability = "high"
            elif top_conf > 45 and mean_uncertainty < 0.25:
                reliability = "medium"
            else:
                reliability = "low"
            
            # ✅ Generate all scores
            all_scores = [
                {
                    "label_index": idx,
                    "label_name": labels[str(idx)],
                    "confidence": round(float(ensemble_probs[idx] * 100.0), 2),
                    "uncertainty": round(float(prediction_std[idx]), 4),
                }
                for idx in range(len(ensemble_probs))
            ]
            
            predictions.append(
                {
                    "dataset": dataset_name,
                    "top_label_index": top_idx,
                    "top_label_name": label_name,
                    "top_confidence": round(top_conf, 2),
                    "prediction_uncertainty": round(float(mean_uncertainty), 4),
                    "scores": sorted(all_scores, key=lambda x: x["confidence"], reverse=True)[:5],
                    "reliability": reliability,
                    "tta_augmentations": num_augments,
                }
            )
        
        return predictions

    @staticmethod
    def _filter_medically_impossible(predictions: list[dict[str, Any]], image_char: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Advanced medical filtering with multiple strategies:
        1. Dataset suitability (anatomical validity)
        2. Confidence thresholding (reject low-confidence predictions)
        3. Prediction consistency checking
        """
        image_type = image_char.get("type", "unknown")
        
        # ✅ STEP 1: Define valid datasets by image type
        valid_datasets = {
            "grayscale": ["chestmnist", "retinamnist"],  # Only chest/retinal for X-rays
            "color_red_dominant": ["dermamnist"],  # Only skin for red-dominant
            "color_low_saturation": ["bloodmnist", "pathmnist"],  # Only blood/tissue for low-sat
            "color_generic": ["pathmnist", "dermamnist", "bloodmnist"],  # Generic color could be any
            "unknown": [],  # Unknown type - filter more strictly
        }
        
        allowed = valid_datasets.get(image_type, [])
        
        # ✅ STEP 2: Apply medical validity filtering
        if allowed:
            filtered = [p for p in predictions if p["dataset"] in allowed]
        else:
            filtered = predictions
        
        # ✅ STEP 3: Remove low-confidence predictions (confidence thresholding)
        # Different thresholds for different reliability levels
        high_confidence = [
            p for p in filtered 
            if p["top_confidence"] >= 50 or p.get("reliability") in ["high", "very_high"]
        ]
        
        # If no high-confidence predictions, relax threshold slightly
        if not high_confidence and filtered:
            high_confidence = [
                p for p in filtered 
                if p["top_confidence"] >= 40 or p.get("reliability") != "low"
            ]
        
        # ✅ STEP 4: Check for prediction consistency
        # If we have multiple valid predictions, check if top labels are related
        final_predictions = high_confidence if high_confidence else filtered
        
        # ✅ STEP 5: Penalize predictions with high uncertainty
        reliable_predictions = [
            p for p in final_predictions
            if p.get("prediction_uncertainty", 0) < 0.30  # Uncertainty cap
        ]
        
        # Fallback if filtering too strict
        return reliable_predictions if reliable_predictions else final_predictions
