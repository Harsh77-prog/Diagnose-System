# MedCoreAI Project Documentation

## 1. Project Overview

MedCoreAI is a full-stack medical assistant platform built around:

- authenticated user accounts
- persistent chat sessions
- multimodal diagnosis flow
- medical report upload and analysis
- medical image upload and MedMNIST-based image inference
- translated output support
- downloadable styled PDF diagnosis reports

The project is split into two deployable apps:

- `frontend/`: Next.js app for UI, auth, session management, API proxying, and PDF/report rendering
- `backend/`: FastAPI app for diagnosis logic, image inference, report parsing, translation, and healthcare conversation APIs

The current architecture is hybrid:

- UI, auth, and chat persistence live in the frontend app
- medical inference and backend business logic live in Python
- the frontend proxies authenticated requests to the backend using a shared secret

---

## 2. High-Level Architecture

### Frontend

- Framework: Next.js 16.1.6 with React 19
- Language: TypeScript
- Styling: Tailwind CSS v4
- Auth: NextAuth with Prisma adapter
- Database access: Prisma + PostgreSQL (Neon-compatible)
- UI components: custom app components + Radix-based primitives
- Client features:
  - login/signup/reset/verify
  - landing pages
  - chat dashboard
  - upload flows for images and reports
  - progress bars
  - Hindi translation toggle behavior
  - diagnosis popup and PDF generation

### Backend

- Framework: FastAPI
- Language: Python
- ML/image inference: PyTorch + torchvision + MedMNIST
- Diagnosis engine: custom ML + symptom extraction + follow-up orchestration
- Report analysis: PDF/text/image parsing + LLM-based symptom extraction
- Translation: deep-translator (GoogleTranslator), with frontend OpenAI fallback
- Auth validation: internal shared-secret header or JWT decoding

### Storage Layers

- PostgreSQL via Prisma:
  - users
  - auth sessions/accounts
  - verification tokens
  - chat sessions
  - chat messages
- local JSON file storage on backend:
  - per-user history files under `CHROMA_PERSIST_DIR/history`
- local model/data files:
  - `backend/medical_ML/models`
  - `backend/medical_ML/data`
- transient browser storage only:
  - uploaded image/report previews are handled as base64 strings or object URLs in the browser

There is no S3/Cloudinary/blob-storage integration in the current codebase.

---

## 3. Core Tech Stack

## Frontend Stack

- `next`
  - app router, layouts, pages, route handlers, deployment-ready SSR/API
- `react`, `react-dom`
  - UI rendering and client state
- `typescript`
  - type safety across pages, routes, and components
- `tailwindcss`, `@tailwindcss/postcss`, `tailwind-merge`, `class-variance-authority`
  - styling and class composition
- `next-auth`
  - credentials login, Google OAuth, JWT session strategy
- `@auth/prisma-adapter`
  - adapter between NextAuth and Prisma models
- `@prisma/client`, `prisma`
  - ORM and schema/migrations
- `@neondatabase/serverless`, `@prisma/adapter-neon`
  - PostgreSQL/Neon connectivity support
- `bcrypt`
  - password hashing and password verification
- `nodemailer`
  - verification/reset emails through Gmail SMTP
- `lucide-react`
  - icons across auth, landing page, chat, popup, and controls
- `radix-ui`
  - UI primitives used by local `components/ui/*`
- `motion`
  - animation helpers in shared in-view UI utilities
- `framer-motion`
  - used in `frontend/app/(Main)/Philosophy/page.tsx`
- `tsparticles`, `@tsparticles/react`, `@tsparticles/engine`
  - particle/ring background effects via `frontend/components/medical-particle-background.tsx`
- `html2canvas`
  - converts DOM report sections into canvas before PDF export
- `pdf-lib`
  - builds the final downloadable diagnosis PDF
- `jspdf`
  - installed, but current diagnosis export flow uses `pdf-lib`, not `jspdf`
- `axios`
  - installed dependency; not a major active dependency in the current primary flows
- `spinner`
  - installed dependency; current visible spinners are custom UI components
- `ws`
  - installed, not a major visible app-level feature in the current flow

## Backend Stack

