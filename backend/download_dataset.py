from pathlib import Path

import medmnist
from medmnist import INFO


DATASETS = [
    "chestmnist",
    "dermamnist",
    "retinamnist",
    "pathmnist",
    "bloodmnist",
]
SPLITS = ("train", "val", "test")
PROJECT_ROOT = Path(__file__).resolve().parent
DATASET_ROOT = PROJECT_ROOT / "medical_ML" / "data"


def download_dataset(dataset_name: str, root: Path) -> None:
    info = INFO[dataset_name]
    dataset_class = getattr(medmnist, info["python_class"])

    for split in SPLITS:
        dataset_class(split=split, download=True, root=str(root))


def main() -> None:
    dataset_root = DATASET_ROOT.resolve()
    dataset_root.mkdir(parents=True, exist_ok=True)
    print(f"Project root: {PROJECT_ROOT}")
    print(f"Dataset root: {dataset_root}")

    for name in DATASETS:
        print(f"Downloading {name}...")
        download_dataset(name, dataset_root)
        print(f"Finished {name}")

    print(f"All datasets downloaded in: {dataset_root}")


if __name__ == "__main__":
    main()
