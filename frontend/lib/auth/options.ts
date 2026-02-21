import NextAuth, { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcrypt";
import { prismaUser as prisma } from "@/lib/prisma/client";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { Adapter } from "next-auth/adapters";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma as any) as Adapter,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.password,
        );

        if (!isValid) {
          return null;
        }

        // 👇 only return safe fields
        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],

  session: {
    strategy: "jwt", // 👈 REQUIRED
  },

  callbacks: {
    //   async signIn({ user, account }) {
    //   if (account?.provider === "google") {
    //     const existingUser = await prisma.user.findUnique({
    //       where: { email: user.email! },
    //       include: { accounts: true },
    //     })

    //     if (!existingUser) return false

    //     const alreadyLinked = existingUser.accounts.some(
    //       (acc) => acc.provider === "google"
    //     )

    //     if (!alreadyLinked) {
    //       await prisma.account.create({
    //         data: {
    //           userId: existingUser.id,
    //           type: "oauth",
    //           provider: "google",
    //           providerAccountId: account.providerAccountId!,
    //           access_token: account.access_token,
    //           refresh_token: account.refresh_token,
    //           expires_at: account.expires_at,
    //           token_type: account.token_type,
    //           scope: account.scope,
    //           id_token: account.id_token,
    //         },
    //       })
    //     }
    //   }

    //   return true
    // },
    async jwt({ token, user }) {
      // Runs on sign-in
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    signOut: "/signout",
  },

  secret: process.env.NEXTAUTH_SECRET,
};
