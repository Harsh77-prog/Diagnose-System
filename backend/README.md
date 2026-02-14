# MedCoreAI Diagnosis Backend

Python FastAPI backend for the diagnosis flow: chat with history (ChromaDB), report parsing, image (vision) support, and risk scoring.

## Stack

- **FastAPI** – API server
- **LangChain + OpenAI** – Doctor-style conversational AI (GPT-4o), with follow-up questions and triage
- **History store** – Per-user conversation history (JSON files under `CHROMA_PERSIST_DIR/history/`) for context and correct follow-ups
- **Risk model** – Keyword-based risk/severity scoring (low/medium/high/critical) and suggested actions
- **Report parsing** – PDF and text extraction for lab/imaging reports

## Setup

1. **Python 3.10+** and a virtualenv:

   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate   # Windows
   # source .venv/bin/activate  # macOS/Linux
   pip install -r requirements.txt
   ```

2. **Environment** – Copy `.env.example` to `.env` and set:

   - `OPENAI_API_KEY` – Your OpenAI API key (for GPT-4o and embeddings if needed).
   - `NEXTAUTH_SECRET` – Same as frontend (optional; used if frontend sends Bearer JWT).
   - `SHARED_SECRET` – Same secret as in frontend `.env`. Used when Next.js proxies requests with `X-Internal-Secret` and `X-User-Id`.
   - `CHROMA_PERSIST_DIR` – Directory for history data (default: `./chroma_data`); history is stored under `chroma_data/history/`.

3. **Run** (use the venv’s Python so FastAPI is found):

   ```bash
   .venv\Scripts\python -m uvicorn main:app --reload --port 8000
   ```
   Or after activating the venv: `uvicorn main:app --reload --port 8000`

## Frontend integration

- Frontend calls **Next.js API routes** (`/api/diagnose/chat`, `/api/diagnose/history`, `/api/diagnose/upload-report`).
- Next.js validates the session and forwards requests to this backend with:
  - `X-User-Id`: signed-in user id
  - `X-Internal-Secret`: same as `SHARED_SECRET`
- In frontend `.env` set:
  - `BACKEND_URL=http://127.0.0.1:8000` (or your backend URL)
  - `SHARED_SECRET` – same value as backend `SHARED_SECRET`

## API (authenticated)

- **POST /api/diagnose/chat/json** – Body: `{ "message", "report_text?", "image_b64?" }`. Returns `{ reply, risk_score, risk_level, suggested_action }`.
- **GET /api/diagnose/history** – Returns `{ user_id, history, count }` for the current user.
- **POST /api/diagnose/upload-report** – Form: `file` (PDF or text). Returns `{ extracted_text, filename }`.

## Behaviour

- Each user’s conversation is stored in ChromaDB and used as context for the next turn so the assistant can ask relevant follow-up questions and “diagnose” in a stepwise way.
- Images (e.g. X-rays, rash photos) are sent to OpenAI vision; report text is included in the prompt.
- Risk level is computed from symptom/report text and shown in the response; high/critical levels surface a clear suggested action (e.g. seek emergency care).
