# MedCoreAI

Multimodal healthcare AI system for conversational triage, medical image analysis, report understanding, and session-aware guidance.

## Overview

MedCoreAI is a full-stack AI product built around a difficult problem: helping users move from unstructured health questions to clearer, safer, and more context-aware guidance.

Instead of treating healthcare support as a single chatbot prompt, the system combines:

- symptom-driven conversational flow
- follow-up questioning
- medical image inference
- medical report analysis
- translation support
- persistent session history

This makes the project stronger than a typical chat demo because it includes real orchestration across frontend UX, backend APIs, and ML components.

## What The Project Delivers

- AI-assisted health conversation
- dynamic diagnosis flow with follow-up questions
- uploaded medical image analysis
- uploaded medical report parsing and summarization
- confidence-aware result presentation
- multilingual translation support
- PDF-friendly diagnosis summary workflow

## Why This Project Is Interesting

- It is multimodal, not text-only.
- It separates web app concerns from inference concerns.
- It handles nontrivial deployment realities like timeouts, warmups, memory pressure, and server-to-server auth.
- It treats healthcare as a safety-sensitive domain rather than just a generic AI chat use case.

## Architecture

```text
User
  -> Next.js frontend
    -> Next.js API routes
      -> FastAPI backend
        -> diagnosis engine
        -> image predictor
        -> report analyzer
        -> translator
        -> conversation service
```

## Repository Structure

```text
Diagnose-System/
├─ frontend/   # Next.js app, auth, UI, proxy/API layer
├─ backend/    # FastAPI app, ML services, report/image/translation logic
├─ docs/       # supporting notes and documentation
└─ setup.md    # setup and deployment guide
```

## Tech Stack

### Frontend

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- NextAuth
- Prisma
- Neon Postgres

### Backend

- FastAPI
- PyTorch
- torchvision
- MedMNIST tooling
- Transformers / BioBERT-style symptom extraction path
- scikit-learn ecosystem
- pypdf

## Product Areas

### Conversational Triage

- symptom-first diagnostic workflow
- adaptive follow-up questions
- result explanation with confidence

### Image Analysis

- medical image upload in the diagnosis flow
- dataset-specific model selection
- integration of image-derived signals into final response

### Report Analysis

- uploaded report handling
- extraction of findings and symptoms
- support for multimodal fusion into diagnosis output

### User Experience

- landing page and product narrative
- chat history and saved sessions
- results panel and modal summaries
- translation and export affordances

## Local Development

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

For full setup, model preparation, and deployment notes, see [setup.md](./setup.md).

## Deployment Model

- `frontend`: Vercel
- `backend`: Render or another Python host
- `database`: Neon / Postgres

This split keeps the product layer independent from the heavier ML service layer.

## Interview Framing

This project is best understood as:

- a full-stack AI product prototype
- a multimodal healthcare assistant
- a system design and integration project, not just a UI app

It is not positioned as a licensed clinical system. It is positioned as a technically ambitious healthcare AI platform with real product and infrastructure thinking behind it.

## Recommended Reading

- [Frontend README](./frontend/README.md)
- [Backend README](./backend/README.md)
- [Setup Guide](./setup.md)