- `fastapi`
  - backend API server
- `uvicorn[standard]`
  - ASGI server
- `python-multipart`
  - file upload/form parsing
- `python-jose[cryptography]`
  - JWT decode support for auth fallback
- `python-dotenv`
  - `.env` loading
- `torch`, `torchvision`
  - image model loading and inference
- `numpy`
  - tensor/result processing
- `Pillow`
  - image decoding, resizing, validation
- `medmnist`
  - label metadata and dataset definitions for medical image classification
- `opencv-python-headless`
  - included for image/ML-related processing support
- `deep-translator`
  - backend text translation using GoogleTranslator
- `pypdf`
  - PDF text extraction for uploaded reports
- `httpx`
  - backend HTTP calls to external LLM APIs inside conversation/report flows
- `transformers`
  - used by BioBERT symptom extraction components
- `scikit-learn`, `xgboost`, `scipy`, `joblib`, `pandas`
  - custom tabular ML/training pipeline support
- optional `pytesseract`
  - not in requirements, but `report_analyzer.py` supports it if installed for OCR from report images

---

## 4. Repository Structure

### Frontend

- `frontend/app/layout.tsx`
  - root layout, metadata, fonts, `SessionProvider`
- `frontend/app/providers.tsx`
  - wraps app in NextAuth session provider
- `frontend/app/(Main)/page.tsx`
  - landing page
- `frontend/app/(Main)/chat/page.tsx`
  - main diagnosis/chat experience
- `frontend/app/(Main)/about/page.tsx`
  - informational page
- `frontend/app/(Main)/Philosophy/page.tsx`
  - animated philosophy page
- `frontend/app/(Basic Auth)/*`
  - login, signup, verify, reset, signout pages
- `frontend/app/api/*`
  - Next.js route handlers for auth, chat persistence, backend proxying, translation, image search
- `frontend/components/*`
  - reusable UI and feature components
- `frontend/prisma/schema.prisma`
  - DB schema

### Backend

- `backend/main.py`
  - FastAPI app bootstrap, middleware, warmup, health endpoints
- `backend/config.py`
  - config/env loading
- `backend/auth.py`
  - request authentication
- `backend/routers/diagnose.py`
  - diagnosis/image/report/translate endpoints
- `backend/routers/conversation.py`
  - general healthcare conversation endpoints
- `backend/diagnose_ml.py`
  - ML diagnosis orchestration
- `backend/image_predictor.py`
  - MedMNIST model loading and image inference
- `backend/report_analyzer.py`
  - uploaded medical report processing
- `backend/report_parser.py`
  - PDF/text extraction helpers
- `backend/translator/service.py`
  - translation logic
- `backend/chroma_store.py`
  - JSON-file history store
- `backend/medical_ML/*`
  - training code, metadata, models, and dataset files

---

## 5. Database and Persistence Model

The PostgreSQL schema in `frontend/prisma/schema.prisma` currently contains:

- `User`
  - user identity data
  - optional password for credentials auth
  - related auth accounts/sessions
  - related chat sessions
- `Account`
  - OAuth provider linkage
- `Session`
  - NextAuth session records
- `ChatSession`
  - a single user-owned chat conversation
- `Message`
  - message history per chat session
  - includes:
    - `role`
    - `content`
    - `jsonPayload`
- `VerificationToken`
  - email verification and password reset tokens

### What `jsonPayload` stores

This field is critical to the product:

- for user messages:
  - uploaded image preview metadata
  - uploaded report preview metadata
- for assistant messages:
  - follow-up state
  - ML diagnosis payload
  - image/report analysis payloads

That means the DB is not just storing plain chat text. It also stores the machine-readable state that lets the chat resume diagnosis flow correctly.

### Backend file-based history

The backend also keeps per-user JSON histories in `CHROMA_PERSIST_DIR/history`.

Important note:

- the filename/module still says `chroma_store.py`
- actual implementation is JSON files, not ChromaDB

This is used as backend-side lightweight context persistence, separate from Prisma chat storage.

---

## 6. Authentication Flow

Authentication is implemented in the frontend app with NextAuth.

### Auth providers

