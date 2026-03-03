from pathlib import Path

import medmnist
import torch
import torch.nn as nn
import torch.optim as optim
from medmnist import INFO
from torch.utils.data import DataLoader
from torchvision import transforms


DATASETS = ["chestmnist", "dermamnist", "retinamnist", "pathmnist", "bloodmnist"]


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


def build_loader(dataset_name: str, batch_size: int, split: str = "train") -> DataLoader:
    info = INFO[dataset_name]
    dataset_class = getattr(medmnist, info["python_class"])
    transform = transforms.Compose([transforms.Lambda(lambda x: x.convert("RGB")), transforms.ToTensor()])
    dataset = dataset_class(
        split=split,
        transform=transform,
        download=True,
        root="backend/medical_ML/data",
    )
    return DataLoader(dataset, batch_size=batch_size, shuffle=(split == "train"))


def train_single_dataset(
    dataset_name: str,
    epochs: int = 3,
    batch_size: int = 64,
    lr: float = 1e-3,
) -> Path:
    num_classes = len(INFO[dataset_name]["label"])
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = SimpleCNN(num_classes=num_classes).to(device)
    optimizer = optim.Adam(model.parameters(), lr=lr)
    criterion = nn.BCEWithLogitsLoss() if dataset_name == "chestmnist" else nn.CrossEntropyLoss()
    train_loader = build_loader(dataset_name, batch_size=batch_size, split="train")

    model.train()
    for epoch in range(epochs):
        running_loss = 0.0
        for images, labels in train_loader:
            images = images.to(device)
            if dataset_name == "chestmnist":
                labels = labels.float().to(device)
            else:
                labels = labels.view(-1).long().to(device)

            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()

        avg_loss = running_loss / max(1, len(train_loader))
        print(f"[{dataset_name}] Epoch {epoch + 1}/{epochs} - loss: {avg_loss:.4f}")

    output_dir = Path("backend/medical_ML/models")
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{dataset_name}_model.pth"
    torch.save(model.state_dict(), output_path)
    return output_path


def main() -> None:
    for dataset_name in DATASETS:
        print(f"\nTraining model for {dataset_name}...")
        saved_path = train_single_dataset(dataset_name=dataset_name)
        print(f"Saved: {saved_path.resolve()}")

    print("\nAll dataset models trained successfully.")


if __name__ == "__main__":
    main()
