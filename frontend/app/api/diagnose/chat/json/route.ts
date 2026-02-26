import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prismaUser as prisma } from "@/lib/prisma/client";

type DiseaseRow = { name: string; symptoms: string[] };

type DatasetCache = {
  loaded: boolean;
  symptoms: string[];
  symptomSet: Set<string>;
  diseases: DiseaseRow[];
  descriptions: Record<string, string>;
  precautions: Record<string, string[]>;
};

type FollowupState = {
  kind: "followup_state";
  pending: boolean;
  turns: number;
  maxTurns: number;
  confirmedSymptoms: string[];
  deniedSymptoms: string[];
  askedSymptoms: string[];
  topCandidates: string[];
  currentQuestionId: string;
  currentQuestionText: string;
  slots: {
    temperatureF?: number;
    durationDays?: number;
  };
};

type Prediction = { disease: string; probability: number; matched: number; total: number };

let DATASET_CACHE: DatasetCache | null = null;

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((v) => v.length > 0)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((v) => v.length > 0)) rows.push(row);
  }

  return rows;
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ");
}

function loadDatasets(): DatasetCache {
  if (DATASET_CACHE) return DATASET_CACHE;

  const candidates = [
    path.resolve(process.cwd(), "../backend/medical_ML/data"),
    path.resolve(process.cwd(), "backend/medical_ML/data"),
    path.resolve(process.cwd(), "medical_ML/data"),
  ];
  const dataDir = candidates.find((dir) => fs.existsSync(dir));

  if (!dataDir) {
    DATASET_CACHE = {
      loaded: false,
      symptoms: [],
      symptomSet: new Set<string>(),
      diseases: [],
      descriptions: {},
      precautions: {},
    };
    return DATASET_CACHE;
  }

  const cleaned = parseCsv(fs.readFileSync(path.join(dataDir, "dataset_cleaned.csv"), "utf8"));
  const desc = parseCsv(fs.readFileSync(path.join(dataDir, "symptom_description_cleaned.csv"), "utf8"));
  const prec = parseCsv(fs.readFileSync(path.join(dataDir, "symptom_precaution_cleaned.csv"), "utf8"));

  const symptomSet = new Set<string>();
  const diseaseMap = new Map<string, Set<string>>();
  for (let i = 1; i < cleaned.length; i += 1) {
    const row = cleaned[i];
    const disease = row[0]?.trim();
    if (!disease) continue;
    if (!diseaseMap.has(disease)) diseaseMap.set(disease, new Set<string>());
    const entry = diseaseMap.get(disease)!;
    for (let j = 1; j < row.length; j += 1) {
      const sym = normalizeToken(row[j] || "");
      if (!sym) continue;
      entry.add(sym);
      symptomSet.add(sym);
    }
  }

  const descriptions: Record<string, string> = {};
  for (let i = 1; i < desc.length; i += 1) {
    const disease = desc[i][0]?.trim();
    if (!disease) continue;
    descriptions[disease] = desc[i][1] || "";
  }

  const precautions: Record<string, string[]> = {};
  for (let i = 1; i < prec.length; i += 1) {
    const disease = prec[i][0]?.trim();
    if (!disease) continue;
    precautions[disease] = prec[i].slice(1).map((v) => v?.trim()).filter(Boolean) as string[];
  }

  DATASET_CACHE = {
    loaded: true,
    symptoms: Array.from(symptomSet),
    symptomSet,
    diseases: Array.from(diseaseMap.entries()).map(([name, s]) => ({ name, symptoms: Array.from(s) })),
    descriptions,
    precautions,
  };
  return DATASET_CACHE;
}

function extractTemperatureF(text: string): number | undefined {
  const m = normalizeToken(text).match(/(\d{2,3}(?:\.\d)?)\s*(f|fahrenheit|c|celsius|degree)?/i);
  if (!m) return undefined;
  const value = Number(m[1]);
  if (Number.isNaN(value)) return undefined;
  const unit = (m[2] || "").toLowerCase();
  if (unit.startsWith("c")) return Number(((value * 9) / 5 + 32).toFixed(1));
  if (value >= 92 && value <= 110) return value;
  return undefined;
}

function extractDurationDays(text: string): number | undefined {
  const t = normalizeToken(text);
  const d = t.match(/(\d+)\s*(day|days)/);
  if (d) return Number(d[1]);
  const w = t.match(/(\d+)\s*(week|weeks)/);
  if (w) return Number(w[1]) * 7;
  const m = t.match(/(\d+)\s*(month|months)/);
  if (m) return Number(m[1]) * 30;
  if (/\btoday\b|\b1 day\b/.test(t)) return 1;
  if (/\byesterday\b/.test(t)) return 2;
  return undefined;
}

