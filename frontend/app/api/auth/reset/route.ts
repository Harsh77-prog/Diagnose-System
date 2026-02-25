// /api/register/route.ts
import bcrypt from "bcrypt";
import { prismaUser as prisma } from "@/lib/prisma/client";

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();

    // basic validation
    if (!token || !password) {
      return NextResponse.json(
        { error: "password is required" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    const validToken = await prisma.verificationToken.findUnique({
      where: {
        token,
        type: "ResetPassword",
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
        where: { token, type: "ResetPassword" },
      });

      return NextResponse.json({ error: "Token Expired" }, { status: 400 });
    }

    // check if user already exists

    const existingUser = await prisma.user.findUnique({
      where: { email: validToken.identifier },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // update password  user
    await prisma.$transaction(async (tx) => {
      await prisma.verificationToken.update({
        data: {
          status: "Accepted",
        },
        where: { token, type: "ResetPassword" },
      });

      await tx.user.update({
        where: {
          email: validToken.identifier,
        },
        data: {
          password: hashedPassword,
        },
      });
    });

    return NextResponse.json(
      { success: "Password reset sucessfully" },
      { status: 201 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
