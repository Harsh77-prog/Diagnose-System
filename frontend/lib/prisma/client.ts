import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prismaUser?: PrismaClient;
};

export const prismaUser =
  globalForPrisma.prismaUser ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaUser = prismaUser;
}
