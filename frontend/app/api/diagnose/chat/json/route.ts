import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prismaUser as prisma } from "@/lib/prisma/client";

type FollowupState = {
  kind: "followup_state";
  pending: boolean;
  askedSymptom: string;
  askedSymptoms: string[];
  confirmedSymptoms: string[];
  deniedSymptoms: string[];
  turns: number;
  topCandidates: string[];
};

type DiseaseRow = {
  name: string;
  symptoms: string[];
};

type DatasetCache = {
  loaded: boolean;
  symptoms: string[];
  diseases: DiseaseRow[];
  descriptions: Record<string, string>;
  precautions: Record<string, string[]>;
};

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
    const target = diseaseMap.get(disease)!;
    for (let c = 1; c < row.length; c += 1) {
      const symptom = normalizeToken(row[c] || "");
      if (!symptom) continue;
      target.add(symptom);
      symptomSet.add(symptom);
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
    diseases: Array.from(diseaseMap.entries()).map(([name, symptoms]) => ({
      name,
      symptoms: Array.from(symptoms),
    })),
    descriptions,
    precautions,
  };

  return DATASET_CACHE;
}

function extractSymptomsFromText(text: string, symptoms: string[]): string[] {
  const normalized = ` ${normalizeToken(text)} `;
  const found = new Set<string>();
  for (const symptom of symptoms) {
    if (normalized.includes(` ${symptom} `)) found.add(symptom);
  }
  return Array.from(found);
}

function scoreDiseases(
  diseases: DiseaseRow[],
  confirmed: Set<string>,
  denied: Set<string>
): { disease: string; probability: number; matched: number; total: number }[] {
  const scored: { disease: string; score: number; matched: number; total: number }[] = [];
  for (const disease of diseases) {
    const total = disease.symptoms.length || 1;
    let matched = 0;
    let deniedHits = 0;
    for (const symptom of disease.symptoms) {
      if (confirmed.has(symptom)) matched += 1;
      if (denied.has(symptom)) deniedHits += 1;
    }
    const raw = matched / total - deniedHits * 0.2 + (matched > 0 ? 0.02 : 0);
    if (raw > 0) scored.push({ disease: disease.name, score: raw, matched, total });
  }

  if (scored.length === 0) return [];
  const sum = scored.reduce((acc, s) => acc + s.score, 0);
  return scored
    .map((s) => ({
      disease: s.disease,
      probability: Math.max(0, (s.score / sum) * 100),
      matched: s.matched,
      total: s.total,
    }))
    .sort((a, b) => b.probability - a.probability);
}

function chooseFollowupSymptom(
  diseases: DiseaseRow[],
  topCandidates: string[],
  asked: Set<string>,
  confirmed: Set<string>,
  denied: Set<string>
): string | null {
  const candidateSet = new Set(topCandidates);
  const topDiseaseRows = diseases.filter((d) => candidateSet.has(d.name));
  if (topDiseaseRows.length === 0) return null;

  const count = new Map<string, number>();
  for (const d of topDiseaseRows) {
    for (const s of d.symptoms) {
      if (asked.has(s) || confirmed.has(s) || denied.has(s)) continue;
      count.set(s, (count.get(s) || 0) + 1);
    }
  }

  let best: { symptom: string; score: number } | null = null;
  for (const [symptom, freq] of count.entries()) {
    const p = freq / topDiseaseRows.length;
    const entropyLike = 1 - Math.abs(0.5 - p);
    const score = entropyLike * 100 + freq;
    if (!best || score > best.score) best = { symptom, score };
  }
  return best?.symptom ?? null;
}

