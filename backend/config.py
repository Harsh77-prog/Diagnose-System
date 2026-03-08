import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

NEXTAUTH_SECRET = os.getenv("NEXTAUTH_SECRET", "")
SHARED_SECRET = os.getenv("SHARED_SECRET", "")  # Same as in frontend for server-to-server auth
CHROMA_PERSIST_DIR = Path(os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")).resolve()
BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))

# Performance & Timeout Configuration
REQUEST_TIMEOUT_SECONDS = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "300"))
ML_INFERENCE_TIMEOUT_SECONDS = int(os.getenv("ML_INFERENCE_TIMEOUT_SECONDS", "60"))
# ✅ INCREASED: Image models can take 30-60s to load on first run, plus inference
# Total time budget: 3-5 minutes for comprehensive multimodal analysis
IMAGE_INFERENCE_TIMEOUT_SECONDS = int(os.getenv("IMAGE_INFERENCE_TIMEOUT_SECONDS", "180"))  # Was 120, now 180s

# ML Engine Optimization Settings
PREDICTION_CACHE_SIZE = int(os.getenv("PREDICTION_CACHE_SIZE", "500"))
ENTROPY_CACHE_SIZE = int(os.getenv("ENTROPY_CACHE_SIZE", "500"))
EMBEDDING_CACHE_SIZE = int(os.getenv("EMBEDDING_CACHE_SIZE", "1000"))

# image upload rules
MAX_IMAGE_UPLOAD_SIZE = int(os.getenv("MAX_IMAGE_UPLOAD_SIZE", str(5 * 1024 * 1024)))  # bytes
MAX_IMAGE_DIMENSION = int(os.getenv("MAX_IMAGE_DIMENSION", "1024"))  # px
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "10"))

# Session Management
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "3600"))
MAX_SESSIONS = int(os.getenv("MAX_SESSIONS", "1000"))

# Image Processing
IMAGE_CACHE_TTL_SEC = int(os.getenv("IMAGE_CACHE_TTL_SEC", "1200"))  # 20 min
IMAGE_CACHE_MAX_ITEMS = int(os.getenv("IMAGE_CACHE_MAX_ITEMS", "256"))

# Ensure ChromaDB persist dir exists
CHROMA_PERSIST_DIR.mkdir(parents=True, exist_ok=True)
