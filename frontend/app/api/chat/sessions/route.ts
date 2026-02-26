import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prismaUser as prisma } from "@/lib/prisma/client";

export async function GET(req: NextRequest) {
    try {
        const session: any = await getServerSession(authOptions as any);
        if (!session || !session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = (session.user as any).id;

        // Fetch all user chat sessions
        const sessions = await prisma.chatSession.findMany({
            where: { userId },
            orderBy: { updatedAt: "desc" },
        });

        return NextResponse.json({ sessions });
    } catch (err: any) {
        console.error("Error fetching sessions:", err);
        return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session: any = await getServerSession(authOptions as any);
        if (!session || !session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = (session.user as any).id;
        const body = await req.json().catch(() => ({}));
        const title = body.title || "New Chat";

        // Create a new session
        const newSession = await prisma.chatSession.create({
            data: {
                userId,
                title,
            },
        });

        return NextResponse.json({ session: newSession }, { status: 201 });
    } catch (err: any) {
        console.error("Error creating session:", err);
        return NextResponse.json({ error: "Internal Server Error", details: err.message }, { status: 500 });
    }
}