- Credentials provider
  - email + password
  - password checked with `bcrypt.compare`
  - blocks login if email is not verified
- Google provider
  - OAuth-based login
  - dangerous account linking is enabled

### Session strategy

- JWT session strategy is used
- JWT callback loads user data once on login
- session callback hydrates `session.user.id`, `session.user.emailVerified`, and `session.user.name`

### Email verification flow

Files involved:

- `frontend/app/api/auth/register/route.ts`
- `frontend/app/api/auth/verify/route.ts`
- `frontend/app/api/auth/verify/requestLink/route.ts`
- `frontend/app/api/auth/verify/isValid/route.ts`
- `frontend/app/api/auth/utils/mailer.ts`

Working flow:

1. user signs up
2. password is hashed with bcrypt
3. user row is created
4. a `VerificationToken` row is created
5. verification email is sent by Nodemailer using Gmail SMTP
6. verify endpoint marks token as accepted and stamps `emailVerified`

### Password reset flow

Files involved:

- `frontend/app/api/auth/reset/requestLink/route.ts`
- `frontend/app/api/auth/reset/isValid/route.ts`
- `frontend/app/api/auth/reset/route.ts`

Working flow:

1. reset link requested
2. reset token stored in `VerificationToken`
3. email sent with Nodemailer
4. token validity checked
5. new password hashed with bcrypt
6. user password updated

### Backend authentication model

The backend uses `backend/auth.py`.

Accepted auth methods:

- preferred: internal proxy auth
  - `X-Internal-Secret`
  - `X-User-Id`
- fallback: Bearer JWT decoded with `NEXTAUTH_SECRET`

This allows the Next.js app to securely proxy calls to the Python backend.

---

## 7. Frontend API Routes

### Auth routes

- `/api/auth/[...nextauth]`
  - NextAuth handler
- `/api/auth/register`
  - signup
- `/api/auth/verify`
  - consume verification token
- `/api/auth/verify/requestLink`
  - resend verification link
- `/api/auth/verify/isValid`
  - token validation
- `/api/auth/reset/requestLink`
  - start password reset
- `/api/auth/reset/isValid`
  - validate reset token
- `/api/auth/reset`
  - complete password reset

### Chat persistence routes

- `/api/chat/sessions`
  - list user chat sessions
  - create new chat session
- `/api/chat/sessions/[id]`
  - delete chat session
- `/api/chat/sessions/[id]/messages`
  - fetch messages
  - append new message

### Diagnosis and proxy routes

- `/api/diagnose/chat/json`
  - main multimodal diagnosis orchestrator in the frontend tier
  - validates session and DB state
  - optionally calls backend image/report services
  - builds final diagnosis payload and follow-up flow
- `/api/diagnose/upload-report`
  - authenticated proxy to backend report upload/analysis
- `/api/diagnose/translate`
  - translation proxy with backend-first and OpenAI fallback

### Conversation route

- `/api/conversation/chat/json`
  - authenticated proxy for general healthcare Q&A

### Utility route

- `/api/images/search`
  - fetches a single Unsplash image based on a query
  - used for image-enhanced tips in the chat UI

---

## 8. Backend API Routes

Defined mainly in `backend/routers/diagnose.py` and `backend/routers/conversation.py`.

### Diagnose router

- `POST /api/diagnose/chat`
  - form-based diagnosis
- `POST /api/diagnose/chat/json`
  - backend diagnosis entry with optional image/report prediction data
- `GET /api/diagnose/history`
  - recent backend-side history
- `POST /api/diagnose/upload-report`
  - report parsing and report symptom extraction
- `POST /api/diagnose/image-predict`
  - image inference endpoint
- `POST /api/diagnose/image-predict/warmup`
  - loads models before first heavy inference
- `POST /api/diagnose/recommend-datasets`
  - maps symptoms to relevant MedMNIST datasets
- `POST /api/diagnose/translate`
  - translation endpoint

### Conversation router

- `POST /api/conversation/chat`
- `POST /api/conversation/chat/json`
- `GET /api/conversation/status`

This flow is for general healthcare questions, not the structured diagnostic pipeline.

---

## 9. Main Feature Flows

