import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prismaUser as prisma } from "@/lib/prisma/client";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
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
      select: { id: true, userId: true },
    });

    if (!chatSession || chatSession.userId !== userId) {
      return NextResponse.json(
        { error: "Session not found or access denied" },
        { status: 404 }
      );
    }

    await prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Error deleting session:", err);
    return NextResponse.json(
      { error: "Internal Server Error", details: err.message },
      { status: 500 }
    );
  }
}
