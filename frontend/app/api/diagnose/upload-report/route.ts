import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";

export const maxDuration = 300;

function resolveBackendUrl(): string {
  return (process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
}

function getSharedSecret(): string {
  return (process.env.SHARED_SECRET || "").trim();
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized. Please log in." }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const backendUrl = resolveBackendUrl();
    if (!backendUrl) {
      return NextResponse.json({ error: "Backend URL not configured." }, { status: 500 });
    }

    const proxyForm = new FormData();
    proxyForm.append("file", file, file.name || "medical-report.pdf");

    const backendResponse = await fetch(`${backendUrl}/api/diagnose/upload-report`, {
      method: "POST",
      headers: {
        "X-Internal-Secret": getSharedSecret(),
        "X-User-Id": session.user.email || "anonymous",
        ...(request.headers.get("x-session-id") ? { "x-session-id": request.headers.get("x-session-id")! } : {}),
      },
      body: proxyForm,
    });

    const raw = await backendResponse.text();
    let data: unknown = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { error: raw || `Backend error: ${backendResponse.status}` };
    }

    if (!backendResponse.ok) {
      const errorPayload = data as { detail?: string; error?: string };
      return NextResponse.json(
        { error: errorPayload.detail || errorPayload.error || `Backend error: ${backendResponse.status}` },
        { status: backendResponse.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