## 9.1 Landing and Marketing Flow

Main files:

- `frontend/app/(Main)/page.tsx`
- `frontend/components/medical-particle-background.tsx`
- `frontend/components/navbar.tsx`

Key behaviors:

- renders MedCoreAI landing page
- uses `MedicalParticleRingCanvas` for soft medical halo/particle background
- uses Radix accordion for FAQ-like content
- uses Lucide icons for feature presentation

Particle animation implementation:

- library:
  - `tsparticles`
  - `@tsparticles/react`
  - `@tsparticles/engine`
- current custom implementation:
  - canvas-based orbital ring particles
  - hover repulse interaction
  - medical / dark / shiny theme options

---

## 9.2 Normal Healthcare Conversation Flow

Main files:

- `frontend/app/api/conversation/chat/json/route.ts`
- `backend/routers/conversation.py`

Working flow:

1. user sends a general health question
2. frontend checks session
3. frontend forwards the message to backend with `X-Internal-Secret` and `X-User-Id`
4. backend decides whether the content should be redirected to diagnosis behavior
5. if it is just a health question, backend calls external chat-completions API
6. healthcare-only system prompt constrains the model
7. response comes back to UI

Important implementation detail:

- this path is not the structured ML diagnosis engine
- it is a healthcare Q&A assistant path

---

## 9.3 Chat Session and Message Persistence Flow

Main files:

- `frontend/app/(Main)/chat/page.tsx`
- `frontend/app/api/chat/sessions/route.ts`
- `frontend/app/api/chat/sessions/[id]/messages/route.ts`

Working flow:

1. user opens chat page
2. frontend loads chat sessions from Prisma
3. selecting a session loads stored messages
4. if needed, frontend creates a new `ChatSession`
5. user message is saved to the DB immediately
6. assistant message is saved after API response
7. UI re-syncs from DB after each turn

Why this matters:

- source of truth for the visible chat is Prisma message history
- follow-up state recovery depends on the latest assistant `jsonPayload`

---

## 9.4 Text Diagnosis Flow

Main files:

- `frontend/app/(Main)/chat/page.tsx`
- `frontend/app/api/diagnose/chat/json/route.ts`
- `backend/routers/diagnose.py`
- `backend/diagnose_ml.py`

Current flow:

1. user enters medical complaint or symptom text
2. frontend decides this should use diagnosis flow
3. frontend sends request to `/api/diagnose/chat/json`
4. frontend route:
   - validates logged-in user
   - loads current Prisma message history
   - reconstructs follow-up state from `jsonPayload`
   - extracts image/report payloads if attached
5. if image is attached:
   - frontend route calls backend image inference
6. if report is attached:
   - frontend route calls backend report analyzer
7. frontend route then combines:
   - current message
   - stored follow-up state
   - image prediction
   - report analysis
   - symptom extraction
8. it computes next question or final diagnosis
9. assistant reply and structured payload are saved into the DB
10. chat UI renders:
   - plain reply
   - follow-up controls
   - structured probability cards
   - popup when diagnosis completes

### Diagnosis engine details

The current diagnosis route mixes several approaches:

- rule-based medical intent detection
- local disease dataset loading
- symptom extraction from text
- follow-up state machine
- optional OpenAI-generated follow-up questions
- demographic/context adjustments
- image-guided boosting of disease probabilities
- report-guided symptom injection

Important note:

- older docs mention a simpler pure-BioBERT/random-forest flow
- the current codebase is more hybrid and multimodal than that older description

---

## 9.5 Follow-Up Question Flow

Main files:

- `frontend/app/api/diagnose/chat/json/route.ts`
- `frontend/app/(Main)/chat/page.tsx`

How it works:

- the diagnosis route stores a `kind: "followup_state"` payload
- frontend reads that payload from the latest assistant message
- UI shows:
  - yes/no buttons
  - upload buttons
  - custom choices
- next answer re-enters the same diagnose route
- route updates:
  - confirmed symptoms
  - denied symptoms
  - demographic slots
  - image/report availability flags
  - turn counter

This is the core conversational diagnosis loop.

---

## 9.6 Image Upload and Image Diagnosis Flow

