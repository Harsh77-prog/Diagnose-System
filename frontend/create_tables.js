const { neon } = require('@neondatabase/serverless');
const sql = neon('postgresql://neondb_owner:npg_1rVuyCBc2NiZ@ep-lucky-wildflower-aiv62f8n-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require');

async function main() {
  try {
    try {
      await sql`CREATE TYPE "VerificationType" AS ENUM ('ResetPassword', 'UserVerification');`;
      console.log('Created VerificationType enum');
    } catch (e) { console.log('Enum VerificationType already exists or error:', e.message); }

    try {
      await sql`CREATE TYPE "Status" AS ENUM ('Active', 'Accepted', 'Depreciated', 'Expired');`;
      console.log('Created Status enum');
    } catch (e) { console.log('Enum Status already exists or error:', e.message); }

    await sql`
      CREATE TABLE IF NOT EXISTS "User" (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT UNIQUE,
        "emailVerified" TIMESTAMP(3),
        image TEXT,
        password TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL
      );
    `;
    console.log('User table ensured');

    await sql`
      CREATE TABLE IF NOT EXISTS "Account" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        "providerAccountId" TEXT NOT NULL,
        refresh_token TEXT,
        access_token TEXT,
        expires_at INTEGER,
        token_type TEXT,
        scope TEXT,
        id_token TEXT,
        session_state TEXT,
        UNIQUE(provider, "providerAccountId")
      );
    `;
    console.log('Account table ensured');

    await sql`
      CREATE TABLE IF NOT EXISTS "Session" (
        id TEXT PRIMARY KEY,
        "sessionToken" TEXT UNIQUE NOT NULL,
        "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
        expires TIMESTAMP(3) NOT NULL
      );
    `;
    console.log('Session table ensured');

    await sql`
      CREATE TABLE IF NOT EXISTS "VerificationToken" (
        identifier TEXT NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires TEXT NOT NULL,
        type "VerificationType" NOT NULL DEFAULT 'UserVerification',
        status "Status" DEFAULT 'Active',
        UNIQUE(identifier, token)
      );
    `;
    console.log('VerificationToken table ensured');

    // New Chat Tables
    await sql`
      CREATE TABLE IF NOT EXISTS "ChatSession" (
        id TEXT PRIMARY KEY,
        "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
        title TEXT NOT NULL DEFAULT 'New Chat',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('ChatSession table ensured');

    await sql`
      CREATE TABLE IF NOT EXISTS "Message" (
        id TEXT PRIMARY KEY,
        "chatSessionId" TEXT NOT NULL REFERENCES "ChatSession"(id) ON DELETE CASCADE ON UPDATE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        "jsonPayload" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('Message table ensured');

    console.log('✅ Success! All tables are ready.');
  } catch (err) {
    console.error('❌ Error creating tables:', err);
  }
}

main();
