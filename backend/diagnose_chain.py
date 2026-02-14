"""
LangChain-based diagnosis assistant with OpenAI.
Uses conversation history from ChromaDB and supports text, report context, and images (vision).
"""
from __future__ import annotations

from typing import Any, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage as HM

from chroma_store import add_turn, get_recent_history
from config import OPENAI_API_KEY
from risk_model import predict_risk

SYSTEM_PROMPT = """You are a careful, empathetic medical assistant (not a replacement for a doctor). Your role is to:
1. Gather information: Ask clear follow-up questions about symptoms, duration, severity, and relevant history.
2. Explain in plain language: Help the user understand possible causes and what terms in their reports might mean.
3. Triage appropriately: If something sounds urgent or emergency-like, clearly recommend seeking emergency care or calling a doctor.
4. Never diagnose or prescribe: Do not give a definitive diagnosis or prescribe medication. Say things like "this could be consistent with..." or "a doctor might consider...".
5. Encourage professional care: When in doubt or when symptoms persist, recommend seeing a healthcare provider.

Guidelines:
- Be concise but thorough. Use short paragraphs and bullet points when listing possibilities or next steps.
- If the user shares lab results, imaging reports, or photos, acknowledge what you see and ask clarifying questions or explain what certain values/terms might mean in plain language, without diagnosing.
- Always include 1-3 short follow-up questions when appropriate to better understand their situation.
- If risk level is high or critical, start your response with a clear recommendation to seek immediate or urgent care."""


def _build_messages(
    user_id: str,
    user_message: str,
    report_context: str = "",
    image_b64: Optional[str] = None,
    max_history_turns: int = 14,
) -> list:
    """Build list of messages for the model: system + history + current user message (and optional image)."""
    history = get_recent_history(user_id, limit=max_history_turns)
    messages: list = [SystemMessage(content=SYSTEM_PROMPT)]

    for h in history:
        if h["role"] == "user":
            messages.append(HumanMessage(content=h["content"]))
        else:
            messages.append(AIMessage(content=h["content"]))

    # Current user content: optional report context + text + optional image
    current_content: list[Any] = []
    if report_context:
        current_content.append({"type": "text", "text": f"[Report or document context provided by user:\n{report_context}\n]"})
    current_content.append({"type": "text", "text": user_message})

    if image_b64:
        current_content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}", "detail": "high"},
        })

    if image_b64 or report_context:
        messages.append(HM(content=current_content))
    else:
        messages.append(HM(content=user_message))

    return messages


def get_llm():
    return ChatOpenAI(
        model="gpt-4o",
        api_key=OPENAI_API_KEY,
        temperature=0.4,
        max_tokens=1024,
    )


def run_diagnose(
    user_id: str,
    user_message: str,
    report_context: str = "",
    image_b64: Optional[str] = None,
) -> dict[str, Any]:
    """
    Run one diagnosis turn: get risk score, run LLM with history, persist turns, return response + metadata.
    """
    # Risk prediction from current text (and optional recent summary)
    recent = get_recent_history(user_id, limit=4)
    recent_summary = " ".join([m["content"][:200] for m in recent[-4:] if m["role"] == "user"])
    risk_result = predict_risk({"symptom_text": user_message, "recent_summary": recent_summary})

    messages = _build_messages(user_id, user_message, report_context=report_context, image_b64=image_b64)
    llm = get_llm()

    response = llm.invoke(messages)

    response_text = response.content if hasattr(response, "content") else str(response)

    # Persist user and assistant turns
    add_turn(user_id, "user", user_message)
    add_turn(user_id, "assistant", response_text, metadata={"risk_level": risk_result["risk_level"]})

    return {
        "reply": response_text,
        "risk_score": risk_result["risk_score"],
        "risk_level": risk_result["risk_level"],
        "suggested_action": risk_result["suggested_action"],
        "follow_up_suggested": True,
    }
