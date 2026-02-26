import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prismaUser as prisma } from "@/lib/prisma/client";

// Get all messages for a specific session
export async function GET(
    req: NextRequest,
    props: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const session: any = await getServerSession(authOptions as any);
        if (!session || !session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        const params = await props.params;
        const sessionId = params.id;

        // Verify the session belongs to the user
        const chatSession = await prisma.chatSession.findUnique({
            where: { id: sessionId },
        });

        if (!chatSession || chatSession.userId !== userId) {
            return NextResponse.json({ error: "Session not found or access denied" }, { status: 404 });
        }

        const messages = await prisma.message.findMany({
            where: { chatSessionId: sessionId },
            orderBy: { createdAt: "asc" },
        });

        return NextResponse.json({ messages });
    } catch (err: any) {
        console.error("Error fetching messages:", err);
        return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
    }
}

// Add a new message to the session
export async function POST(
    req: NextRequest,
    props: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const session: any = await getServerSession(authOptions as any);
        if (!session || !session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;
        const params = await props.params;
        const sessionId = params.id;

        const chatSession = await prisma.chatSession.findUnique({
            where: { id: sessionId },
        });

        if (!chatSession || chatSession.userId !== userId) {
            return NextResponse.json({ error: "Session not found or access denied" }, { status: 404 });
        }

        const body = await req.json();
        const { role, content, jsonPayload } = body;

        if (!role || !content) {
            return NextResponse.json({ error: "Role and content are required" }, { status: 400 });
        }

        const message = await prisma.message.create({
            data: {
                chatSessionId: sessionId,
                role,
                content,
                jsonPayload: jsonPayload ? JSON.stringify(jsonPayload) : null,
            },
        });

        // Update the session's updatedAt timestamp
        await prisma.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
        });

        return NextResponse.json({ message }, { status: 201 });
    } catch (err: any) {
        console.error("Error creating message:", err);
        return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
    }
}