Main files:

- `frontend/app/(Main)/chat/page.tsx`
- `frontend/app/api/diagnose/chat/json/route.ts`
- `backend/routers/diagnose.py`
- `backend/image_predictor.py`

Working flow:

1. user uploads an image from the chat UI
2. browser converts the file to base64
3. frontend stores preview metadata in the user message payload
4. frontend route sends image base64 to backend `/api/diagnose/image-predict`
5. backend auth validates internal secret/user id
6. backend validates:
   - request rate
   - payload presence
   - file format
   - maximum size
   - image dimension
7. backend chooses or receives preferred datasets
8. `ImagePredictor` loads models lazily from disk
9. inference runs in parallel across selected MedMNIST models
10. backend returns:
   - `best_dataset`
   - `best_label_name`
   - `best_confidence`
   - top per-dataset scores
11. frontend diagnosis route sanitizes/renames labels and merges image results into the diagnosis flow
12. final reply explains image-based clues

### Image models currently supported

- `chestmnist`
- `dermamnist`
- `retinamnist`
- `pathmnist`
- `bloodmnist`

### Image predictor implementation details

- uses lazy model loading
- supports `.pth` and `.pt`
- detects architecture type
  - SimpleCNN
  - ResNet-18
- keeps in-memory model cache
- has prediction LRU cache
- runs parallel inference through `ThreadPoolExecutor`

### Warmup behavior

From `backend/main.py` and `backend/routers/diagnose.py`:

- image models are warmed on startup
- periodic warmup runs every 5 minutes
- explicit `/image-predict/warmup` also exists

### Frontend UI behavior for image analysis

- progress panel shown while analyzing
- uploaded image preview attached to the user message
- image findings can be surfaced in structured analysis cards

---

## 9.7 Medical Report Upload and Analysis Flow

Main files:

- `frontend/app/api/diagnose/upload-report/route.ts`
- `backend/routers/diagnose.py`
- `backend/report_analyzer.py`
- `backend/report_parser.py`

Working flow:

1. user uploads report file
2. frontend proxies multipart form to backend
3. backend reads file and identifies type
4. report text extraction path depends on type:
   - `.pdf` -> `pypdf` text extraction
   - `.txt`, `.csv` -> direct decode
   - image files -> OCR attempt
5. report text is sent to external chat-completions API with report-analysis prompt
6. backend expects structured JSON:
   - extracted findings
   - symptom list
   - summary
7. symptoms extracted from the report are merged into diagnosis flow
8. summary and findings can be displayed in the popup and final answer

### OCR details

Image report OCR path in `report_analyzer.py`:

- first tries `pytesseract` if available
- if not available, it logs fallback behavior
- API-driven report understanding still happens from extracted text

Important note:

- OCR is optional and environment-dependent because `pytesseract` is not pinned in the main requirements file

---

## 9.8 Translation Flow

Main files:

- `frontend/app/api/diagnose/translate/route.ts`
- `backend/translator/service.py`
- `backend/routers/diagnose.py`

Working flow:

1. frontend requests translation
2. frontend tries backend translation first
3. backend uses `deep-translator` with `GoogleTranslator`
4. for structured diagnosis text, backend preserves question structure
5. if backend is unavailable or fails, frontend can fall back to OpenAI translation

### Translation design

- backend path:
  - cheap/simple runtime translator
  - line-by-line safe chunking
  - Hindi-aware skip logic if already translated
- frontend fallback path:
  - OpenAI chat completion fallback
  - can handle plain text and some JSON-value translation

---

## 9.9 Diagnosis Result Popup and PDF Export Flow

Main file:

- `frontend/components/diagnosis-result-popup.tsx`

This is one of the most feature-rich components in the app.

### What it does

- renders structured final diagnosis view
- shows:
  - likely condition
  - confidence
  - profile
  - symptoms
  - uploaded files
  - image-identified symptoms
  - report-identified symptoms
  - dataset prediction chart
  - home remedies
- provides downloadable PDF report
- shows completion/thank-you overlay

### PDF generation implementation

Libraries used:

- `html2canvas`
  - captures styled DOM sections into canvas
