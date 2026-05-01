from __future__ import annotations

import base64
import gc
import hashlib
import io
import logging
import os
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Iterable, cast

import numpy as np
import torch
import torch.nn as nn
from medmnist import INFO
from PIL import Image
from torchvision import models, transforms

from config import (
    IMAGE_INFERENCE_MAX_WORKERS,
    IMAGE_MODEL_KEEP_LOADED,
    IMAGE_MODEL_MAX_RESIDENT,
    TORCH_NUM_INTEROP_THREADS,
    TORCH_NUM_THREADS,
)

torch.set_num_threads(TORCH_NUM_THREADS)
try:
    torch.set_num_interop_threads(TORCH_NUM_INTEROP_THREADS)
except RuntimeError:
    pass

SIMPLECNN_IMAGE_SIZE = 28
RESNET_IMAGE_SIZE = 64

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

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
        return self.classifier(self.features(x))


def _is_resnet_state(state_dict: dict[str, Any]) -> bool:
    return any(k.startswith("layer1.") for k in state_dict.keys())


def _build_resnet18(num_classes: int, device: torch.device) -> nn.Module:
    model = models.resnet18(weights=None)
    model.fc = nn.Linear(model.fc.in_features, num_classes)
    return model.to(device)


class ImagePredictor:
    def __init__(self, model_dir: str) -> None:
        self.model_dir = Path(model_dir).resolve()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._models: dict[str, nn.Module] = {}
        self._model_uses_resnet: dict[str, bool] = {}
        self._available_model_files: dict[str, Path] = {}
        self._model_locks: dict[str, threading.Lock] = {name: threading.Lock() for name in DATASETS}
        self._loaded_model_order: OrderedDict[str, float] = OrderedDict()
        self._max_resident_models = max(1, IMAGE_MODEL_MAX_RESIDENT)
        self._keep_loaded = IMAGE_MODEL_KEEP_LOADED
        self._predict_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
        self._predict_cache_lock = threading.Lock()
        self._predict_cache_ttl_sec = 20 * 60
        self._predict_cache_max_items = 256
        self._executor = ThreadPoolExecutor(max_workers=max(1, IMAGE_INFERENCE_MAX_WORKERS))
        LOGGER.info(
            "ImagePredictor init | cwd=%s | model_dir=%s | device=%s | max_resident=%s | workers=%s | keep_loaded=%s",
            os.getcwd(),
            self.model_dir,
            self.device,
            self._max_resident_models,
            max(1, IMAGE_INFERENCE_MAX_WORKERS),
            self._keep_loaded,
        )
        self._discover_model_files()

    def _discover_model_files(self) -> None:
        missing_files: list[str] = []
        for dataset_name in DATASETS:
            found = False
            for ext in ("pt", "pth"):
                candidate = self.model_dir / f"{dataset_name}_model.{ext}"
                if candidate.exists():
                    self._available_model_files[dataset_name] = candidate
                    found = True
                    break
            if not found:
                missing_files.append(str(self.model_dir / f"{dataset_name}_model.(pt|pth)"))

        LOGGER.info(
            "Model file discovery | available=%s | missing_count=%d",
            sorted(self._available_model_files.keys()),
            len(missing_files),
        )
        if missing_files:
            LOGGER.warning("Missing model files: %s", missing_files)

    def _evict_if_needed(self, protected: set[str] | None = None) -> None:
        protected = protected or set()
        while len(self._models) > self._max_resident_models:
            victim = next((name for name in self._loaded_model_order.keys() if name not in protected), None)
            if not victim:
                return
            self._unload_model(victim)

    def _unload_model(self, dataset_name: str) -> None:
        model = self._models.pop(dataset_name, None)
        self._loaded_model_order.pop(dataset_name, None)
        self._model_uses_resnet.pop(dataset_name, None)
        if model is not None:
            del model
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            LOGGER.info("Unloaded model | dataset=%s", dataset_name)

    def _mark_model_used(self, dataset_name: str) -> None:
        self._loaded_model_order.pop(dataset_name, None)
        self._loaded_model_order[dataset_name] = time.time()

    def _ensure_model_loaded(self, dataset_name: str, protected: set[str] | None = None) -> bool:
        if dataset_name in self._models:
            self._mark_model_used(dataset_name)
            return True

        model_path = self._available_model_files.get(dataset_name)
        if not model_path:
            return False

        lock = self._model_locks.setdefault(dataset_name, threading.Lock())
        with lock:
            if dataset_name in self._models:
                self._mark_model_used(dataset_name)
                return True
            try:
                if model_path.suffix == ".pt":
                    model = torch.jit.load(str(model_path), map_location=self.device)
                    self._model_uses_resnet[dataset_name] = True
                else:
                    num_classes = len(INFO[dataset_name]["label"])
                    state = torch.load(model_path, map_location=self.device, weights_only=True, mmap=True)
                    if _is_resnet_state(state):
                        model = _build_resnet18(num_classes, self.device)
                        self._model_uses_resnet[dataset_name] = True
                        LOGGER.info("Auto-detected ResNet-18 weights | dataset=%s", dataset_name)
                    else:
                        model = SimpleCNN(num_classes=num_classes).to(self.device)
                        self._model_uses_resnet[dataset_name] = False
                        LOGGER.info("Auto-detected SimpleCNN weights | dataset=%s", dataset_name)
                    model.load_state_dict(state)

                model.eval()
                self._models[dataset_name] = model
                self._mark_model_used(dataset_name)
                self._evict_if_needed(protected=(protected or set()) | {dataset_name})
                LOGGER.info(
                    "Loaded model | dataset=%s | resnet=%s | path=%s",
                    dataset_name,
                    self._model_uses_resnet.get(dataset_name),
                    model_path,
                )
                return True
            except Exception:
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
            "max_resident_models": self._max_resident_models,
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
        image_bytes = self._decode_base64(image_base64)
        cache_key = self._cache_key(image_bytes=image_bytes, datasets=selected)
        cached = self._get_cached_prediction(cache_key)
        if cached is not None:
            return cached

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        predictions: list[dict[str, Any]] = []
        inference_start = time.perf_counter()

        try:
            for dataset_name in selected:
                if not self._ensure_model_loaded(dataset_name, protected={dataset_name}):
                    continue
                single_prediction = self._predict_single(image, dataset_name)
                if single_prediction:
                    predictions.append(single_prediction)
                if self._keep_loaded:
                    self._evict_if_needed()
                else:
                    self._unload_model(dataset_name)
        finally:
            image.close()
            gc.collect()

        inference_duration = float(f"{(time.perf_counter() - inference_start) * 1000:.2f}")
        LOGGER.info("Sequential inference completed | datasets=%d | duration_ms=%s", len(predictions), inference_duration)

        if not predictions:
            LOGGER.error("No image models available at inference time | diagnostics=%s", self.diagnostics())
            raise RuntimeError("No predictions generated")

        best = max(predictions, key=lambda p: p["top_confidence"])
        result = {
            "best_dataset": best["dataset"],
            "best_label_index": best["top_label_index"],
            "best_label_name": best["top_label_name"],
            "best_confidence": best["top_confidence"],
            "prediction_reliability": "high" if best["top_confidence"] > 70 else "medium",
            "prediction_uncertainty": 0.0,
            "tta_augmentations": 1,
            "per_dataset": sorted(predictions, key=lambda p: float(str(p["top_confidence"])), reverse=True),
            "image_type": "unknown",
            "image_type_confidence": 0.0,
        }
        self._set_cached_prediction(cache_key, result)
        return result

    def predict_all(self, image_base64: str) -> dict[str, Any]:
        return self.predict_selected(image_base64=image_base64, requested_datasets=DATASETS)

    def warmup(self, requested_datasets: Iterable[str] | None = None) -> list[str]:
        warmed: list[str] = []
        for dataset_name in self._normalize_requested_datasets(requested_datasets):
            if not self._ensure_model_loaded(dataset_name, protected={dataset_name}):
                continue
            warmed.append(dataset_name)
            try:
                model = self._models[dataset_name]
                image_size = RESNET_IMAGE_SIZE if self._model_uses_resnet.get(dataset_name) else SIMPLECNN_IMAGE_SIZE
                dummy = torch.randn(1, 3, image_size, image_size, device=self.device)
                with torch.no_grad():
                    _ = model.forward(dummy)
            except Exception:
                LOGGER.exception("Warmup forward pass failed for %s", dataset_name)
            if self._keep_loaded:
                self._evict_if_needed()
            else:
                self._unload_model(dataset_name)
        return warmed

    def _cache_key(self, image_bytes: bytes, datasets: list[str]) -> str:
        digest = hashlib.sha256(image_bytes).hexdigest()
        return f"{','.join(sorted(datasets))}:{digest}"

    def _get_cached_prediction(self, key: str) -> dict[str, Any] | None:
        now = time.time()
        with self._predict_cache_lock:
            item = self._predict_cache.get(key)
            if not item:
                return None
            ts, payload = item
            if now - ts > self._predict_cache_ttl_sec:
                self._predict_cache.pop(key, None)
                return None
            self._predict_cache.move_to_end(key)
            return payload.copy()

    def _set_cached_prediction(self, key: str, payload: dict[str, Any]) -> None:
        now = time.time()
        with self._predict_cache_lock:
            if key in self._predict_cache:
                self._predict_cache.move_to_end(key)
            else:
                if len(self._predict_cache) >= self._predict_cache_max_items:
                    self._predict_cache.popitem(last=False)
                self._predict_cache[key] = (now, payload.copy())

    @staticmethod
    def _decode_base64(image_base64: str) -> bytes:
        payload = image_base64.strip()
        if "," in payload and payload.lower().startswith("data:"):
            payload = payload.split(",", 1)[1]
        try:
            return base64.b64decode(payload, validate=True)
        except Exception as exc:
            raise ValueError("Invalid image_base64 payload") from exc

    def _build_tensor(self, image: Image.Image, dataset_name: str) -> torch.Tensor:
        if self._model_uses_resnet.get(dataset_name, False):
            tf = transforms.Compose([
                transforms.Resize((RESNET_IMAGE_SIZE, RESNET_IMAGE_SIZE)),
                transforms.ToTensor(),
                transforms.Normalize(mean=IMAGENET_MEAN, std=IMAGENET_STD),
            ])
        else:
            tf = transforms.Compose([
                transforms.Resize((SIMPLECNN_IMAGE_SIZE, SIMPLECNN_IMAGE_SIZE)),
                transforms.ToTensor(),
            ])
        return tf(image).unsqueeze(0).to(self.device).detach()

    def _predict_single(self, image: Image.Image, dataset_name: str) -> dict[str, Any] | None:
        model = self._models.get(dataset_name)
        if model is None:
            return None

        try:
            info = INFO[dataset_name]
            labels = cast(dict[str, str], info["label"])
            tensor = self._build_tensor(image, dataset_name)
            start_time = time.perf_counter()

            with torch.inference_mode():
                logits = model.forward(tensor)
                if dataset_name == "chestmnist":
                    probs = torch.sigmoid(logits).squeeze(0)
                else:
                    probs = torch.softmax(logits, dim=1).squeeze(0)

            probs_np = probs.cpu().numpy()
            top_idx = int(np.argmax(probs_np))
            top_conf = float(probs_np[top_idx] * 100.0)

            all_scores: list[dict[str, Any]] = []
            for idx in range(len(probs_np)):
                all_scores.append({
                    "label_index": idx,
                    "label_name": labels[str(idx)],
                    "confidence": float(f"{probs_np[idx] * 100.0:.2f}"),
                })

            scores_sorted = sorted(all_scores, key=lambda s: float(s.get("confidence", 0)), reverse=True)
            duration = (time.perf_counter() - start_time) * 1000
            arch = "resnet18" if self._model_uses_resnet.get(dataset_name) else "simplecnn"
            LOGGER.info("Inference dataset=%s | arch=%s | duration=%.2fms", dataset_name, arch, duration)

            return {
                "dataset": dataset_name,
                "top_label_index": top_idx,
                "top_label_name": labels[str(top_idx)],
                "top_confidence": float(f"{top_conf:.2f}"),
                "scores": scores_sorted[:5],
            }
        except Exception:
            LOGGER.exception("Inference failed for dataset=%s", dataset_name)
            return None
        finally:
            if "tensor" in locals():
                del tensor
            if "logits" in locals():
                del logits
            if "probs" in locals():
                del probs
            if "probs_np" in locals():
                del probs_np
            gc.collect()
