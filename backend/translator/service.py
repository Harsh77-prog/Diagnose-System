from __future__ import annotations

import re
from functools import lru_cache

from deep_translator import GoogleTranslator


@lru_cache(maxsize=2048)
def _translate_chunk(text: str, target_lang: str) -> str:
    return GoogleTranslator(source="auto", target=target_lang).translate(text)


def translate_text(text: str, target_lang: str = "hi") -> str:
    """
    Translate arbitrary text using GoogleTranslator.
    Splits long input by lines to avoid provider length limits.
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return ""
    target_lang = (target_lang or "hi").strip().lower()

    # Fast path: if output language is Hindi and the input is predominantly Devanagari, skip translation.
    if target_lang == "hi":
        devanagari_chars = len(re.findall(r"[\u0900-\u097F]", cleaned))
        if devanagari_chars >= max(8, int(len(cleaned) * 0.25)):
            return cleaned

    # Keep paragraph boundaries and translate safely in chunks.
    parts = cleaned.split("\n")
    translated_parts: list[str] = []
    for part in parts:
        segment = part.strip()
        if not segment:
            translated_parts.append("")
            continue

        if len(segment) <= 4000:
            translated_parts.append(_translate_chunk(segment, target_lang))
            continue

        # Extra split for very long lines
        start = 0
        temp_chunks: list[str] = []
        while start < len(segment):
            chunk = segment[start : start + 3500]
            temp_chunks.append(_translate_chunk(chunk, target_lang))
            start += 3500
        translated_parts.append("".join(temp_chunks))

    return "\n".join(translated_parts)