- `pdf-lib`
  - creates and edits the final PDF document

Current PDF pipeline:

1. render diagnosis report in HTML
2. use `html2canvas` to capture report content
3. use `pdf-lib` to create PDF
4. embed:
   - styled report pages
   - uploaded image if available
   - uploaded existing PDF if available
   - project logo/stamp assets where possible
5. generate bytes
6. trigger browser download

### Why `pdf-lib` is the active library

- installed `jspdf` exists, but current export implementation uses `pdf-lib`
- `pdf-lib` is used for:
  - embedding pages/images
  - controlling fonts and page layout
  - merging uploaded PDF pages into final output

---

## 9.10 Particle and Visual Effects Flow

Main files:

- `frontend/components/medical-particle-background.tsx`
- `frontend/app/(Main)/page.tsx`

Library used:

- `tsparticles`

Available implementations in the component:

- `MedicalParticleBackground`
  - full tsParticles-style config
- `MedicalParticleRingCanvas`
  - custom canvas implementation, recommended
- `MedicalRingBackground`
  - simple CSS pulse rings

Current active usage:

- landing page uses `MedicalParticleRingCanvas` with shiny theme

Behavior:

- orbital particles around center
- hover/mouse interaction
- theme-based color schemes
- low/medium/high intensity

---

## 9.11 Unsplash Tip Image Flow

Main files:

- `frontend/app/api/images/search/route.ts`
- `frontend/app/(Main)/chat/page.tsx`

Purpose:

- fetches a related image for advice/tip content shown in the chat interface

Service used:

- Unsplash Search API

Flow:

1. component requests `/api/images/search?query=...`
2. route uses `UNSPLASH_ACCESS_KEY`
3. returns one `small` image URL

This is a UI enhancement, not part of diagnosis logic.

---

## 10. Detailed Library Usage Map

## Frontend libraries and where they are used

- `next-auth`
  - `frontend/lib/auth/options.ts`
  - `frontend/app/providers.tsx`
  - auth API handlers and protected API routes
- `bcrypt`
  - register, credentials login, password reset
- `nodemailer`
  - verification/reset emails
- `prisma`
  - auth and chat persistence
- `lucide-react`
  - almost all UI icons including chat, popup, landing page, auth pages
- `radix-ui`
  - `components/ui/button.tsx`
  - `components/ui/popover.tsx`
  - `components/ui/accordion.tsx`
  - label, separator, badge, etc.
- `motion`
  - `components/ui/in-view.tsx`
- `framer-motion`
  - `frontend/app/(Main)/Philosophy/page.tsx`
- `tsparticles`
  - `frontend/components/medical-particle-background.tsx`
- `html2canvas`
  - `frontend/components/diagnosis-result-popup.tsx`
- `pdf-lib`
  - `frontend/components/diagnosis-result-popup.tsx`
- `jspdf`
  - installed but not the main active export implementation
- `Unsplash API`
  - `frontend/app/api/images/search/route.ts`

## Backend libraries and where they are used

- `fastapi`
  - `backend/main.py`, routers
- `python-jose`
  - `backend/auth.py`
- `torch`, `torchvision`, `numpy`
  - `backend/image_predictor.py`
- `medmnist`
  - label metadata and dataset labels in image prediction
- `Pillow`
  - image parse/resize/format validation
- `pypdf`
  - `backend/report_parser.py`, `backend/report_analyzer.py`
- `deep-translator`
  - `backend/translator/service.py`
- `httpx`
  - external LLM calls for report analysis and healthcare conversation
- `transformers`
  - local symptom extraction components under `medical_ML`
- `scikit-learn`, `xgboost`, `joblib`, `pandas`, `scipy`
  - local ML training/inference support in `medical_ML`

---

## 11. Environment Variables and Configuration

## Frontend envs

Common ones implied by code:

- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL`
- `BACKEND_URL`
- `SHARED_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_TRANSLATE_MODEL`
- `UNSPLASH_ACCESS_KEY`
- `EMAIL`
- `EMAIL_PASS`

## Backend envs

From `backend/config.py` and route usage:

- `NEXTAUTH_SECRET`
- `SHARED_SECRET`
- `CHROMA_PERSIST_DIR`
- `BACKEND_HOST`
- `BACKEND_PORT`
- `REQUEST_TIMEOUT_SECONDS`
- `ML_INFERENCE_TIMEOUT_SECONDS`
- `IMAGE_INFERENCE_TIMEOUT_SECONDS`
- `PREDICTION_CACHE_SIZE`
- `ENTROPY_CACHE_SIZE`
- `EMBEDDING_CACHE_SIZE`
- `MAX_IMAGE_UPLOAD_SIZE`
- `MAX_IMAGE_DIMENSION`
- `RATE_LIMIT_PER_MINUTE`
- `SESSION_TTL_SECONDS`
- `MAX_SESSIONS`
- `IMAGE_CACHE_TTL_SEC`
- `IMAGE_CACHE_MAX_ITEMS`
- `MODEL_DIR`
- `OPEN_API_BASE_URL` or `OPENAI_BASE_URL`
- `OPEN_API_KEY` or `OPENAI_API_KEY`
- `OPEN_API_MODEL` or `OPENAI_MODEL`

---

## 12. Performance and Reliability Features

- Prisma client singleton prevents duplicate clients in dev
- image model warmup reduces cold-start cost
- periodic backend warmup every 5 minutes
- request timeout middleware in FastAPI
- image prediction timeout wrapping with retry logic in frontend diagnose route
- image LRU prediction cache
- follow-up state persisted in DB
- session/message persistence in PostgreSQL
- translation fallback chain
- PDF export fallback handling

---

## 13. Security Model

- frontend API routes are protected by NextAuth sessions
- backend API routes validate internal shared secret and forwarded user id
- JWT fallback exists for backend auth
- passwords are hashed with bcrypt
- verification/reset links use stored tokens
- session ownership is checked before reading or deleting chat data

Important note:

- the frontend proxies backend requests instead of exposing direct backend auth to the browser
- this is the main trust boundary in the current architecture

---

## 14. Data Flow Summary by Feature

### Signup

UI -> `/api/auth/register` -> Prisma user + verification token -> Nodemailer email -> `/verify`

### Login

UI -> NextAuth credentials/Google -> JWT session -> `SessionProvider`

### New chat

UI -> `/api/chat/sessions` -> Prisma `ChatSession`

### Send chat message

UI -> save user message -> `/api/diagnose/chat/json` or `/api/conversation/chat/json` -> save assistant message -> reload DB messages

### Image diagnosis

UI file input -> base64 -> frontend diagnose route -> backend `/api/diagnose/image-predict` -> `ImagePredictor` -> result merged into final diagnosis

### Report analysis

UI file input -> multipart proxy -> backend `/api/diagnose/upload-report` -> extract text/OCR -> LLM symptom extraction -> result merged into diagnosis

### Translation

UI -> frontend `/api/diagnose/translate` -> backend translator -> fallback OpenAI if needed

### PDF export

popup HTML -> `html2canvas` -> `pdf-lib` -> merged downloadable PDF

---

## 15. Important Current Implementation Notes

- The diagnosis flow is more advanced than the older project summary. It is not only a simple text classifier anymore.
- The frontend diagnose route is a major orchestration layer, not just a dumb proxy.
- Backend history storage is JSON-file based despite the old `chroma_store.py` naming.
- `pdf-lib` is the actual PDF engine for diagnosis export.
- `tsparticles` powers the particle/ring visual system.
- Uploaded files are not permanently stored in object storage.
- Report OCR with `pytesseract` is optional, not guaranteed in all environments.
- Some dependencies are installed but appear secondary or legacy in the current codebase, especially `jspdf`, `axios`, `spinner`, and `ws`.

---

## 16. Short Project Summary

MedCoreAI is a Next.js + FastAPI medical assistant platform with authenticated chat, multimodal diagnosis, report parsing, MedMNIST image inference, translation support, and downloadable PDF reports. The frontend handles product UX, auth, DB persistence, and request orchestration. The backend handles medical inference, image models, translation, report analysis, and healthcare conversation services. PostgreSQL stores users/chats/messages, while backend JSON files store lightweight history context and local model files power image classification.