function aliasSymptoms(text: string, symptomSet: Set<string>): string[] {
  const t = normalizeToken(text);
  const out = new Set<string>();
  const pushIf = (candidate: string) => {
    if (symptomSet.has(candidate)) out.add(candidate);
  };

  if (/\bfever\b|\btemperature\b|\bhigh temp\b/.test(t)) pushIf("high fever");
  if (/\bcough\b/.test(t)) pushIf("cough");
  if (/\bchill|\bshiver/.test(t)) {
    pushIf("chills");
    pushIf("shivering");
  }
  if (/\bbody ache|\bbody pain|\bmuscle ache|\bmuscle pain/.test(t)) pushIf("muscle pain");
  if (/\bheadache\b/.test(t)) pushIf("headache");
  if (/\bsore throat\b/.test(t)) pushIf("throat irritation");
  if (/\bnausea\b/.test(t)) pushIf("nausea");
  if (/\bvomit|\bvomiting\b/.test(t)) pushIf("vomiting");
  if (/\bfatigue|\btired|\bweak/.test(t)) pushIf("fatigue");
  if (/\brunny nose|\bblocked nose|\bcongestion/.test(t)) pushIf("runny nose");

  return Array.from(out);
}

function extractSymptoms(text: string, datasets: DatasetCache): string[] {
  const normalized = ` ${normalizeToken(text)} `;
  const found = new Set<string>();

  for (const symptom of datasets.symptoms) {
    if (normalized.includes(` ${symptom} `)) found.add(symptom);
  }
  for (const s of aliasSymptoms(text, datasets.symptomSet)) found.add(s);

  const temp = extractTemperatureF(text);
  if (temp && temp >= 99.5 && datasets.symptomSet.has("high fever")) found.add("high fever");

  return Array.from(found);
}

function scoreDiseases(diseases: DiseaseRow[], confirmed: Set<string>, denied: Set<string>): Prediction[] {
  const scored: Array<{ disease: string; score: number; matched: number; total: number }> = [];
  for (const d of diseases) {
    let matched = 0;
    let deniedHits = 0;
    const total = d.symptoms.length || 1;
    for (const s of d.symptoms) {
      if (confirmed.has(s)) matched += 1;
      if (denied.has(s)) deniedHits += 1;
    }
    const score = matched / total - deniedHits * 0.18 + (matched > 0 ? 0.03 : 0);
    if (score > 0) scored.push({ disease: d.name, score, matched, total });
  }
  if (scored.length === 0) return [];
  const sum = scored.reduce((a, b) => a + b.score, 0);
  return scored
    .map((x) => ({
      disease: x.disease,
      probability: Number(((x.score / sum) * 100).toFixed(1)),
      matched: x.matched,
      total: x.total,
    }))
    .sort((a, b) => b.probability - a.probability);
}

