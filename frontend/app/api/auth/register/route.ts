// /api/register/route.ts
import bcrypt from "bcrypt";
import { prismaUser as prisma } from "@/lib/prisma/client";

import { NextResponse } from "next/server";
import { sendMail } from "../utils/mailer";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    // basic validation
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 },
      );
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    const hashedVerificationToken = await bcrypt.hash(
      JSON.stringify({ name, email, date: Date.now() }),
      12,
    );

    // create user
    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          emailVerified: true,
        },
      });

      await tx.verificationToken.create({
        data: {
          identifier: email,
          token: hashedVerificationToken,
          expires: (Date.now() + 1000 * 60 * 60 * 48).toString(),
          type: "UserVerification",
          status: "Active",
        },
      });

      return user;
    });

    await sendMail(
      email,
      `${process.env.NEXTAUTH_URL}/verify?token=${hashedVerificationToken}`,
      "verificationLink",
    );

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
