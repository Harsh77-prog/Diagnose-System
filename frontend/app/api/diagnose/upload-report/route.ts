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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const body = new FormData();
  body.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}/api/diagnose/upload-report`, {
      method: "POST",
      headers: {
        "X-User-Id": session.user.id,
        "X-Internal-Secret": SHARED_SECRET,
      },
      body,
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
      { error: err || "Upload failed" },
      { status: res.status },
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
