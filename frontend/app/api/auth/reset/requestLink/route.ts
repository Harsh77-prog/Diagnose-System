// /api/register/route.ts
import bcrypt from "bcrypt";
import { prismaUser as prisma } from "@/lib/prisma/client";

import { NextResponse } from "next/server";
import { sendMail } from "../../utils/mailer";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    // basic validation
    if (!email) {
      return NextResponse.json(
        { error: "Email are required" },
        { status: 400 },
      );
    }

    // check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // hash password
    const Token = {
      email,
      expires: (Date.now() + 1000 * 60 * 60 * 48).toString(),
      type: "ResetPassword",
    };

    const hashedToken = await bcrypt.hash(JSON.stringify(Token), 12);

    await prisma.$transaction(async (tx) => {
      //invalidate previous reset password tokens before creating new
      await tx.verificationToken.updateMany({
        data: { status: "Depreciated" },
        where: {
          type: "ResetPassword",
          identifier: email,
          status: "Active",
        },
      });

      //new password reset token
      await tx.verificationToken.create({
        data: {
          identifier: email,
          token: hashedToken,
          expires: Token.expires,
          type: "ResetPassword",
          status: "Active",
        },
      });
    });

    await sendMail(
      email,
      `${process.env.NEXTAUTH_URL}/reset?token=${hashedToken}`,
      "ResetLink",
    );

    return NextResponse.json(
      { success: "Password reset link sent sucessfully" },
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
