import { NextRequest, NextResponse } from "next/server";

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

    const backendUrl = (process.env.DIAGNOSE_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
    const res = await fetch(`${backendUrl}/api/diagnose/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target_lang: targetLang }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: payload?.detail || payload?.error || "Translation failed" },
        { status: res.status }
      );
    }

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

