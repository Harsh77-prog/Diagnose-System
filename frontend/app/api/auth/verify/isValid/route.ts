// /api/register/route.ts
import { prismaUser as prisma } from "@/lib/prisma/client";

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    // basic validation
    if (!token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    const validToken = await prisma.verificationToken.findUnique({
      where: {
        token,
        type: "UserVerification",
        status: "Active",
      },
    });

    if (!validToken) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }
    if (Number(validToken.expires) < Date.now()) {
      await prisma.verificationToken.update({
        data: {
          status: "Expired",
        },
        where: { token, type: "UserVerification" },
      });

      return NextResponse.json({ error: "Token Expired" }, { status: 400 });
    }

    return NextResponse.json({ validity: true }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
