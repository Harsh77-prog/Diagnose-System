# MedCoreAI Frontend Setup

## Prerequisites

- Node.js 18+
- PostgreSQL database (e.g. Neon, Supabase, or local)
- npm or yarn

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
NEXTAUTH_SECRET="your-random-secret"
NEXTAUTH_URL="http://localhost:3000"

# Optional: Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Diagnosis backend (Python) – required for /diagnose
BACKEND_URL="http://127.0.0.1:8000"
SHARED_SECRET="same-secret-as-backend-.env"
```

## Install & Run

1. **Close any running dev servers** (to avoid file locks).

2. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

3. **Generate Prisma client & push schema:**
   ```bash
   npm run db:generate
   npm run db:push
   ```

4. **Start dev server:**
   ```bash
   npm run dev
   ```
   - Use `npm run dev:full` if you want to run `prisma generate` before starting (e.g. after pulling changes).
   - If you see **`ensureBinariesExist is not a function`** when running `prisma generate`, try: remove `node_modules` and `package-lock.json`, then run `npm install` again. If it persists, pin Prisma: `npm install prisma@5.21.0 @prisma/client@5.21.0 --save-dev`, then `npm run db:generate`.

Visit http://localhost:3000

## Routes

| Route | Description |
|-------|-------------|
| `/` | Home |
| `/Philosophy` | Philosophy page |
| `/about` | About page |
| `/login` | Sign in |
| `/signup` | Create account |
| `/signout` | Sign out |
| `/diagnose` | Diagnosis chat (sign-in required; redirects to login if not authenticated) |

## Auth

- **Credentials**: Email + password (stored in PostgreSQL via Prisma)
- **Google**: Optional OAuth (set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`)
- Users are stored in PostgreSQL; passwords are hashed with bcrypt.
- After sign-in or sign-up, users are redirected to **/diagnose** (the main diagnosis app).

## Diagnosis backend (Python)

The **Diagnose** page calls a separate Python backend (see `../backend/README.md`). To use it:

1. In `backend/`, create a venv, install deps (`pip install -r requirements.txt`), set `.env` (OPENAI_API_KEY, SHARED_SECRET, etc.), then run: `uvicorn main:app --reload --port 8000`.
2. In frontend `.env`, set `BACKEND_URL=http://127.0.0.1:8000` and `SHARED_SECRET` to the same value as in the backend.
3. Sign in and open **/diagnose** to chat, attach images, or upload reports.
