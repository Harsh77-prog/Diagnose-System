import { type AuthOptions } from "next-auth";
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

        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        // 👇 only return safe fields
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
        };
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? process.env.ClientId ?? "",
      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET ?? process.env.ClientSecret ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  session: {
    strategy: "jwt", // 👈 REQUIRED
  },

  callbacks: {
    async jwt({ token, user, trigger, session }: any) {
      // ✅ OPTIMIZATION: Only query DB on initial login (when user object exists)
      // Subsequent calls reuse cached token data, avoiding N+1 database queries
      if (user) {
        // Initial login or OAuth signup - fetch user data once
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email },
          select: {
            name: true,
            id: true,
            email: true,
            emailVerified: true,
          },
        });
        if (dbUser) {
          token.name = dbUser.name;
          token.id = dbUser.id;
          token.email = dbUser.email;
          token.emailVerified = dbUser.emailVerified;
          token.iat = Math.floor(Date.now() / 1000); // Token issued at time
        }
      }
      
      // ✅ Manual session update - refresh DB data only when explicitly updated
      if (trigger === "update" && session) {
        if (session.name) token.name = session.name;
        if (session.image) token.picture = session.image;
        if (session.emailVerified !== undefined) token.emailVerified = session.emailVerified;
      }

      return token;
    },
    async session({ session, token }: any) {
      // ✅ Session callback runs on every page load but doesn't query DB
      // All data comes from cached JWT token (milliseconds, not database round-trip)
      session.user.id = token.id;
      session.user.emailVerified = token.emailVerified;
      session.user.name = token.name;
      return session;
    },
  },

  pages: {
    signIn: "/login",
    signOut: "/signout",
  },

  secret: process.env.NEXTAUTH_SECRET,
};

