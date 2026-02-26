# Medical Diagnostic System Architecture & Data Flow

This document outlines the complete end-to-end data lifecycle within the **MedCoreAI** system, from the moment a user types symptoms into their browser to the point where the Machine Learning model returns animated disease probabilities.

## 1. High-Level Architecture Overview

The system is composed of three primary layers:
1. **Frontend (Next.js 14 / React):** Handles user interactions, authentication, state management, and real-time UI rendering.
2. **Database (Neon Serverless PostgreSQL + Prisma):** Persistently stores User Profiles, Chat Sessions, and individual Messages.
3. **Backend (Python FastAPI + ML):** Uses BioBERT for NLP symptom extraction and a custom Random Forest matrix to predict diseases, ask follow-up questions, and return probability arrays.

---

## 2. Step-by-Step Data Flow

### A. Authentication & Session Initialization
1. **User Login (`frontend/app/login`):** The user enters their credentials. NextAuth securely authenticates them against the PostgreSQL database.
2. **Dashboard Load (`frontend/app/(Main)/chat/page.tsx`):** The React component mounts and automatically fires a `GET` request to `/api/chat/sessions`.
3. **Database Fetch:** Next.js queries Prisma for all historical `ChatSession` rows belonging to the logged-in User ID and populates the ChatGPT-style left sidebar.

### B. User Input & First Prediction
1. **Typing the Prompt:** The user types a symptom into the floating text box (e.g., *"I have a severe stomach ache and fever"*).
2. **Session Generation:** If there isn't an active Chat ID, React `POST`s to `/api/chat/sessions`. The backend uses an intelligent heuristic snippet to trim the prompt into a clean Title Case string ("Severe Stomach Ache And Fever") and creates a new DB row.
3. **Message DB Persistence:** React immediately `POST`s the user's text to `/api/chat/sessions/[id]/messages` to permanently save the query to the DB.
4. **Proxy to ML Backend:** Next.js proxies the text payload via an internal `fetch` to `/api/diagnose/...` and attaches an `X-Session-Id` header HTTP rule.
5. **FastAPI ML Reception (`backend/routers/diagnose.py`):** The Python server receives the payload. It queries `diagnose_ml.py` executing `_start_new_diagnosis()`.
6. **NLP Processing & Matrix Vector:** 
    - **BioBERT:** Extracts concrete tokens ("stomach ache", "fever").
    - **Vector Engine:** Converts symptoms into a boolean matrix `[0, 1, 0, 0, 1...]`.
    - **Decision Tree:** Uses random forest to calculate probabilities. Because the AI is usually "uncertain" on prompt #1, it generates the highest-yield follow-up medical question (e.g. *"Are you feeling nauseous?"*).
7. **Return Payload:** Python returns a large JSON dictionary containing `{ reply: "Are you...", top_predictions: [{disease: "Food Poisoning", probability: 0.45}...], follow_up_suggested: true }`.

### C. Frontend Progressive Rendering & Follow-ups
1. **Saving the ML Response:** Next.js receives the Python payload and `POST`s it to `/api/chat/sessions/[id]/messages`. It saves the raw text to the `content` database column and stringifies the Python prediction dictionary into the `jsonPayload` column!
2. **React Re-Render:** The chat window updates. `page.tsx` intercepts the `jsonPayload` from the database.
3. **Animated Progress Component:** It parses the JSON arrays. Instead of rendering raw text arrays, the custom `AnimatedProgress` React component dynamically builds native HTML bars mapping the `probability` floats to CSS widths (`transition-all duration-1000 w-[X%]`).
4. **Follow-Up Loop:** If the backend sent `follow_up_suggested: true`, React freezes the text input box and renders **Yes / No** buttons natively inline.
5. **Verification Dispatch:** Clicking "Yes" bypasses NLP entirely. React triggers an invisible proxy payload directly to the ML engine routing a `session_action = "yes"`. Python flips the specific symptom boolean inside its active memory array (linked via that exact `X-Session-Id`) from 0 to 1, recalculates the math, and returns the final accurate Diagnosis Probability Array to the frontend—completing the loop.
