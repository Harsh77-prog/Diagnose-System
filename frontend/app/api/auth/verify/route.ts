// /api/register/route.ts
import { prismaUser as prisma } from "@/lib/prisma/client";
import { Prisma } from "@prisma/client/scripts/default-index.js";

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    // basic validation
    if (!token) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const validToken = await prisma.verificationToken.findUnique({
      where: {
        token,
        type: "UserVerification",
        status: "Active",
      },
    });

    if (!validToken) {
      return NextResponse.json({ error: "Invalid Token" }, { status: 404 });
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

    const emailVerified = new Date();

    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.verificationToken.update({
        data: {
          status: "Accepted",
        },
        where: { token, type: "UserVerification" },
      });
      return await prisma.user.update({
        data: { emailVerified: emailVerified.toISOString() },
        where: { email: validToken.identifier },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          emailVerified: true,
        },
      });
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
