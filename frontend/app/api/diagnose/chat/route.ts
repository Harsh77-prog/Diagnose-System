import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/options";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const SHARED_SECRET = process.env.SHARED_SECRET || "";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { message, report_text, image_b64 } = body;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/diagnose/chat/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": session.user.id,
        "X-Internal-Secret": SHARED_SECRET,
      },
      body: JSON.stringify({
        message: message.trim(),
        report_text: report_text?.trim() || "",
        image_b64: image_b64 || null,
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Diagnosis service unavailable. Start the Python backend (see SETUP.md).", code: "BACKEND_UNREACHABLE" },
      { status: 503 },
    );
  }

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: err || "Diagnosis service error" },
      { status: res.status },
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
