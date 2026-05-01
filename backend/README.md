# MedCoreAI Backend

FastAPI backend for diagnosis orchestration, medical image inference, report analysis, translation, and healthcare conversation services.

## Overview

This backend powers the inference-heavy side of MedCoreAI. It is responsible for combining multiple medical support capabilities behind a clean API layer:

- diagnosis chat flow
- symptom extraction
- follow-up state handling
- medical image prediction
- uploaded report analysis
- translation support
- healthcare conversation endpoints

## Stack

- FastAPI
- PyTorch
- torchvision
- MedMNIST tooling
- Transformers / BioBERT-style symptom extraction path
- scikit-learn / xgboost ecosystem
- pypdf
- deep-translator

## Structure

```text
backend/
├─ main.py                  # FastAPI entrypoint
├─ routers/
│  ├─ diagnose.py           # diagnosis, image, report, translation routes
│  └─ conversation.py       # general healthcare conversation routes
├─ medical_ML/
│  ├─ models/               # trained model artifacts
│  ├─ data/                 # dataset/training data
│  ├─ ml_engine.py          # diagnosis engine
│  └─ symptom_extractor.py  # symptom extraction logic
├─ image_predictor.py       # image inference orchestration
├─ report_analyzer.py       # report parsing/analysis
├─ translator/              # translation service
└─ auth.py                  # backend auth verification
```

## Main API Areas

### Diagnosis

- `POST /api/diagnose/chat`
- `POST /api/diagnose/chat/json`
- `GET /api/diagnose/history`

### Image Analysis

- `POST /api/diagnose/image-predict`
- `POST /api/diagnose/image-predict/warmup`
- `POST /api/diagnose/recommend-datasets`

### Report Analysis

- `POST /api/diagnose/upload-report`

### Translation

- `POST /api/diagnose/translate`

### Healthcare Conversation

- `POST /api/conversation/chat`
- `POST /api/conversation/chat/json`
- `GET /api/conversation/status`

### Health

- `GET /`
- `GET /health`

## Core Responsibilities

### Diagnosis Engine

- manages multi-turn diagnostic flow
- maintains follow-up state
- blends extracted symptom evidence into predictions

### Symptom Extraction

- extracts structured symptom signals from natural language
- supports higher-accuracy embedding-based path
- supports low-memory fallback mode when needed

### Image Predictor

- loads trained image model weights
- predicts across medically relevant datasets
- manages memory-sensitive loading and unloading behavior

### Report Analyzer

- parses uploaded report content
- extracts findings and symptoms
- returns structured report analysis for downstream use

## Authentication Model

The backend is designed to trust requests coming from the frontend application layer.

Typical trusted headers:

- `X-Internal-Secret`
- `X-User-Id`

This allows the Next.js layer to validate the user session and then securely proxy to the backend.

## Environment Variables

Common backend variables:

```env
OPENAI_API_KEY=
OPEN_API_BASE_URL=
OPEN_API_KEY=
OPEN_API_MODEL=
NEXTAUTH_SECRET=
SHARED_SECRET=
CHROMA_PERSIST_DIR=
MODEL_DIR=
REQUEST_TIMEOUT_SECONDS=
IMAGE_INFERENCE_TIMEOUT_SECONDS=
IMAGE_MODEL_KEEP_LOADED=
IMAGE_MODEL_MAX_RESIDENT=
IMAGE_INFERENCE_MAX_WORKERS=
IMAGE_MODEL_WARMUP_ON_STARTUP=
IMAGE_MODEL_PERIODIC_WARMUP=
MEDCORE_LOW_MEMORY_MODE=
SYMPTOM_EMBEDDING_ENABLED=
TORCH_NUM_THREADS=
TORCH_NUM_INTEROP_THREADS=
```

## Local Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Model Preparation

```bash
python download_dataset.py
python train_model.py
```

Expected model artifacts include:

- `medical_ML/models/chestmnist_model.pth`
- `medical_ML/models/dermamnist_model.pth`
- `medical_ML/models/retinamnist_model.pth`
- `medical_ML/models/pathmnist_model.pth`
- `medical_ML/models/bloodmnist_model.pth`

## Deployment Notes

Recommended:

- deploy `backend/` as a separate Python service
- expose its public URL to the frontend through `BACKEND_URL`
- keep `SHARED_SECRET` synchronized across both apps

### Practical Note

This backend supports both constrained and richer deployment environments. High-accuracy multimodal inference benefits from stronger infrastructure, while the codebase also includes fallback modes for lower-resource hosting.

## What Makes This Backend Interesting

- real multimodal orchestration instead of isolated toy endpoints
- nontrivial inference flow management
- deployment-aware model lifecycle handling
- separation between app layer and inference layer

## Related Docs

- [Root README](../README.md)
- [Frontend README](../frontend/README.md)
- [Setup Guide](../setup.md)
