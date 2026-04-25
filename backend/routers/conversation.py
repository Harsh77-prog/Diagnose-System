import logging
import os
from typing import Any

from fastapi import APIRouter, Form, HTTPException, Request, status

from auth import require_user_id

router = APIRouter(prefix="/api/conversation", tags=["conversation"])

LOGGER = logging.getLogger("medcore.router.conversation")

# Open API configuration
OPEN_API_BASE_URL = os.getenv("OPEN_API_BASE_URL")
OPEN_API_KEY = os.getenv("OPEN_API_KEY", "")
OPEN_API_MODEL = os.getenv("OPEN_API_MODEL", "gpt-3.5-turbo")



def should_trigger_diagnosis(message: str) -> bool:
    """Only explicit commands should switch users into diagnosis mode."""
    return message.lower().strip().startswith(("diagnose:", "predict:", "triage:"))

HEALTHCARE_SYSTEM_PROMPT = """You are MedCoreAI, a knowledgeable and friendly healthcare AI assistant specialized in medical and health topics.

**IMPORTANT SCOPE - READ FIRST:**
- You are primarily a healthcare and medical assistant.
- You SHOULD answer:
  1. healthcare and medical questions
  2. greetings, small talk, identity questions, and questions about what you can do
  3. simple clarification questions connected to healthcare
- If a question is clearly unrelated to healthcare and not basic conversation about you, politely redirect the user back to healthcare support.
- For clearly unrelated topics like math homework, politics, coding, geography, or entertainment trivia, say that you are MedCoreAI and work best on healthcare-related help.

**For Healthcare Questions:**
1. Answer healthcare and medical questions accurately and comprehensively
2. Provide information about diseases, conditions, symptoms, treatments, medications, and general health topics
3. Always include a disclaimer that your information is for educational purposes and users should consult a healthcare professional for medical advice
4. Be empathetic and supportive when discussing health concerns
5. If a question is unclear or lacks context, ask clarifying questions
6. Keep responses concise but informative (around 100-200 words)
7. Use simple language that is easy to understand
8. If asked about emergency situations, advise the user to seek immediate medical attention
9. You can answer questions about ANY medical condition, disease, or health topic - including rare diseases, new conditions, and emerging health concerns

**For Greetings Or Identity Questions:**
1. Reply naturally and briefly
2. Introduce yourself as MedCoreAI
3. Explain that you can answer health questions and can start diagnosis when the user uses `diagnose:` or `predict:`

Remember: You are here to educate and inform about healthcare topics, not to replace professional medical advice."""

async def get_open_api_response(message: str, user_id: str, is_healthcare: bool = True) -> str:
    """Get response from Open API for healthcare conversation."""
    if not OPEN_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Open API key not configured. Please contact administrator."
        )
    
    try:
        import httpx
        
        headers = {
            "Authorization": f"Bearer {OPEN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        system_content = HEALTHCARE_SYSTEM_PROMPT if is_healthcare else "You are a helpful AI assistant."
        
        payload = {
            "model": OPEN_API_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": system_content
                },
                {
                    "role": "user",
                    "content": message
                }
            ],
            "max_tokens": 500,
            "temperature": 0.7
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{OPEN_API_BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
                timeout=30.0
            )
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Open API error: {response.status_code} - {response.text}"
                )
            
            data = response.json()
            if "choices" not in data or len(data["choices"]) == 0:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Invalid response from Open API"
                )
            
            return data["choices"][0]["message"]["content"].strip()
            
    except Exception as e:
        LOGGER.error(f"Open API error: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to get response from Open API: {str(e)}"
        )

@router.post("/chat")
async def normal_conversation(
    request: Request,
    message: str = Form(..., description="User message for normal conversation")
) -> dict[str, Any]:
    """Handle conversation - healthcare questions only. API dynamically determines if question is healthcare-related."""
    user_id = require_user_id(request)
    
    if not message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message is required")
    
    message_stripped = message.strip()
    
    # Check if this should trigger diagnosis flow (personal symptoms/conditions)
    if should_trigger_diagnosis(message):
        return {
            "reply": "For personal medical diagnosis, please use the diagnosis feature by starting your message with 'diagnose:' or 'predict:'. This will trigger our specialized medical AI for accurate diagnosis.",
            "is_diagnosis_suggestion": True,
            "suggested_action": "Use diagnosis feature"
        }
    
    # Send all other questions to the API - it will dynamically determine if it's healthcare-related
    # and either answer the question or respond that it can only answer healthcare questions
    response = await get_open_api_response(message_stripped, user_id, is_healthcare=True)
    
    return {
        "reply": response,
        "is_diagnosis_suggestion": False,
        "source": "open_api"
    }

@router.post("/chat/json")
async def normal_conversation_json(request: Request) -> dict[str, Any]:
    """JSON version of conversation endpoint - healthcare questions only. API dynamically determines if question is healthcare-related."""
    user_id = require_user_id(request)
    
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")
    
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message is required")
    
    # Check if this should trigger diagnosis flow (personal symptoms/conditions)
    if should_trigger_diagnosis(message):
        return {
            "reply": "For personal medical diagnosis, please use the diagnosis feature by starting your message with 'diagnose:' or 'predict:'. This will trigger our specialized medical AI for accurate diagnosis.",
            "is_diagnosis_suggestion": True,
            "suggested_action": "Use diagnosis feature"
        }
    
    # Send all other questions to the API - it will dynamically determine if it's healthcare-related
    # and either answer the question or respond that it can only answer healthcare questions
    response = await get_open_api_response(message, user_id, is_healthcare=True)
    
    return {
        "reply": response,
        "is_diagnosis_suggestion": False,
        "source": "open_api"
    }

@router.get("/status")
async def conversation_status() -> dict[str, Any]:
    """Get status of conversation service."""
    return {
        "status": "active",
        "open_api_configured": bool(OPEN_API_KEY),
        "model": OPEN_API_MODEL,
        "base_url": OPEN_API_BASE_URL,
        "features": {
            "normal_conversation": True,
            "diagnosis_detection": True,
            "open_api_integration": bool(OPEN_API_KEY)
        }
    }