async function openAIFallbackReply(history: string[], message: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const promptHistory = history.slice(-10).join("\n");
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
              "You are a careful medical triage assistant. Ask concise follow-up questions, do not claim certainty, and include a safety disclaimer.",
          },
          {
            role: "user",
            content: `Prior medical chat context:\n${promptHistory}\n\nCurrent user message:\n${message}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

function formatSymptomList(symptoms: string[]): string {
  return symptoms.map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase())).join(", ");
}

function parseFollowupState(messages: Array<{ role: string; jsonPayload: string | null }>): FollowupState | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.jsonPayload) continue;
    try {
      const parsed = JSON.parse(m.jsonPayload) as Partial<FollowupState>;
      if (parsed.kind === "followup_state" && parsed.pending) {
        return {
          kind: "followup_state",
          pending: true,
          askedSymptom: parsed.askedSymptom || "",
          askedSymptoms: parsed.askedSymptoms || [],
          confirmedSymptoms: parsed.confirmedSymptoms || [],
          deniedSymptoms: parsed.deniedSymptoms || [],
          turns: parsed.turns || 1,
          topCandidates: parsed.topCandidates || [],
        };
      }
    } catch {
      continue;
    }
  }
  return null;
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
    const sessionAction = body.session_action || null;
    if (!userMessage) return NextResponse.json({ error: "message is required" }, { status: 400 });

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
      take: 160,
      select: { content: true },
    });

    const datasets = loadDatasets();
    const priorText = historicalUserMessages.map((m) => m.content);

    if (!datasets.loaded) {
      const fallback = await openAIFallbackReply(priorText, userMessage);
      const reply =
        fallback ||
        "Based on available resources, I couldn't access the symptom dataset right now. Please describe key symptoms (duration, severity, triggers) and I will continue.";
      return NextResponse.json({
        reply,
        follow_up_suggested: false,
        resource_note: "dataset_unavailable_fallback",
      });
    }

    const pendingState = parseFollowupState(currentMessages);
    let confirmed = new Set<string>(pendingState?.confirmedSymptoms || []);
    let denied = new Set<string>(pendingState?.deniedSymptoms || []);
    let asked = new Set<string>(pendingState?.askedSymptoms || []);
    let turns = pendingState?.turns || 0;

    const extractedCurrent = extractSymptomsFromText(userMessage, datasets.symptoms);

    if (pendingState && sessionAction) {
      asked.add(pendingState.askedSymptom);
      if (sessionAction === "yes") confirmed.add(pendingState.askedSymptom);
      if (sessionAction === "no") denied.add(pendingState.askedSymptom);
      if (sessionAction === "custom") {
        for (const s of extractedCurrent) confirmed.add(s);
        if (/\b(yes|yeah|yep|present|have)\b/i.test(userMessage)) confirmed.add(pendingState.askedSymptom);
        if (/\b(no|not|dont|don't|none)\b/i.test(userMessage)) denied.add(pendingState.askedSymptom);
      }
      turns += 1;
    } else {
      for (const s of extractedCurrent) confirmed.add(s);

      const counts = new Map<string, number>();
      for (const text of priorText) {
        for (const s of extractSymptomsFromText(text, datasets.symptoms)) {
          counts.set(s, (counts.get(s) || 0) + 1);
        }
      }
      for (const [symptom, count] of counts.entries()) {
        if (count >= 2) confirmed.add(symptom);
      }
    }

    if (confirmed.size === 0) {
      const fallback = await openAIFallbackReply(priorText, userMessage);
      const reply =
        fallback ||
        "I couldn't identify clear symptoms yet. Please share what you feel, where it occurs, since when, and what makes it better or worse.";
      return NextResponse.json({
        reply,
        follow_up_suggested: false,
        resource_note: "no_dataset_match_fallback",
      });
    }

    const predictions = scoreDiseases(datasets.diseases, confirmed, denied);
    const top = predictions[0];
    const topCandidates = predictions.slice(0, 5).map((p) => p.disease);
    const nextSymptom = chooseFollowupSymptom(datasets.diseases, topCandidates, asked, confirmed, denied);

    const shouldAskFollowup =
      Boolean(nextSymptom) && (sessionAction !== null ? turns < 5 : true) && (top ? top.probability < 68 : true);

    if (shouldAskFollowup && nextSymptom) {
      const state: FollowupState = {
        kind: "followup_state",
        pending: true,
        askedSymptom: nextSymptom,
        askedSymptoms: Array.from(asked),
        confirmedSymptoms: Array.from(confirmed),
        deniedSymptoms: Array.from(denied),
        turns: Math.max(1, turns),
        topCandidates,
      };

      const reply = `I identified these symptoms so far: **${formatSymptomList(
        Array.from(confirmed)
      )}**.\n\nTo improve prediction confidence, are you also experiencing **${nextSymptom}**?\nYou can answer **Yes**, **No**, or write your own details.`;

      return NextResponse.json({
        reply,
        follow_up_suggested: true,
        follow_up_question: nextSymptom,
        follow_up_state: state,
      });
    }

    if (!top || top.probability < 22) {
      const fallback = await openAIFallbackReply(priorText, userMessage);
      const reply =
        (fallback
          ? `${fallback}\n\nBased on available resources, dataset confidence is low, so this uses API-assisted guidance.`
          : "Based on available resources, I could not produce a confident dataset prediction. Please consult a clinician for proper diagnosis.") +
        "\n\nThis is informational only and not a medical diagnosis.";

      return NextResponse.json({
        reply,
        follow_up_suggested: false,
        resource_note: "low_confidence_api_fallback",
      });
    }

    const diseaseInfo = {
      description: datasets.descriptions[top.disease] || "",
      precautions: datasets.precautions[top.disease] || [],
    };

    const diagnosis = {
      diagnosis: top.disease,
      confidence: Number(top.probability.toFixed(1)),
      diagnosis_type: top.probability >= 68 ? "confident" : "best_guess",
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

    const reply = `**Likely condition: ${diagnosis.diagnosis}**\nConfidence: ${diagnosis.confidence}%\n\nSymptoms considered: ${formatSymptomList(
      diagnosis.confirmed_symptoms
    )}\n\n${diseaseInfo.description || "No detailed description available in dataset."}${precautionsText}\n\nThis is informational only and not a medical diagnosis.`;

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
