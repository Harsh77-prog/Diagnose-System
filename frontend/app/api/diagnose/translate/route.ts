import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

function fallbackTranslation(text: string, targetLang: string, error: string, status = 503) {
  return NextResponse.json(
    {
      source_text: text,
      target_lang: targetLang,
      translated_text: text,
      translation_unavailable: true,
      error,
    },
    { status }
  );
}

async function translateWithOpenAI(text: string, targetLang: string): Promise<string | null> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) return null;

  const model = (
    process.env.OPENAI_TRANSLATE_MODEL ||
    process.env.OPENAI_MODEL ||
    "gpt-4o-mini"
  )
    .trim()
    .replace(/^['"]|['"]$/g, "");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Translate the user text to the requested target language. Return only translated text. Preserve original formatting and markdown.",
          },
          {
            role: "user",
            content: JSON.stringify({
              target_language: targetLang,
              text,
            }),
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const translated = (data.choices?.[0]?.message?.content || "").trim();
    return translated || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      text?: string;
      target_lang?: string;
    };
    const text = (body.text || "").trim();
    const targetLang = (body.target_lang || "hi").trim();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const backendUrl = (process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
    if (!backendUrl) {
      const openAITranslated = await translateWithOpenAI(text, targetLang);
      if (openAITranslated) {
        return NextResponse.json({
          source_text: text,
          target_lang: targetLang,
          translated_text: openAITranslated,
          provider: "openai_fallback",
        });
      }
      return fallbackTranslation(text, targetLang, "BACKEND_URL is not configured", 500);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${backendUrl}/api/diagnose/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target_lang: targetLang }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const openAITranslated = await translateWithOpenAI(text, targetLang);
      if (openAITranslated) {
        return NextResponse.json({
          source_text: text,
          target_lang: targetLang,
          translated_text: openAITranslated,
          provider: "openai_fallback",
        });
      }
      const message = err instanceof Error ? `Translation backend unavailable: ${err.message}` : "Translation backend unavailable";
      return fallbackTranslation(text, targetLang, message, 503);
    }
    clearTimeout(timer);

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const backendError = payload?.detail || payload?.error || "Translation failed";
      const openAITranslated = await translateWithOpenAI(text, targetLang);
      if (openAITranslated) {
        return NextResponse.json({
          source_text: text,
          target_lang: targetLang,
          translated_text: openAITranslated,
          provider: "openai_fallback",
          backend_error: backendError,
        });
      }
      return fallbackTranslation(text, targetLang, `Translation backend error: ${backendError}`, res.status || 503);
    }

    // ✅ Extract translated_text to ensure consistent response format
    const translatedText = (payload?.translated_text || text).trim();
    return NextResponse.json({
      source_text: text,
      target_lang: targetLang,
      translated_text: translatedText,
      provider: "backend",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return fallbackTranslation("", "hi", message, 500);
  }
}
