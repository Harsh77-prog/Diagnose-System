"""
High-accuracy MedMNIST training script.

Improvements over v1:
  - ResNet-18 backbone (pretrained on ImageNet, then fine-tuned)
  - 28x28 input upscaled to 64x64 for ResNet compatibility
  - WeightedRandomSampler to fix severe class imbalance (especially DermaMNIST)
  - Data augmentation (horizontal flip, rotation, color jitter)
  - Cosine annealing LR scheduler
  - 15 epochs per model (vs 3 in v1)
  - Label smoothing in classification loss
  - Saves both .pth (state dict) and .pt (TorchScript) for faster inference
"""

from __future__ import annotations
from pathlib import Path
from collections import Counter

import medmnist
import torch
import torch.nn as nn
import torch.optim as optim
from medmnist import INFO
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import transforms, models


DATASETS = ["chestmnist", "dermamnist", "retinamnist", "pathmnist", "bloodmnist"]
PROJECT_ROOT = Path(__file__).resolve().parent
DATA_DIR = PROJECT_ROOT / "medical_ML" / "data"
MODEL_DIR = PROJECT_ROOT / "medical_ML" / "models"

# Higher resolution helps ResNet extract better features from 28x28 medical images
IMAGE_SIZE = 64


def build_resnet18(num_classes: int, multi_label: bool = False) -> nn.Module:
    """ResNet-18 with modified final layer for MedMNIST classes."""
    model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    # Replace final layer to match number of target classes
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    return model


