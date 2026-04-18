import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";

export const maxDuration = 60;

function resolveBackendUrl(): string {
  return (process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
}

function getSharedSecret(): string {
  return process.env.SHARED_SECRET || "";
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { message, session_action, image_base64, image_filename, image_mime } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Get backend URL
    const backendUrl = resolveBackendUrl();
    if (!backendUrl) {
      return NextResponse.json(
        { error: "Backend URL not configured. Please set BACKEND_URL environment variable." },
        { status: 500 }
      );
    }

    // Get shared secret and user ID for backend authentication
    const sharedSecret = getSharedSecret();
    const userId = session.user.email || "anonymous";

    // Forward request to backend with authentication headers
    const backendResponse = await fetch(`${backendUrl}/api/conversation/chat/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass authentication headers to backend
        "X-Internal-Secret": sharedSecret,
        "X-User-Id": userId,
        // Pass session ID if provided
        ...(request.headers.get("x-session-id") && {
          "x-session-id": request.headers.get("x-session-id")!,
        }),
      },
      body: JSON.stringify({
        message,
        session_action: session_action || null,
        image_base64: image_base64 || null,
        image_filename: image_filename || null,
        image_mime: image_mime || null,
      }),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      let errorMessage = `Backend error: ${backendResponse.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorJson.error || errorMessage;
      } catch {
        // Use raw text if not JSON
        if (errorText) {
          errorMessage = `${errorMessage}: ${errorText.slice(0, 200)}`;
        }
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}