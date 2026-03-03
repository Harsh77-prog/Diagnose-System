# Diagnose System Setup Guide

This guide sets up the project for local development and deployment with:
- Frontend on Vercel (Next.js)
- Backend on Render (FastAPI + ML image models)

## 1) Clone and Install

```bash
git clone <your-repo-url>
cd diagnoseSystem
```

### Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Frontend

```bash
cd ../frontend
npm install
```

## 2) Download MedMNIST Datasets

```bash
cd ../backend
python download_dataset.py
```

Datasets are stored under `backend/medical_ML/data` and are ignored by Git.

## 3) Train Image Models (All 5 datasets)

```bash
python train_model.py
```

This trains and saves:
- `backend/medical_ML/models/chestmnist_model.pth`
- `backend/medical_ML/models/dermamnist_model.pth`
- `backend/medical_ML/models/retinamnist_model.pth`
- `backend/medical_ML/models/pathmnist_model.pth`
- `backend/medical_ML/models/bloodmnist_model.pth`

These files are ignored by Git (`*.pth`).

## 4) Run Backend (Render/local)

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Backend health:
- `GET /health`
- `POST /api/diagnose/chat/json`
- `POST /api/diagnose/image-predict`

## 5) Run Frontend (Vercel/local)

```bash
cd ../frontend
npm run dev
```

Set frontend env var:
- `DIAGNOSE_BACKEND_URL=https://<your-render-backend-domain>`

The chat API uses this backend URL to run image model prediction.

## 6) Deploy Notes

## Vercel (Frontend)
- Deploy only the `frontend` app.
- Set `DIAGNOSE_BACKEND_URL` in Vercel Environment Variables.
- Set auth/database env vars required by NextAuth/Prisma.

## Render (Backend)
- Deploy `backend` as a Python web service.
- Build command:
  - `pip install -r requirements.txt`
- Start command:
  - `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Ensure model weights (`*.pth`) are available on disk (train during build or mount persistent storage).

## 7) Git Hygiene (Important)

Before commit:

```bash
git status
```

If any dataset files were previously tracked, untrack them:

```bash
git rm -r --cached backend/medical_ML/data/medmnist_images
git commit -m "Stop tracking MedMNIST image data"
```

Then commit source changes:

```bash
git add .
git commit -m "Project cleanup: image diagnosis flow + setup guide"
git push origin main
```

## 8) Current Diagnosis Flow

- Text-only diagnosis still works.
- Follow-up question 3 asks if user has a medical image.
- If image is provided, backend predicts across all 5 MedMNIST models.
- Final response blends text-based confidence with image model confidence.
