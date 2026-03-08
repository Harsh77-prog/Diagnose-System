import time
import os
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_path))

from image_predictor import ImagePredictor
from PIL import Image
import torch

def verify_speed():
    model_dir = backend_path / "medical_ML" / "models"
    if not model_dir.exists():
        print(f"Error: Model directory not found at {model_dir}")
        return

    predictor = ImagePredictor(model_dir=str(model_dir))
    
    # Create dummy image
    img = Image.new('RGB', (1024, 1024), color=(128, 128, 128))
    import io
    import base64
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    print("--- Starting Warmup ---")
    start = time.perf_counter()
    warmed = predictor.warmup()
    print(f"Warmup took {(time.perf_counter() - start):.2f}s for {len(warmed)} models")

    print("\n--- Starting Parallel Inference (All Datasets) ---")
    start = time.perf_counter()
    try:
        result = predictor.predict_all(img_str)
        duration = time.perf_counter() - start
        print(f"Total predict_all took {duration:.2f}s")
        print(f"Best result: {result['best_dataset']} - {result['best_label_name']} ({result['best_confidence']}%)")
        
        for ds in result['per_dataset']:
            print(f"  - {ds['dataset']}: {ds['top_label_name']} ({ds['top_confidence']}%)")
            
    except Exception as e:
        print(f"Inference failed: {e}")

if __name__ == "__main__":
    verify_speed()
