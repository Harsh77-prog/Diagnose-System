import time
import base64
import os
import sys
import io
from pathlib import Path

# Add backend to path
sys.path.append(str(Path(__file__).parent.parent))

from PIL import Image
from image_predictor import ImagePredictor

def test_performance():
    # Create a real dummy image with PIL
    img = Image.new('RGB', (28, 28), color = (73, 109, 137))
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    dummy_image = base64.b64encode(buffered.getvalue()).decode()

    model_dir = "medical_ML/models"
    if not Path(model_dir).exists():
        model_dir = "backend/medical_ML/models"
    
    print(f"Initializing Predictor with models from: {model_dir}")
    predictor = ImagePredictor(model_dir)

    print("\n--- Phase 1: Sequential Warmup (simulated) ---")
    start = time.perf_counter()
    warmed = predictor.warmup()
    print(f"Warmup took {time.perf_counter() - start:.2f}s for {len(warmed)} models")

    print("\n--- Phase 2: Parallel Prediction ---")
    start = time.perf_counter()
    # Requesting all datasets to test parllelism
    result = predictor.predict_all(dummy_image)
    duration = time.perf_counter() - start
    print(f"Parallel Inference took {duration:.2f}s")
    print(f"Best Match: {result['best_dataset']} -> {result['best_label_name']} ({result['best_confidence']:.1f}%)")

    # Second pass should be instant due to cache
    print("\n--- Phase 3: Cached Prediction ---")
    start = time.perf_counter()
    predictor.predict_all(dummy_image)
    print(f"Cached Inference took {time.perf_counter() - start:.4f}s")

if __name__ == "__main__":
    test_performance()
