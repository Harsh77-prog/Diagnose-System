from __future__ import annotations

import base64
import io
import logging
import os
from pathlib import Path
from typing import Any, Iterable

import medmnist
import torch
import torch.nn as nn
from medmnist import INFO
from PIL import Image
from torchvision import transforms


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
        image = Image.open(io.BytesIO(image_bytes))
        tensor = self.transform(image).unsqueeze(0).to(self.device)

        predictions: list[dict[str, Any]] = []
        for dataset_name in ready:
            model = self._models[dataset_name]
            info = INFO[dataset_name]
            labels = info["label"]

            with torch.no_grad():
                logits = model(tensor)
                if dataset_name == "chestmnist":
                    probs = torch.sigmoid(logits).squeeze(0)
                    top_idx = int(torch.argmax(probs).item())
                    top_conf = float(probs[top_idx].item() * 100.0)
                    label_name = labels[str(top_idx)]
                    all_scores = [
                        {
                            "label_index": idx,
                            "label_name": labels[str(idx)],
                            "confidence": round(float(score.item() * 100.0), 2),
                        }
                        for idx, score in enumerate(probs)
                    ]
                else:
                    probs = torch.softmax(logits, dim=1).squeeze(0)
                    top_idx = int(torch.argmax(probs).item())
                    top_conf = float(probs[top_idx].item() * 100.0)
                    label_name = labels[str(top_idx)]
                    all_scores = [
                        {
                            "label_index": idx,
                            "label_name": labels[str(idx)],
                            "confidence": round(float(score.item() * 100.0), 2),
                        }
                        for idx, score in enumerate(probs)
                    ]

            predictions.append(
                {
                    "dataset": dataset_name,
                    "top_label_index": top_idx,
                    "top_label_name": label_name,
                    "top_confidence": round(top_conf, 2),
                    "scores": sorted(all_scores, key=lambda x: x["confidence"], reverse=True)[:5],
                }
            )

        best = max(predictions, key=lambda p: p["top_confidence"])
        return {
            "best_dataset": best["dataset"],
            "best_label_index": best["top_label_index"],
            "best_label_name": best["top_label_name"],
            "best_confidence": best["top_confidence"],
            "per_dataset": sorted(predictions, key=lambda p: p["top_confidence"], reverse=True),
        }

    def predict_all(self, image_base64: str) -> dict[str, Any]:
        return self.predict_selected(image_base64=image_base64, requested_datasets=DATASETS)

    def warmup(self, requested_datasets: Iterable[str] | None = None) -> list[str]:
        selected = self._normalize_requested_datasets(requested_datasets)
        return [d for d in selected if self._ensure_model_loaded(d)]

    @staticmethod
    def _decode_base64(image_base64: str) -> bytes:
        payload = image_base64.strip()
        if "," in payload and payload.lower().startswith("data:"):
            payload = payload.split(",", 1)[1]
        try:
            return base64.b64decode(payload, validate=True)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Invalid image_base64 payload") from exc