def build_train_transform() -> transforms.Compose:
    return transforms.Compose([
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.Lambda(lambda img: img.convert("RGB")),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(p=0.15),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.1),
        transforms.RandomAffine(degrees=0, translate=(0.05, 0.05)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def build_val_transform() -> transforms.Compose:
    return transforms.Compose([
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.Lambda(lambda img: img.convert("RGB")),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def build_weighted_loader(dataset_name: str, batch_size: int) -> DataLoader:
    """Build a training loader that compensates for class imbalance using WeightedRandomSampler."""
    info = INFO[dataset_name]
    dataset_class = getattr(medmnist, info["python_class"])
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    dataset = dataset_class(
        split="train",
        transform=build_train_transform(),
        download=True,
        root=str(DATA_DIR),
    )

    # Get all labels for computing class weights
    is_multi_label = dataset_name == "chestmnist"
    if is_multi_label:
        # For chest (multi-label), use uniform sampler — class balancing per slot is complex
        return DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=0, pin_memory=False)

    # Single-label: compute per-class sample weights
    all_labels = [int(dataset[i][1].item()) for i in range(len(dataset))]
    class_counts = Counter(all_labels)
    num_classes = len(class_counts)
    max_count = max(class_counts.values())

    # Weight inversely proportional to class frequency (minority classes get higher weight)
    class_weight = {cls: max_count / count for cls, count in class_counts.items()}
    sample_weights = [class_weight[label] for label in all_labels]

    sampler = WeightedRandomSampler(
        weights=sample_weights,
        num_samples=len(sample_weights),
        replacement=True,
    )
    print(f"  [{dataset_name}] Class distribution: {dict(sorted(class_counts.items()))}")
    print(f"  [{dataset_name}] Class weights: { {k: f'{v:.2f}' for k, v in sorted(class_weight.items())} }")

    return DataLoader(dataset, batch_size=batch_size, sampler=sampler, num_workers=0, pin_memory=False)


def build_val_loader(dataset_name: str, batch_size: int) -> DataLoader:
    info = INFO[dataset_name]
    dataset_class = getattr(medmnist, info["python_class"])
    dataset = dataset_class(
        split="val",
        transform=build_val_transform(),
        download=True,
        root=str(DATA_DIR),
    )
    return DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=0, pin_memory=False)


def compute_val_accuracy(model: nn.Module, val_loader: DataLoader, dataset_name: str, device: torch.device) -> float:
    """Compute validation accuracy."""
    model.eval()
    is_multi_label = dataset_name == "chestmnist"
    correct = 0
    total = 0

    with torch.no_grad():
        for images, labels in val_loader:
            images = images.to(device)
            outputs = model(images)

            if is_multi_label:
                preds = (torch.sigmoid(outputs) > 0.5).cpu()
                targets = labels.bool()
                correct += (preds == targets).all(dim=1).sum().item()
            else:
                preds = outputs.argmax(dim=1).cpu()
                targets = labels.view(-1)
                correct += (preds == targets).sum().item()
            total += labels.shape[0]

    return 100.0 * correct / max(1, total)


def train_single_dataset(
    dataset_name: str,
    epochs: int = 15,
    batch_size: int = 64,
    lr: float = 3e-4,
) -> Path:
    num_classes = len(INFO[dataset_name]["label"])
    is_multi_label = dataset_name == "chestmnist"
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    print(f"\n{'='*55}")
    print(f"  Training: {dataset_name} | classes={num_classes} | device={device}")
    print(f"{'='*55}")

    model = build_resnet18(num_classes=num_classes, multi_label=is_multi_label).to(device)

    # Criterion - label smoothing helps generalization
    label_smoothing = 0.1
    if is_multi_label:
        criterion = nn.BCEWithLogitsLoss()
    else:
        criterion = nn.CrossEntropyLoss(label_smoothing=label_smoothing)

    # Optimizer with weight decay
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)

    # Cosine annealing: slowly reduces LR over training
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-6)

    train_loader = build_weighted_loader(dataset_name, batch_size=batch_size)
    val_loader = build_val_loader(dataset_name, batch_size=batch_size)

    best_val_acc = 0.0
    best_model_state = None

    for epoch in range(epochs):
        model.train()
        running_loss = 0.0
        for images, labels in train_loader:
            images = images.to(device)
            if is_multi_label:
                labels = labels.float().to(device)
            else:
                labels = labels.view(-1).long().to(device)

            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()

        scheduler.step()
        avg_loss = running_loss / max(1, len(train_loader))
        val_acc = compute_val_accuracy(model, val_loader, dataset_name, device)

        print(f"  Epoch {epoch + 1:2d}/{epochs} | loss: {avg_loss:.4f} | val_acc: {val_acc:.1f}%")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_model_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}

    print(f"  Best val_acc: {best_val_acc:.1f}%")

    # Restore best weights
    if best_model_state:
        model.load_state_dict(best_model_state)
        model = model.to(device)

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    output_path = MODEL_DIR / f"{dataset_name}_model.pth"

    # Save CPU state dict for portability
    model_cpu = model.cpu()
    torch.save(model_cpu.state_dict(), output_path)
    print(f"  Saved state dict: {output_path}")

    # TorchScript export (optional for faster inference)
    # Note: ResNet-18 with standard layers scripts fine
    try:
        model_cpu.eval()
        example = torch.randn(1, 3, IMAGE_SIZE, IMAGE_SIZE)
        traced = torch.jit.trace(model_cpu, example)
        ts_path = MODEL_DIR / f"{dataset_name}_model.pt"
        traced.save(str(ts_path))
        print(f"  Saved TorchScript: {ts_path}")
    except Exception as exc:
        print(f"  TorchScript export failed for {dataset_name}: {exc}")

    return output_path


def main() -> None:
    print(f"Project root: {PROJECT_ROOT}")
    print(f"Data dir:     {DATA_DIR}")
    print(f"Model dir:    {MODEL_DIR}")
    print(f"CUDA:         {torch.cuda.is_available()}")
    print(f"Image size:   {IMAGE_SIZE}x{IMAGE_SIZE}")
    print(f"Backbone:     ResNet-18 (pretrained ImageNet)")

    for dataset_name in DATASETS:
        train_single_dataset(dataset_name=dataset_name)

    print("\n✅ All models trained and saved.")


if __name__ == "__main__":
    main()
