# MedCoreAI Frontend

Next.js frontend for the MedCoreAI platform. This app owns the user-facing product experience and the secure application layer between the browser and the Python backend.

## Responsibilities

- landing page and product presentation
- authentication and account flows
- diagnosis chat UX
- image and report upload flow
- result visualization and export workflow
- session history and conversation recovery
- authenticated proxy routes to the backend

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- NextAuth
- Prisma
- Neon Postgres
- Motion-based UI interactions

## Structure

```text
frontend/
├─ app/
│  ├─ (Main)/         # main pages: home, about, chat, philosophy
│  ├─ (Basic Auth)/   # login/signup/reset flows
│  └─ api/            # server-side routes used by the app
├─ components/        # reusable UI and chat components
├─ lib/               # auth, prisma, helpers
├─ prisma/            # prisma schema/config
└─ public/            # assets
```

## Frontend Capabilities

### Product Experience

- animated landing and informational pages
- polished multi-section layout
- healthcare-oriented branding and result presentation

### Chat Flow

- normal healthcare conversation mode
- diagnosis mode with session-aware UI
- image upload and report upload support
- progress indicators for longer operations
- adaptive results panel

### Account and Data Layer

- signup and login
- email verification
- password reset
- session persistence

## Frontend as Application Layer

The frontend is not only rendering React components. It also provides:

- authenticated request forwarding to the backend
- normalization of backend responses
- timeout and retry handling
- integration of file uploads into diagnosis flows
- secure sharing of trusted internal headers

## Important Routes

- `/chat`
- `/about`
- `/Philosophy`
- `/api/diagnose/chat/json`
- `/api/diagnose/upload-report`
- `/api/diagnose/translate`
- `/api/conversation/chat/json`
- `/api/auth/[...nextauth]`

## Environment Variables

Typical frontend variables:

```env
DATABASE_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
BACKEND_URL=
SHARED_SECRET=
OPENAI_API_KEY=
OPENAI_MODEL=
UNSPLASH_ACCESS_KEY=
```

## Local Development

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Database Commands

```bash
npm run db:gen
npm run db:migrate
```

## Deployment

Recommended target: Vercel

Deployment notes:

- deploy the `frontend/` directory as the Next.js app
- set `BACKEND_URL` to the FastAPI deployment
- keep `SHARED_SECRET` identical across frontend and backend
- provide NextAuth and database environment variables in Vercel

## What Makes This Frontend Strong

- combines UI, auth, and orchestration responsibilities
- handles multimodal user flows instead of basic form submission
- includes real product design work around trust, clarity, and progressive disclosure
- bridges browser interactions to a heavier ML backend cleanly

## Related Docs

- [Root README](../README.md)
- [Backend README](../backend/README.md)
- [Setup Guide](../setup.md)
