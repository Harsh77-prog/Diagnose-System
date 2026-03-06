from __future__ import annotations

import re
from typing import Optional
import time

from deep_translator import GoogleTranslator


def _translate_chunk(text: str, target_lang: str) -> str:
    """Translate a chunk of text with fresh translator instance."""
    # Create a new translator instance for each chunk to avoid caching
    translator = GoogleTranslator(source="auto", target=target_lang)
    result = translator.translate(text)
    # Add small delay to avoid rate limiting and cache issues
    time.sleep(0.05)
    return result


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


def translate_diagnosis_message(text: str, target_lang: str = "hi") -> dict[str, str]:
    """
    Translate a diagnosis message while preserving question numbering structure.
    
    Translates each component (symptoms, question, reason) independently to ensure
    correct translations without cache interference between questions.
    
    Returns dict with keys: translated_text, question_number (if found), metadata
    """
    cleaned = (text or "").strip()
    if not cleaned:
        return {"translated_text": "", "question_number": None, "metadata": "empty"}
    
    target_lang = (target_lang or "hi").strip().lower()
    
    # Fast path: if already in target language, return as-is
    if target_lang == "hi":
        devanagari_chars = len(re.findall(r"[\u0900-\u097F]", cleaned))
        if devanagari_chars >= max(8, int(len(cleaned) * 0.25)):
            return {"translated_text": cleaned, "question_number": None, "metadata": "already_target_lang"}
    
    # Extract Question N: pattern - Case insensitive, with or without markdown
    question_pattern = r"\*?\*?[Qq]uestion\s+(\d+)\s*:\*?\*?"
    question_match = re.search(question_pattern, cleaned)
    
    if not question_match:
        # No question structure found - translate normally
        translated = translate_text(cleaned, target_lang)
        return {"translated_text": translated, "question_number": None, "metadata": "no_question_pattern"}
    
    question_number = question_match.group(1)
    start_idx = question_match.start()
    end_idx = question_match.end()
    
    # Split into: prefix (before "Question X:") and suffix (after)
    # Prefix typically contains "Symptoms identified so far:"
    prefix = cleaned[:start_idx].strip()
    # The matched question header part (e.g., "**Question 1:**")
    question_header = cleaned[start_idx:end_idx]
    # Everything after the header
    suffix = cleaned[end_idx:].strip()
    
    # Parse the suffix to separate question text from reason
    # Pattern: question text followed by Reason: reason text
    reason_pattern = r"^(.*?)(?:\nReason:\s*(.*))?$"
    suffix_match = re.search(reason_pattern, suffix, re.DOTALL)
    
    question_text = ""
    reason_text = ""
    if suffix_match:
        question_text = suffix_match.group(1).strip() if suffix_match.group(1) else ""
        reason_text = suffix_match.group(2).strip() if suffix_match.group(2) else ""
    else:
        question_text = suffix
    
    # Translate each component INDEPENDENTLY and COMPLETELY
    # This ensures no cache interference between different questions
    translated_prefix = translate_text(prefix, target_lang) if prefix else ""
    translated_question = translate_text(question_text, target_lang) if question_text else ""
    translated_reason = translate_text(reason_text, target_lang) if reason_text else ""
    
    # Create target language question header
    # Translate "Question" to get the right word in target language
    question_word = translate_text("Question", target_lang).strip()
    
    # Preserve the markdown style from original (check if it has **)
    if "**" in question_header:
        reconstructed_header = f"**{question_word} {question_number}:**"
    else:
        reconstructed_header = f"{question_word} {question_number}:"
    
    # Rebuild the complete message with all three parts
    result_parts = []
    
    if translated_prefix:
        result_parts.append(translated_prefix)
    
    if translated_question:
        result_parts.append(reconstructed_header + " " + translated_question)
    else:
        result_parts.append(reconstructed_header)
    
    if translated_reason:
        # Add reason as separate line, translating "Reason:" prefix
        reason_prefix = translate_text("Reason:", target_lang).strip()
        result_parts.append(f"{reason_prefix} {translated_reason}")
    
    reconstructed = "\n".join(result_parts)
    
    return {
        "translated_text": reconstructed.strip(),
        "question_number": question_number,
        "metadata": "structured_translation"
    }