function chooseSymptomQuestion(
  datasets: DatasetCache,
  topCandidates: string[],
  asked: Set<string>,
  confirmed: Set<string>,
  denied: Set<string>
): string | null {
  const candidateSet = new Set(topCandidates);
  const diseaseRows = datasets.diseases.filter((d) => candidateSet.has(d.name));
  if (diseaseRows.length === 0) return null;

  const counts = new Map<string, number>();
  for (const d of diseaseRows) {
    for (const s of d.symptoms) {
      if (asked.has(s) || confirmed.has(s) || denied.has(s)) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
  }

  let best: { symptom: string; score: number } | null = null;
  for (const [symptom, freq] of counts.entries()) {
    const p = freq / diseaseRows.length;
    const splitScore = 1 - Math.abs(0.5 - p);
    const score = splitScore * 100 + freq;
    if (!best || score > best.score) best = { symptom, score };
  }
  return best?.symptom ?? null;
}

function formatSymptom(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseState(messages: Array<{ role: string; jsonPayload: string | null }>): FollowupState | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item.role !== "assistant" || !item.jsonPayload) continue;
    try {
      const p = JSON.parse(item.jsonPayload) as Partial<FollowupState>;
      if (p.kind === "followup_state" && p.pending && p.currentQuestionId && p.currentQuestionText) {
        return {
          kind: "followup_state",
          pending: true,
          turns: p.turns || 0,
          maxTurns: p.maxTurns || 6,
          confirmedSymptoms: p.confirmedSymptoms || [],
          deniedSymptoms: p.deniedSymptoms || [],
          askedSymptoms: p.askedSymptoms || [],
          topCandidates: p.topCandidates || [],
          currentQuestionId: p.currentQuestionId,
          currentQuestionText: p.currentQuestionText,
          slots: p.slots || {},
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function makeState(state: Omit<FollowupState, "kind" | "pending">): FollowupState {
  return { kind: "followup_state", pending: true, ...state };
}

function nextQuestion(
  datasets: DatasetCache,
  confirmed: Set<string>,
  denied: Set<string>,
  asked: Set<string>,
  topCandidates: string[],
  slots: FollowupState["slots"]
): { id: string; text: string } | null {
  if ((confirmed.has("high fever") || asked.has("high fever")) && !slots.temperatureF) {
    return { id: "temperature", text: "What is your current temperature (in F or C)?" };
  }
  if (!slots.durationDays) {
    return { id: "duration", text: "How long have you had these symptoms?" };
  }
  const symptom = chooseSymptomQuestion(datasets, topCandidates, asked, confirmed, denied);
  if (!symptom) return null;
  return { id: `symptom:${symptom}`, text: `Do you also have ${symptom}?` };
}

function yesNoFromText(text: string): "yes" | "no" | null {
  const t = normalizeToken(text);
  if (/\b(yes|yeah|yep|present|have|i do)\b/.test(t)) return "yes";
  if (/\b(no|not|none|dont|don't|never)\b/.test(t)) return "no";
  return null;
}

async function openAIFallbackDiagnosis(history: string[], message: string, symptoms: string[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Return strict JSON only with keys diagnosis, confidence, top_predictions (array of up to 5 {disease, probability}), summary, precautions (string array).",
          },
          {
            role: "user",
            content: `History:\n${history.slice(-15).join("\n")}\n\nCurrent message: ${message}\nSymptoms: ${symptoms.join(", ")}`,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content || "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      diagnosis?: string;
      confidence?: number;
      summary?: string;
      precautions?: string[];
      top_predictions?: Array<{ disease: string; probability: number }>;
    };
    if (!parsed.diagnosis) return null;
    const top = (parsed.top_predictions || [])
      .slice(0, 5)
      .map((p) => ({ disease: p.disease, probability: Number(p.probability) || 0 }));
    return {
      diagnosis: parsed.diagnosis,
      confidence: Number(parsed.confidence) || 35,
      summary: parsed.summary || "",
      precautions: parsed.precautions || [],
      top_predictions: top.length > 0 ? top : [{ disease: parsed.diagnosis, probability: Number(parsed.confidence) || 35 }],
    };
  } catch {
    return null;
  }
}

function replyForQuestion(questionText: string, confirmed: Set<string>, turns: number): string {
  const symptoms = Array.from(confirmed).map(formatSymptom).join(", ");
  return `Symptoms identified so far: **${symptoms || "None yet"}**.\n\n**Question ${turns + 1}:** ${questionText}\n\nUse **Yes**, **No**, or **Write own**.`;
}

export async function POST(req: NextRequest) {
  try {
    const session = (await getServerSession(authOptions as never)) as { user?: { id?: string } } | null;
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sessionId = req.headers.get("x-session-id");
    if (!sessionId) return NextResponse.json({ error: "Missing x-session-id header" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as {
      message?: string;
      session_action?: "yes" | "no" | "custom" | null;
    };
    const userMessage = (body.message || "").trim();
    if (!userMessage) return NextResponse.json({ error: "message is required" }, { status: 400 });
    const action = body.session_action || null;

    const chatSession = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!chatSession || chatSession.userId !== userId) {
      return NextResponse.json({ error: "Session not found or access denied" }, { status: 404 });
    }

    const currentMessages = await prisma.message.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, jsonPayload: true },
    });

    const historicalUserMessages = await prisma.message.findMany({
      where: { role: "user", chatSession: { userId } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { content: true },
    });
    const priorText = historicalUserMessages.map((m) => m.content);

    const datasets = loadDatasets();
    if (!datasets.loaded) {
      return NextResponse.json({
        reply:
          "Dataset is unavailable right now. Please share your symptoms, duration, and temperature so I can continue with API-assisted guidance.",
        follow_up_suggested: false,
        resource_note: "dataset_unavailable",
      });
    }

    const parsedState = parseState(currentMessages);
    const confirmed = new Set<string>(parsedState?.confirmedSymptoms || []);
    const denied = new Set<string>(parsedState?.deniedSymptoms || []);
    const asked = new Set<string>(parsedState?.askedSymptoms || []);
    const slots: FollowupState["slots"] = { ...(parsedState?.slots || {}) };
    let turns = parsedState?.turns || 0;
    const maxTurns = parsedState?.maxTurns || 6;

    const extracted = extractSymptoms(userMessage, datasets);
    for (const s of extracted) confirmed.add(s);

    const temp = extractTemperatureF(userMessage);
    if (temp) slots.temperatureF = temp;
    const duration = extractDurationDays(userMessage);
    if (duration) slots.durationDays = duration;

    if (parsedState && action && parsedState.currentQuestionId) {
      const qid = parsedState.currentQuestionId;
      const answer = action === "custom" ? yesNoFromText(userMessage) : action;

      if (qid === "temperature") {
        if (temp) slots.temperatureF = temp;
        if (answer === "yes") confirmed.add("high fever");
        if (answer === "no") denied.add("high fever");
      } else if (qid === "duration") {
        if (duration) slots.durationDays = duration;
      } else if (qid.startsWith("symptom:")) {
        const symptom = qid.slice("symptom:".length);
        asked.add(symptom);
        if (answer === "yes") confirmed.add(symptom);
        if (answer === "no") denied.add(symptom);
      }
      turns += 1;
    } else if (!parsedState) {
      const historyCounts = new Map<string, number>();
      for (const text of priorText) {
        for (const s of extractSymptoms(text, datasets)) {
          historyCounts.set(s, (historyCounts.get(s) || 0) + 1);
        }
      }
      for (const [sym, count] of historyCounts.entries()) {
        if (count >= 2) confirmed.add(sym);
      }
    }

    const predictions = scoreDiseases(datasets.diseases, confirmed, denied);
    const top = predictions[0];
    const topCandidates = predictions.slice(0, 5).map((p) => p.disease);

    const question = nextQuestion(datasets, confirmed, denied, asked, topCandidates, slots);
    const goodConfidence = Boolean(top && top.probability >= 67);
    const enoughTurns = turns >= 2;

    if (question && turns < maxTurns && !(goodConfidence && enoughTurns)) {
      const nextState = makeState({
        turns,
        maxTurns,
        confirmedSymptoms: Array.from(confirmed),
        deniedSymptoms: Array.from(denied),
        askedSymptoms: Array.from(asked),
        topCandidates,
        currentQuestionId: question.id,
        currentQuestionText: question.text,
        slots,
      });

      return NextResponse.json({
        reply: replyForQuestion(question.text, confirmed, turns),
        follow_up_suggested: true,
        follow_up_question: question.text,
        follow_up_state: nextState,
      });
    }

    if (!top || top.probability < 25) {
      const ai = await openAIFallbackDiagnosis(priorText, userMessage, Array.from(confirmed));
      if (ai) {
        const reply = `**Likely condition (API-assisted): ${ai.diagnosis}**\nConfidence: ${Number(
          ai.confidence
        ).toFixed(1)}%\n\n${ai.summary || "Dataset confidence was low, so this result used API-assisted analysis."}\n\n${
          ai.precautions.length > 0 ? `**Precautions:**\n${ai.precautions.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\n` : ""
        }This is informational only and not a medical diagnosis.`;

        return NextResponse.json({
          reply,
          follow_up_suggested: false,
          ml_diagnosis: {
            diagnosis: ai.diagnosis,
            confidence: Number(ai.confidence.toFixed(1)),
            diagnosis_type: "api_fallback",
            top_predictions: ai.top_predictions.map((p) => ({
              disease: p.disease,
              probability: Number(p.probability.toFixed(1)),
            })),
            confirmed_symptoms: Array.from(confirmed),
            followups_asked: turns,
            disease_info: { description: ai.summary || "", precautions: ai.precautions || [] },
            source: "api_fallback",
            considered_prior_history: true,
          },
        });
      }

      return NextResponse.json({
        reply:
          "I could not reach a confident dataset prediction. Please consult a clinician, especially if symptoms are worsening or persistent.",
        follow_up_suggested: false,
      });
    }

    const diseaseInfo = {
      description: datasets.descriptions[top.disease] || "",
      precautions: datasets.precautions[top.disease] || [],
    };

    const diagnosis = {
      diagnosis: top.disease,
      confidence: Number(top.probability.toFixed(1)),
      diagnosis_type: top.probability >= 67 ? "confident" : "best_guess",
      top_predictions: predictions.slice(0, 5).map((p) => ({
        disease: p.disease,
        probability: Number(p.probability.toFixed(1)),
      })),
      confirmed_symptoms: Array.from(confirmed),
      followups_asked: turns,
      disease_info: diseaseInfo,
      source: "dataset_plus_history",
      considered_prior_history: true,
    };

    const precautionsText =
      diseaseInfo.precautions.length > 0
        ? `\n\n**Precautions:**\n${diseaseInfo.precautions.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
        : "";

    const reply = `**Likely condition: ${diagnosis.diagnosis}**\nConfidence: ${
      diagnosis.confidence
    }%\n\nSymptoms considered: ${diagnosis.confirmed_symptoms.map(formatSymptom).join(", ")}\n\n${
      diseaseInfo.description || "No detailed description available in dataset."
    }${precautionsText}\n\nThis is informational only and not a medical diagnosis.`;

    return NextResponse.json({
      reply,
      follow_up_suggested: false,
      ml_diagnosis: diagnosis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
