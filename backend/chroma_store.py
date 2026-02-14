"""
JSON file-based store for per-user diagnosis conversation history.
(Replaces ChromaDB to avoid Rust/tokenizers build issues on Windows.)
Used to load recent context for LangChain and to persist full history.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from config import CHROMA_PERSIST_DIR

# Use same env var; store as JSON files per user
HISTORY_DIR = CHROMA_PERSIST_DIR / "history"
HISTORY_DIR.mkdir(parents=True, exist_ok=True)


def _safe_user_path(user_id: str) -> Path:
    safe = re.sub(r"[^\w\-.]", "_", user_id)[:200]
    return HISTORY_DIR / f"{safe}.json"


def _load_user_history(user_id: str) -> list[dict[str, Any]]:
    path = _safe_user_path(user_id)
    if not path.exists():
        return []
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _save_user_history(user_id: str, history: list[dict[str, Any]]) -> None:
    path = _safe_user_path(user_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=0, ensure_ascii=False)


def add_turn(user_id: str, role: str, content: str, metadata: dict[str, Any] | None = None) -> None:
    """Append one message turn (user or assistant) for a user."""
    history = _load_user_history(user_id)
    entry: dict[str, Any] = {"role": role, "content": content, "ts": datetime.utcnow().isoformat()}
    if metadata:
        entry.update(metadata)
    history.append(entry)
    _save_user_history(user_id, history)


def get_recent_history(user_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """Fetch recent conversation turns for context. Returns list of {role, content} in order."""
    history = _load_user_history(user_id)
    # Already in order; take last N
    trimmed = history[-limit:] if len(history) > limit else history
    return [{"role": e.get("role", "user"), "content": e.get("content", "")} for e in trimmed]


def get_full_history(user_id: str, limit: int = 200) -> list[dict[str, Any]]:
    """Full history for display (e.g. on frontend)."""
    return get_recent_history(user_id, limit=limit)
