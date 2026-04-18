"""
Medical Report Analyzer
========================
Extracts information from medical test reports using OCR and API-based analysis.
Converts report findings into symptoms for the diagnosis system.
"""

import os
import re
import logging
from typing import Any, Optional

LOGGER = logging.getLogger("medcore.report_analyzer")

# ── Configuration ────────────────────────────────────────────────────────────
OPEN_API_BASE_URL = os.getenv("OPEN_API_BASE_URL", "https://api.openai.com/v1")
OPEN_API_KEY = os.getenv("OPEN_API_KEY", "")
OPEN_API_MODEL = os.getenv("OPEN_API_MODEL", "gpt-3.5-turbo")

# ── Report Analysis System Prompt ────────────────────────────────────────────
REPORT_ANALYSIS_PROMPT = """You are a medical report analysis expert. Your task is to extract symptoms and medical findings from lab reports and convert them into a standardized symptom list.

**Instructions:**
1. Analyze the provided medical report text
2. Extract ALL abnormal findings, test results outside normal range, and clinical observations
3. Convert each finding into a symptom name that matches standard medical terminology
4. Return ONLY a JSON object with the following structure:

{{
    "extracted_findings": [
        {{"finding": "original text from report", "symptom": "standardized symptom name", "severity": "normal/abnormal/critical"}}
    ],
    "symptoms_list": ["symptom1", "symptom2", ...],
    "summary": "Brief summary of the report findings"
}}

**Important:**
- Focus on abnormal results (marked as High, Low, Positive, Abnormal, etc.)
- Convert lab values to symptoms (e.g., "High Bilirubin" → "jaundice", "Elevated ALT" → "liver dysfunction")
- Include symptoms that can be used for disease prediction
- If the report is normal, return an empty symptoms list
- Do NOT include patient names, dates, or hospital information

**Example conversions:**
- "Bilirubin Total: 3.2 mg/dL (High)" → symptom: "jaundice"
- "Hemoglobin: 8.5 g/dL (Low)" → symptom: "anemia"
- "WBC: 15000/μL (High)" → symptom: "infection"
- "SGPT/ALT: 85 U/L (High)" → symptom: "liver dysfunction"
- "Creatinine: 2.1 mg/dL (High)" → symptom: "kidney dysfunction"
- "TSH: 0.1 mIU/L (Low)" → symptom: "thyroid dysfunction"
"""


def extract_text_from_image(image_base64: str) -> str:
    """
    Extract text from an image using OCR.
    Falls back to API-based vision if pytesseract is not available.
    """
    try:
        import pytesseract
        from PIL import Image
        import base64
        import io
        
        # Decode base64 image
        image_bytes = base64.b64decode(image_base64)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Extract text using pytesseract
        text = pytesseract.image_to_string(image)
        return text.strip() if text else ""
        
    except ImportError:
        LOGGER.warning("pytesseract not available, using API-based OCR")
        return ""
    except Exception as e:
        LOGGER.error(f"OCR extraction failed: {e}")
        return ""


async def analyze_report_with_api(report_text: str) -> dict[str, Any]:
    """
    Use the OpenAI API to analyze a medical report and extract symptoms.
    """
    if not OPEN_API_KEY:
        return {
            "error": "API key not configured",
            "symptoms": [],
            "findings": []
        }
    
    if not report_text or len(report_text.strip()) < 10:
        return {
            "error": "Report text too short",
            "symptoms": [],
            "findings": []
        }
    
    try:
        import httpx
        
        headers = {
            "Authorization": f"Bearer {OPEN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Truncate if too long (API limit)
        if len(report_text) > 4000:
            report_text = report_text[:4000] + "... [truncated]"
        
        payload = {
            "model": OPEN_API_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": REPORT_ANALYSIS_PROMPT
                },
                {
                    "role": "user",
                    "content": f"Analyze this medical report and extract symptoms:\n\n{report_text}"
                }
            ],
            "max_tokens": 1000,
            "temperature": 0.3
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OPEN_API_BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60.0
            )
            
            if response.status_code != 200:
                LOGGER.error(f"API error: {response.status_code} - {response.text}")
                return {
                    "error": f"API error: {response.status_code}",
                    "symptoms": [],
                    "findings": []
                }
            
            data = response.json()
            if "choices" not in data or len(data["choices"]) == 0:
                return {
                    "error": "No response from API",
                    "symptoms": [],
                    "findings": []
                }
            
            result_text = data["choices"][0]["message"]["content"].strip()
            
            # Parse JSON response
            try:
                import json
                # Try to extract JSON from the response
                json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group())
                else:
                    result = json.loads(result_text)
                
                return {
                    "symptoms": result.get("symptoms_list", []),
                    "findings": result.get("extracted_findings", []),
                    "summary": result.get("summary", ""),
                    "raw_response": result_text
                }
            except (json.JSONDecodeError, AttributeError) as e:
                LOGGER.warning(f"Failed to parse API response as JSON: {e}")
                # Return raw response as fallback
                return {
                    "symptoms": [],
                    "findings": [],
                    "summary": result_text,
                    "raw_response": result_text,
                    "parse_error": str(e)
                }
                
    except Exception as e:
        LOGGER.error(f"Report analysis failed: {e}")
        return {
            "error": str(e),
            "symptoms": [],
            "findings": []
        }


async def process_report(
    file_content: bytes,
    filename: str,
    mime_type: str,
) -> dict[str, Any]:
    """
    Process a medical report file and extract symptoms.
    
    Handles:
    - PDF files (text extraction)
    - Text files
    - Image files (OCR)
    """
    # Step 1: Extract text from the report
    report_text = ""
    
    suffix = os.path.splitext(filename)[1].lower()
    
    if suffix == ".pdf":
        # Use existing PDF parser
        from report_parser import extract_text_from_pdf
        report_text = extract_text_from_pdf(file_content)
        
    elif suffix in (".txt", ".text", ".csv"):
        # Plain text file
        report_text = file_content.decode("utf-8", errors="replace")
        
    elif suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
        # Image file - use OCR
        import base64
        image_base64 = base64.b64encode(file_content).decode("ascii")
        report_text = extract_text_from_image(image_base64)
        
    else:
        # Try as text
        try:
            report_text = file_content.decode("utf-8", errors="replace")
        except:
            return {
                "error": f"Unsupported file type: {suffix}",
                "symptoms": [],
                "findings": []
            }
    
    if not report_text or len(report_text.strip()) < 10:
        return {
            "error": "Could not extract text from report",
            "symptoms": [],
            "findings": []
        }
    
    # Step 2: Analyze with API to extract symptoms
    result = await analyze_report_with_api(report_text)
    result["extracted_text"] = report_text[:500]  # Include truncated text for debugging
    
    return result


def format_report_results(analysis_result: dict[str, Any]) -> str:
    """Format report analysis results for display to user."""
    symptoms = analysis_result.get("symptoms", [])
    findings = analysis_result.get("findings", [])
    summary = analysis_result.get("summary", "")
    
    lines = []
    
    if summary:
        lines.append(f"**Report Summary:** {summary}")
    
    if findings:
        lines.append("\n**Key Findings:**")
        for f in findings[:5]:
            severity_emoji = {"normal": "✓", "abnormal": "⚠️", "critical": "🚨"}.get(f.get("severity", ""), "•")
            lines.append(f"  {severity_emoji} {f.get('symptom', f.get('finding', ''))}")
    
    if symptoms:
        lines.append(f"\n**Extracted Symptoms ({len(symptoms)}):**")
        lines.append(f"  {', '.join(symptoms[:10])}")
    
    return "\n".join(lines)