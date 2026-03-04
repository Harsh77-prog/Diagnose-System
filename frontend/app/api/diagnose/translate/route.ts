import { NextRequest, NextResponse } from "next/server";

function fallbackTranslation(text: string, targetLang: string, error: string, status = 200) {
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
      const message =
        err instanceof Error ? `Translation backend unavailable: ${err.message}` : "Translation backend unavailable";
      return fallbackTranslation(text, targetLang, message);
    }
    clearTimeout(timer);

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const backendError = payload?.detail || payload?.error || "Translation failed";
      return fallbackTranslation(text, targetLang, `Translation backend error: ${backendError}`);
    }

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return fallbackTranslation("", "hi", message, 500);
  }
}
