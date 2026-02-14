import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/options";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const SHARED_SECRET = process.env.SHARED_SECRET || "";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/diagnose/history`, {
      headers: {
        "X-User-Id": session.user.id,
        "X-Internal-Secret": SHARED_SECRET,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Diagnosis service unavailable. Start the Python backend (see SETUP.md).", code: "BACKEND_UNREACHABLE" },
      { status: 503 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to load history" },
      { status: res.status },
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
