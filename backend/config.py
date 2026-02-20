import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

NEXTAUTH_SECRET = os.getenv("NEXTAUTH_SECRET", "")
SHARED_SECRET = os.getenv("SHARED_SECRET", "")  # Same as in frontend for server-to-server auth
CHROMA_PERSIST_DIR = Path(os.getenv("CHROMA_PERSIST_DIR", "./chroma_data")).resolve()
BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))

# Ensure ChromaDB persist dir exists
CHROMA_PERSIST_DIR.mkdir(parents=True, exist_ok=True)
