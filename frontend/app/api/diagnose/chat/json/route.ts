import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prismaUser as prisma } from "@/lib/prisma/client";

export const maxDuration = 300;

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
  currentQuestionChoices?: string[];
  imagePrediction?: ImagePredictionResult | null;
  slots: {
    gender?: "male" | "female" | "custom";
    ageGroup?: "infant" | "toddler" | "child" | "adolescent" | "youth" | "adult" | "middle_aged" | "senior_citizen";
    temperatureF?: number;
    durationDays?: number;
    chiefComplaint?: "pain" | "general";
    bodySystem?: "musculoskeletal" | "respiratory" | "gastrointestinal" | "neurologic" | "cardiovascular" | "dermatologic" | "general";
    painLocation?: string;
    painSeverity?: number;
    painSwelling?: boolean;
    painRedness?: boolean;
    painInjury?: boolean;
    painFever?: boolean;
    symptomSeverity?: number;
    progression?: "better" | "same" | "worse";
    redFlagsPresent?: boolean;
    imageAvailable?: boolean;
    imageProvided?: boolean;
    imageObservationShown?: boolean;
  };
};

type ImagePredictionPerDataset = {
  dataset: string;
  top_label_index: number;
  top_label_name: string;
  top_confidence: number;
  scores?: Array<{ label_index: number; label_name: string; confidence: number }>;
};

type ImagePredictionResult = {
  best_dataset: string;
  best_label_index: number;
  best_label_name: string;
  best_confidence: number;
  per_dataset: ImagePredictionPerDataset[];
};

type ImagePredictionFetchResult = {
  prediction: ImagePredictionResult | null;
  debug: Record<string, unknown> | null;
  error: string | null;
  status: number | null;
};

type AIGuidance = {
  home_remedies: string[];
  lifestyle_changes: string[];
  diet_adjustments: string[];
};

const IMAGE_WARMUP_TTL_MS = 10 * 60 * 1000;
let imageWarmupInFlight: Promise<void> | null = null;
let imageWarmupLastAt = 0;

function resolveImageTimeoutMs(): number {
  const raw = (process.env.DIAGNOSE_IMAGE_TIMEOUT_MS || "").trim();
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 10000) return parsed;
  return 60000;
}

function resolveBackendUrl(): string {
  return (process.env.BACKEND_URL || "").trim().replace(/\/+$/, "");
}

function backendLikelyMisconfigured(backendUrl: string): boolean {
  const isVercel = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  const isLocalTarget = /:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(backendUrl);
  return isVercel && isLocalTarget;
}

function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return "Unknown fetch error";
  const maybeCause = (err as Error & { cause?: unknown }).cause as
    | { code?: string; errno?: string; address?: string; port?: number }
    | undefined;
  const causeBits = [
    maybeCause?.code ? `code=${maybeCause.code}` : "",
    maybeCause?.errno ? `errno=${maybeCause.errno}` : "",
    maybeCause?.address ? `address=${maybeCause.address}` : "",
    typeof maybeCause?.port === "number" ? `port=${maybeCause.port}` : "",
  ].filter(Boolean);
  const causeText = causeBits.length > 0 ? ` (${causeBits.join(", ")})` : "";
  return `${err.name}: ${err.message}${causeText}`;
}

function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function resolvePreferredDatasetLimit(): number {
  const raw = (process.env.DIAGNOSE_IMAGE_MAX_DATASETS || "").trim();
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 5) return Math.round(parsed);
  return 2;
}

function inferPreferredImageDatasets(
  message: string,
  slots: FollowupState["slots"],
  confirmedSymptoms: Set<string>
): string[] {
  const t = normalizeToken(message);
  const preferred: string[] = [];
  const push = (v: string) => {
    if (!preferred.includes(v)) preferred.push(v);
  };

  const hasSkinKeywords =
    slots.bodySystem === "dermatologic" ||
    containsAny(t, [/\b(skin|rash|itch|itchy|patch|lesion|blister|red spot|redness)\b/]) ||
    confirmedSymptoms.has("skin rash") ||
    confirmedSymptoms.has("itching");
  if (hasSkinKeywords) push("dermamnist");

  const hasEyeKeywords =
    containsAny(t, [/\b(vision|blurry|blurred|retina|eye|eyes|dark spots?|floaters?|visual)\b/]) ||
    confirmedSymptoms.has("blurred and distorted vision") ||
    confirmedSymptoms.has("visual disturbances");
  if (hasEyeKeywords) push("retinamnist");

  const hasChestKeywords =
    slots.bodySystem === "respiratory" ||
    containsAny(t, [/\b(cough|chest|breath|breathing|phlegm|wheeze)\b/]);
  if (hasChestKeywords) push("chestmnist");

  if (containsAny(t, [/\b(blood|cbc|wbc|rbc|platelet|hemoglobin)\b/])) push("bloodmnist");
  if (containsAny(t, [/\b(pathology|histopathology|biopsy|tissue|slide)\b/])) push("pathmnist");

  if (preferred.length === 0) {
    // Fast + safer default: avoid running all datasets when context is weak.
    if (slots.bodySystem === "respiratory") push("chestmnist");
    else if (slots.bodySystem === "neurologic") push("retinamnist");
    else if (slots.bodySystem === "dermatologic") push("dermamnist");
    else push("dermamnist");
  }

  const limit = resolvePreferredDatasetLimit();
  return preferred.slice(0, limit);
}

function scoreImageDatasetsWithContext(
  imagePrediction: ImagePredictionResult,
  message: string,
  slots: FollowupState["slots"],
  confirmedSymptoms: Set<string>
): Array<ImagePredictionPerDataset & { context_weight: number; context_score: number }> {
  const preferred = new Set(inferPreferredImageDatasets(message, slots, confirmedSymptoms));
  const hasEvidenceForBloodOrPath = Array.from(preferred).some((d) => d === "bloodmnist" || d === "pathmnist");
  return imagePrediction.per_dataset.map((p) => {
    let contextWeight = 0.55;
    if (preferred.has(p.dataset)) contextWeight = 1;
    if ((p.dataset === "bloodmnist" || p.dataset === "pathmnist") && !hasEvidenceForBloodOrPath) {
      contextWeight = 0.4;
    }
    return {
      ...p,
      context_weight: contextWeight,
      context_score: Number((p.top_confidence * contextWeight).toFixed(2)),
    };
  });
}

function pickPrimaryImageSignal(
  imagePrediction: ImagePredictionResult,
  message: string,
  slots: FollowupState["slots"],
  confirmedSymptoms: Set<string>
): {
  primary: ImagePredictionPerDataset & { context_weight: number; context_score: number };
  scored: Array<ImagePredictionPerDataset & { context_weight: number; context_score: number }>;
} {
  const scored = scoreImageDatasetsWithContext(imagePrediction, message, slots, confirmedSymptoms);
  const fallback = imagePrediction.per_dataset[0];
  const primary =
    [...scored].sort((a, b) => b.context_score - a.context_score)[0] ||
    ({
      ...fallback,
      context_weight: 1,
      context_score: Number(fallback.top_confidence || 0),
    } as ImagePredictionPerDataset & { context_weight: number; context_score: number });
  return { primary, scored };
}

function topTwoLabelMargin(prediction: ImagePredictionPerDataset): number {
  const scores = Array.isArray(prediction.scores) ? prediction.scores : [];
  if (scores.length < 2) return Number(prediction.top_confidence || 0);
  return Number((scores[0].confidence - scores[1].confidence).toFixed(2));
}

function chooseReliableImagePrediction(
  imagePrediction: ImagePredictionResult,
  message: string,
  slots: FollowupState["slots"],
  confirmedSymptoms: Set<string>
): {
  prediction: ImagePredictionResult | null;
  reason: string | null;
} {
  const signal = pickPrimaryImageSignal(imagePrediction, message, slots, confirmedSymptoms);
  const sorted = [...signal.scored].sort((a, b) => b.context_score - a.context_score);
  const primary = signal.primary;
  const secondary = sorted[1] || null;
  const crossDatasetGap = Number(
    ((primary.context_score || 0) - (secondary?.context_score || 0)).toFixed(2)
  );
  const intraDatasetMargin = topTwoLabelMargin(primary);
  
  // ✅ RELAXED THRESHOLDS: Accept images with moderate confidence
  // Goal: Always use image analysis when available for stronger multimodal predictions
  // Lower thresholds allow moderate-confidence images (30%+) to contribute
  const minTopConfidence = primary.dataset === "chestmnist" ? 30 : 32;  // Was 60/62
  const minIntraMargin = 3;  // Was 6
  const minCrossGap = 0.5;   // Was 3
  const minContextWeight = 0.1;  // Was 0.55
  
  const reliable =
    Number(primary.top_confidence || 0) >= minTopConfidence &&
    intraDatasetMargin >= minIntraMargin &&
    crossDatasetGap >= minCrossGap &&
    Number(primary.context_weight || 0) >= minContextWeight;

  // ✅ ALWAYS RETURN IMAGE DATA (never null)
  // Even moderate-confidence images improve diagnosis when blended with text analysis
  return {
    prediction: {
      ...imagePrediction,
      best_dataset: primary.dataset,
      best_label_index: primary.top_label_index,
      best_label_name: primary.top_label_name,
      best_confidence: primary.top_confidence,
    },
    reason: reliable ? null : `Moderate image signal (${primary.dataset}: ${Number(primary.top_confidence || 0).toFixed(1)}%). Still contributes to diagnosis.`,
  };
}

function imageSpecificQuestion(prediction: ImagePredictionResult): string {
  const dataset = prediction.best_dataset;
  if (dataset === "dermamnist") {
    return "Is the affected skin area also itchy, painful, or spreading?";
  }
  if (dataset === "retinamnist") {
    return "Are you also having blurred vision, eye pain, or visual distortion?";
  }
  if (dataset === "chestmnist") {
    return "Do you also have cough, fever, chest discomfort, or breathing difficulty?";
  }
  if (dataset === "bloodmnist") {
    return "Do you also have fever, weakness, unusual bleeding, or frequent infections?";
  }
  return "Do you also have pain, swelling, fever, or worsening symptoms in this area?";
}

function addImageGuidedSymptoms(
  prediction: ImagePredictionResult,
  confirmed: Set<string>,
  denied: Set<string>,
  answer: "yes" | "no" | null
): void {
  const dataset = prediction.best_dataset;
  if (answer === "yes") {
    if (dataset === "dermamnist") {
      confirmed.add("skin rash");
      confirmed.add("itching");
    } else if (dataset === "retinamnist") {
      confirmed.add("blurred and distorted vision");
      confirmed.add("redness of eyes");
    } else if (dataset === "chestmnist") {
      confirmed.add("cough");
      confirmed.add("breathlessness");
      confirmed.add("high fever");
    } else if (dataset === "bloodmnist") {
      confirmed.add("fatigue");
      confirmed.add("high fever");
    }
  } else if (answer === "no") {
    if (dataset === "dermamnist") {
      denied.add("itching");
    } else if (dataset === "retinamnist") {
      denied.add("blurred and distorted vision");
    } else if (dataset === "chestmnist") {
      denied.add("cough");
      denied.add("breathlessness");
    } else if (dataset === "bloodmnist") {
      denied.add("fatigue");
    }
  }
}

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
  if (/\b(a|one)\s+day\b/.test(t)) return 1;
  if (/\b(a|one)\s+week\b/.test(t)) return 7;
  if (/\b(a|one)\s+month\b/.test(t)) return 30;
  if (/\bcouple of days\b/.test(t)) return 2;
  if (/\bfew days\b/.test(t)) return 3;
  if (/\bseveral days\b/.test(t)) return 5;
  if (/\btoday\b|\b1 day\b/.test(t)) return 1;
  if (/\byesterday\b/.test(t)) return 2;
  return undefined;
}

function extractPainSeverity(text: string): number | undefined {
  const t = normalizeToken(text);
  const direct = t.match(/\b(10|[0-9])\s*(?:\/\s*10)?\b/);
  if (direct) {
    const n = Number(direct[1]);
    if (!Number.isNaN(n) && n >= 0 && n <= 10) return n;
  }
  const verbal: Record<string, number> = {
    mild: 3,
    moderate: 5,
    severe: 8,
  };
  for (const [k, v] of Object.entries(verbal)) {
    if (new RegExp(`\\b${k}\\b`).test(t)) return v;
  }
  return undefined;
}

function extractPainLocation(text: string): string | undefined {
  const t = normalizeToken(text);
  if (/\bhead\b/.test(t)) return "head";
  if (/\bface\b/.test(t)) return "face";
  if (/\bchest\b/.test(t)) return "chest";
  if (/\bstomach\b|\babdomen\b|\babdominal\b/.test(t)) return "abdomen";
  if (/\bshoulder\b/.test(t)) return "shoulder";
  if (/\barm\b/.test(t)) return "arm";
  if (/\belbow\b/.test(t)) return "elbow";
  if (/\bwrist\b/.test(t)) return "wrist";
  if (/\bhand\b/.test(t)) return "hand";
  if (/\bleg\b/.test(t)) return "leg";
  if (/\bknee\b/.test(t)) return "knee";
  if (/\bhip\b/.test(t)) return "hip";
  if (/\blower back\b/.test(t)) return "lower back";
  if (/\bback\b/.test(t)) return "back";
  if (/\bneck\b/.test(t)) return "neck";
  if (/\bankle\b/.test(t)) return "ankle";
  if (/\bfoot\b/.test(t)) return "foot";
  if (/\bjoint\b/.test(t)) return "joint";
  return undefined;
}

function extractChiefComplaint(text: string): "pain" | "general" {
  const t = normalizeToken(text);
  if (/\bpain|ache|hurt|hurting|soreness|cramp\b/.test(t)) return "pain";
  return "general";
}

function extractBodySystem(text: string): FollowupState["slots"]["bodySystem"] {
  const t = normalizeToken(text);
  if (/\bleg|knee|joint|hip|back pain|neck pain|swelling joints|painful walking|muscle\b/.test(t)) return "musculoskeletal";
  if (/\bcough|breath|chest tight|phlegm|wheeze|sore throat|runny nose|congestion\b/.test(t)) return "respiratory";
  if (/\bstomach|abdominal|nausea|vomit|diarrhea|constipation|acidity|indigestion|appetite\b/.test(t)) return "gastrointestinal";
  if (/\bheadache|migraine|dizziness|vertigo|numbness|tingling|seizure|vision|blurred|eye|retina|visual\b/.test(t)) return "neurologic";
  if (/\bchest pain|palpitation|heart|blood pressure|bp|fainting\b/.test(t)) return "cardiovascular";
  if (/\brush|itch|skin|lesion|patch|blister|redness on skin\b/.test(t)) return "dermatologic";
  return "general";
}

function extractProgression(text: string): FollowupState["slots"]["progression"] | undefined {
  const t = normalizeToken(text);
  if (/\bworse|worsening|worsened|increasing|getting bad\b/.test(t)) return "worse";
  if (/\bbetter|improving|improved|less\b/.test(t)) return "better";
  if (/\bsame|unchanged|no change\b/.test(t)) return "same";
  return undefined;
}

function extractRedFlags(text: string): boolean | undefined {
  const t = normalizeToken(text);
  if (/\b(chest pain|severe breathlessness|confusion|fainting|blood in sputum|blood in stool|high fever|unable to walk)\b/.test(t)) return true;
  if (/\b(no red flag|none|no severe symptom)\b/.test(t)) return false;
  return undefined;
}

function extractGender(text: string): "male" | "female" | "custom" | undefined {
  const t = normalizeToken(text);
  if (/\b(male|man|boy)\b/.test(t)) return "male";
  if (/\b(female|woman|girl)\b/.test(t)) return "female";
  if (/\b(custom|other|non binary|nonbinary|trans|prefer not to say)\b/.test(t)) return "custom";
  return undefined;
}

function extractAgeGroup(text: string): FollowupState["slots"]["ageGroup"] | undefined {
  const t = normalizeToken(text);
  if (/\b(infant|newborn|baby)\b/.test(t)) return "infant";
  if (/\b(toddler)\b/.test(t)) return "toddler";
  if (/\b(child|kid|kids|children|minor)\b/.test(t)) return "child";
  if (/\b(adolescent)\b/.test(t)) return "adolescent";
  if (/\b(youth|teen|teenager)\b/.test(t)) return "youth";
  if (/\b(middle aged|middle_aged|middle age)\b/.test(t)) return "middle_aged";
  if (/\b(senior citizen|senior|elderly|old age)\b/.test(t)) return "senior_citizen";
  if (/\b(adult|grown)\b/.test(t)) return "adult";

  const numericAge = t.match(/\b(?:age|aged)?\s*(\d{1,3})\b/);
  if (numericAge) {
    const age = Number(numericAge[1]);
    if (!Number.isNaN(age)) {
      if (age <= 1) return "infant";
      if (age <= 4) return "toddler";
      if (age <= 12) return "child";
      if (age <= 15) return "adolescent";
      if (age <= 24) return "youth";
      if (age <= 59) return "adult";
      if (age <= 69) return "middle_aged";
      return "senior_citizen";
    }
  }
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
  if (/\bitch|itchy|itching\b/.test(t)) {
    pushIf("itching");
    pushIf("internal itching");
  }
  if (/\bskin rash|rash|rashes|red patch|skin patch|skin lesion|lesion\b/.test(t)) {
    pushIf("skin rash");
    pushIf("nodal skin eruptions");
  }
  if (/\bred spots?\b/.test(t)) pushIf("red spots over body");
  if (/\boozing|ooze|discharge|crust\b/.test(t)) pushIf("yellow crust ooze");
  if (/\bblurred vision|blurry vision|blurred|blurry|distorted vision\b/.test(t)) {
    pushIf("blurred and distorted vision");
    pushIf("visual disturbances");
  }
  if (/\bdark spots?|floaters?|flashes of light|visual disturbance\b/.test(t)) pushIf("visual disturbances");
  if (/\beye pain|pain behind (the )?eyes?\b/.test(t)) pushIf("pain behind the eyes");
  if (/\bred eyes?|eye redness\b/.test(t)) pushIf("redness of eyes");
  if (/\bleg pain\b|\bpain in (my )?leg\b|\bleg ache\b|\blegs hurt\b/.test(t)) {
    // Conservative mapping: avoid over-injecting symptoms from one vague complaint.
    pushIf("joint pain");
  }
  if (/\bknee pain\b|\bknee ache\b/.test(t)) {
    pushIf("knee pain");
    pushIf("joint pain");
    pushIf("painful walking");
  }
  if (/\bhip pain\b|\bhip joint pain\b/.test(t)) {
    pushIf("hip joint pain");
    pushIf("joint pain");
    pushIf("painful walking");
  }
  if (/\bjoint pain\b|\bjoint ache\b/.test(t)) {
    pushIf("joint pain");
    pushIf("swelling joints");
  }
  if (/\bpainful walking\b|\bpain while walking\b|\bdifficulty walking\b/.test(t)) {
    pushIf("painful walking");
  }
  if (/\bleg swelling\b|\bswollen leg\b|\bswollen legs\b/.test(t)) {
    pushIf("swollen legs");
    pushIf("swelling joints");
  }

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

function hasMedicalIntent(text: string, datasets: DatasetCache): boolean {
  const normalized = normalizeToken(text);
  if (!normalized) return false;
  const padded = ` ${normalized} `;

  // Explicit triage trigger for users who want diagnosis mode.
  if (/^\s*(diagnose|predict|triage)\s*[:\-]/i.test(text)) return true;

  const directSymptoms = extractSymptoms(text, datasets);
  if (directSymptoms.length > 0) return true;

  // Informational health queries should be answered directly, not routed into triage.
  if (/\b(what|which|tell|explain|list)\b/.test(normalized) && /\b(symptom|symptoms|sign|signs)\b/.test(normalized)) {
    return false;
  }

  const medicalKeywords = [
    "symptom",
    "symptoms",
    "disease",
    "diagnose",
    "diagnosis",
    "pain",
    "fever",
    "cough",
    "cold",
    "infection",
    "vomit",
    "nausea",
    "headache",
    "stomach",
    "medicine",
    "medication",
    "doctor",
    "clinic",
    "hospital",
    "rash",
    "allergy",
    "blood pressure",
    "sugar",
    "diabetes",
  ];

  const hasMedicalKeyword = medicalKeywords.some((k) => normalized.includes(k));
  const mentionsDiseaseByName = datasets.diseases.some((d) => {
    const name = normalizeToken(d.name);
    return name.length >= 4 && padded.includes(` ${name} `);
  });
  const firstPerson = /\b(i|im|i am|my|me|mine)\b/.test(normalized);
  const selfReportVerb = /\b(have|having|feel|feeling|suffer|suffering|experiencing|got)\b/.test(normalized);

  if (firstPerson && (hasMedicalKeyword || mentionsDiseaseByName) && selfReportVerb) return true;
  return hasMedicalKeyword && /\b(i|im|i am|my|me|mine|feeling|feel|having|suffering|experienced|experiencing)\b/.test(normalized);
}

function pickDiseaseFromSymptomQuery(text: string, datasets: DatasetCache): DiseaseRow | null {
  const normalized = normalizeToken(text);
  if (!/\b(symptom|symptoms|sign|signs)\b/.test(normalized)) return null;

  const pattern =
    /\b(?:symptom|symptoms|sign|signs)\s+(?:of|for)\s+([a-z0-9\s-]{2,80})$|\b(?:what|which|tell|explain|list)\s+.*\b(?:symptom|symptoms|sign|signs)\s+(?:of|for)\s+([a-z0-9\s-]{2,80})$/i;
  const match = normalizeToken(text).match(pattern);
  const raw = (match?.[1] || match?.[2] || "").trim().replace(/\b(disease|condition|infection|disorder)\b/g, "").trim();
  if (!raw) return null;

  const query = normalizeToken(raw);
  let best: DiseaseRow | null = null;
  let bestScore = 0;

  for (const disease of datasets.diseases) {
    const diseaseName = normalizeToken(disease.name);
    let score = 0;
    if (diseaseName === query) score = 100;
    else if (diseaseName.includes(query)) score = 80;
    else if (query.includes(diseaseName)) score = 70;
    if (score > bestScore) {
      best = disease;
      bestScore = score;
    }
  }

  return best;
}

function informationalDiseaseReply(text: string, datasets: DatasetCache): string | null {
  const disease = pickDiseaseFromSymptomQuery(text, datasets);
  if (!disease) return null;

  const listedSymptoms = disease.symptoms.slice(0, 10).map(formatSymptom);
  const description = datasets.descriptions[disease.name];
  const precautions = (datasets.precautions[disease.name] || []).slice(0, 4);

  const symptomBlock =
    listedSymptoms.length > 0
      ? listedSymptoms.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "Symptoms are not available in the local dataset for this condition.";
  const descriptionBlock = description ? `\n\nAbout ${disease.name}: ${description}` : "";
  const precautionBlock =
    precautions.length > 0 ? `\n\nGeneral precautions:\n${precautions.map((p, i) => `${i + 1}. ${p}`).join("\n")}` : "";

  return `Common symptoms of **${disease.name}**:\n${symptomBlock}${descriptionBlock}${precautionBlock}\n\nThis is educational information, not a diagnosis.`;
}

function friendlyReplyForGeneralChat(text: string): string {
  const t = normalizeToken(text);

  if (/\b(hi|hello|hey)\b/.test(t)) {
    return "Hello. I can chat normally, and whenever you share a medical issue or symptoms, I will start the diagnosis flow.";
  }
  if (/\b(how are you|how r u|what's up|whats up)\b/.test(t)) {
    return "I am here and ready to help. If you want health guidance, share your symptoms and I will begin assessment questions.";
  }
  if (/\b(thank you|thanks)\b/.test(t)) {
    return "You're welcome. Share any symptoms anytime when you want a medical assessment.";
  }
  if (/\b(diet|dietary|nutrition|healthy eating|food habits|eating habits)\b/.test(t)) {
    return [
      "Healthy dietary habits:",
      "1. Build meals around vegetables, fruits, whole grains, and lean proteins.",
      "2. Prefer water over sugary drinks and limit alcohol.",
      "3. Keep processed foods, excess salt, and added sugar low.",
      "4. Use portion control and eat slowly to avoid overeating.",
      "5. Include healthy fats (nuts, seeds, olive oil) in moderate amounts.",
      "6. Maintain regular meal timing and avoid late heavy meals.",
    ].join("\n");
  }

  return "I can continue normal conversation. When you want a health prediction, describe your medical issue or symptoms.";
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

function applyDemographicAdjustments(
  predictions: Prediction[],
  demographics: { gender?: FollowupState["slots"]["gender"]; ageGroup?: FollowupState["slots"]["ageGroup"] }
): Prediction[] {
  if (predictions.length === 0) return predictions;

  const weighted = predictions.map((p) => {
    const disease = p.disease.toLowerCase();
    let factor = 1;

    if (demographics.ageGroup === "senior_citizen" || demographics.ageGroup === "middle_aged") {
      if (/osteoarthritis|arthritis|varicose veins|hypertension|heart attack/.test(disease)) factor *= 1.12;
      if (/chicken pox|acne|impetigo/.test(disease)) factor *= 0.88;
    }
    if (demographics.ageGroup === "infant" || demographics.ageGroup === "toddler" || demographics.ageGroup === "child") {
      if (/chicken pox|common cold|bronchial asthma|allergy|impetigo/.test(disease)) factor *= 1.1;
      if (/osteoarthritis|varicose veins/.test(disease)) factor *= 0.8;
    }
    if (demographics.ageGroup === "adolescent" || demographics.ageGroup === "youth") {
      if (/acne|allergy|migraine/.test(disease)) factor *= 1.08;
      if (/osteoarthritis|varicose veins/.test(disease)) factor *= 0.85;
    }

    if (demographics.gender === "female") {
      if (/urinary tract infection|uti/.test(disease)) factor *= 1.08;
      if (/prostate/.test(disease)) factor *= 0.7;
    } else if (demographics.gender === "male") {
      if (/prostate/.test(disease)) factor *= 1.15;
      if (/urinary tract infection|uti/.test(disease)) factor *= 0.95;
    }

    return {
      ...p,
      probability: Math.max(0.1, p.probability * factor),
    };
  });

  const sum = weighted.reduce((acc, p) => acc + p.probability, 0);
  if (!sum) return predictions;
  return weighted
    .map((p) => ({
      ...p,
      probability: Number(((p.probability / sum) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.probability - a.probability);
}

function applyClinicalContextAdjustments(predictions: Prediction[], slots: FollowupState["slots"]): Prediction[] {
  if (predictions.length === 0) return predictions;

  const weighted = predictions.map((p) => {
    const disease = p.disease.toLowerCase();
    let factor = 1;

    if (slots.bodySystem === "musculoskeletal") {
      if (/osteoarthritis|arthritis|varicose veins/.test(disease)) factor *= 1.12;
      if (/common cold|pneumonia|tuberculosis/.test(disease)) factor *= 0.82;
    }
    if (slots.bodySystem === "respiratory") {
      if (/common cold|pneumonia|tuberculosis|bronchial asthma/.test(disease)) factor *= 1.12;
      if (/osteoarthritis|arthritis|varicose veins/.test(disease)) factor *= 0.86;
    }
    if (slots.bodySystem === "gastrointestinal") {
      if (/gastroenteritis|gerd|peptic ulcer|jaundice|typhoid|hepatitis/.test(disease)) factor *= 1.1;
      if (/osteoarthritis|migraine/.test(disease)) factor *= 0.88;
    }
    if (slots.bodySystem === "neurologic") {
      if (/migraine|cervical spondylosis|paralysis|vertigo/.test(disease)) factor *= 1.1;
    }
    if (slots.bodySystem === "dermatologic") {
      if (/fungal infection|allergy|psoriasis|acne|impetigo|chicken pox/.test(disease)) factor *= 1.1;
    }

    if (slots.painSwelling === true) {
      if (/arthritis|osteoarthritis|varicose veins/.test(disease)) factor *= 1.12;
    }
    if (slots.painFever === true) {
      if (/infection|flu|dengue|malaria/.test(disease)) factor *= 1.1;
    }
    if (slots.painInjury === true) {
      if (/arthritis|osteoarthritis/.test(disease)) factor *= 0.92;
    }
    if (slots.symptomSeverity !== undefined) {
      if (slots.symptomSeverity >= 8 && /common cold|acne/.test(disease)) factor *= 0.9;
      if (slots.symptomSeverity <= 3 && /heart attack|pneumonia|dengue/.test(disease)) factor *= 0.9;
    }
    if (slots.progression === "worse") factor *= 1.05;
    if (slots.progression === "better") factor *= 0.96;
    if (slots.redFlagsPresent === true && /heart attack|pneumonia|tuberculosis|dengue/.test(disease)) factor *= 1.08;

    return { ...p, probability: Math.max(0.1, p.probability * factor) };
  });

  const sum = weighted.reduce((acc, p) => acc + p.probability, 0);
  if (!sum) return predictions;
  return weighted
    .map((p) => ({
      ...p,
      probability: Number(((p.probability / sum) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.probability - a.probability);
}

function evaluatePredictionReliability(
  predictions: Prediction[],
  confirmedCount: number,
  turns: number,
  imagePrediction?: ImagePredictionResult | null
): {
  reliable: boolean;
  topProbability: number;
  probabilityGap: number;
} {
  const top = predictions[0];
  if (!top) {
    const imageStrongOnly = Boolean(imagePrediction && imagePrediction.best_confidence >= 85 && confirmedCount >= 1);
    return { reliable: imageStrongOnly, topProbability: imagePrediction?.best_confidence || 0, probabilityGap: 0 };
  }

  const second = predictions[1];
  const probabilityGap = second ? top.probability - second.probability : top.probability;
  const enoughSymptoms = confirmedCount >= 2;
  const enoughFollowup = turns >= 1;
  const strongConfidence = top.probability >= 55;
  const clearSeparation = probabilityGap >= 8;
  const strongImageSignal = Boolean(imagePrediction && imagePrediction.best_confidence >= 70);

  return {
    reliable: (strongConfidence && clearSeparation && (enoughSymptoms || enoughFollowup)) || (strongImageSignal && enoughSymptoms),
    topProbability: top.probability,
    probabilityGap,
  };
}

function pickFallbackQuestionFromDataset(
  datasets: DatasetCache,
  confirmed: Set<string>,
  denied: Set<string>,
  asked: Set<string>,
  topCandidates: string[]
): { id: string; text: string; choices?: string[] } | null {
  if (!datasets.loaded) return null;

  const candidateSet = new Set(topCandidates.map((name) => normalizeToken(name)));
  const candidateDiseases =
    candidateSet.size === 0
      ? datasets.diseases
      : datasets.diseases.filter((d) => candidateSet.has(normalizeToken(d.name)));

  if (candidateDiseases.length === 0) return null;

  const scores = new Map<string, number>();
  for (let i = 0; i < candidateDiseases.length; i += 1) {
    const disease = candidateDiseases[i];
    const weight = 1 + Math.max(0, candidateDiseases.length - i - 1) * 0.05;
    for (const symptom of disease.symptoms) {
      if (confirmed.has(symptom) || denied.has(symptom)) continue;
      if (asked.has(symptom) || asked.has(`symptom:${symptom}`)) continue;
      scores.set(symptom, (scores.get(symptom) || 0) + weight);
    }
  }

  if (scores.size === 0) return null;

  let bestSymptom = "";
  let bestScore = -1;
  for (const [symptom, score] of scores.entries()) {
    if (score > bestScore || (score === bestScore && symptom < bestSymptom)) {
      bestSymptom = symptom;
      bestScore = score;
    }
  }

  if (!bestSymptom) return null;
  const text = `Have you experienced ${formatSymptom(bestSymptom)}?`;
  if (asked.has(questionTextKey(text))) return null;

  return { id: `symptom:${bestSymptom}`, text, choices: ["yes", "no"] };
}

function formatSymptom(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function questionTextKey(text: string): string {
  return `qtext:${normalizeToken(text).slice(0, 160)}`;
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
          maxTurns: typeof p.maxTurns === "number" && p.maxTurns > 0 ? Math.max(10, p.maxTurns) : 0,
          confirmedSymptoms: p.confirmedSymptoms || [],
          deniedSymptoms: p.deniedSymptoms || [],
          askedSymptoms: p.askedSymptoms || [],
          topCandidates: p.topCandidates || [],
          currentQuestionId: p.currentQuestionId,
          currentQuestionText: p.currentQuestionText,
          currentQuestionChoices: p.currentQuestionChoices || undefined,
          imagePrediction: (p as FollowupState).imagePrediction || null,
          slots: p.slots || {},
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

function parseExistingFinalDiagnosis(messages: Array<{ role: string; jsonPayload: string | null }>): {
  diagnosis: string;
  confidence?: number;
  top_predictions?: Array<{ disease: string; probability: number }>;
  disease_info?: { description?: string; precautions?: string[] };
  guidance?: AIGuidance | null;
  confirmed_symptoms?: string[];
  followups_asked?: number;
  demographics?: { gender?: string | null; age_group?: string | null };
} | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item.role !== "assistant" || !item.jsonPayload) continue;
    try {
      const p = JSON.parse(item.jsonPayload) as {
        kind?: string;
        diagnosis?: string;
        confidence?: number;
        top_predictions?: Array<{ disease: string; probability: number }>;
        disease_info?: { description?: string; precautions?: string[] };
        guidance?: AIGuidance | null;
        confirmed_symptoms?: string[];
        followups_asked?: number;
        demographics?: { gender?: string | null; age_group?: string | null };
      };
      if (p.kind === "followup_state") continue;
      if (p.diagnosis && Array.isArray(p.top_predictions)) {
        return {
          diagnosis: p.diagnosis,
          confidence: p.confidence,
          top_predictions: p.top_predictions,
          disease_info: p.disease_info,
          guidance: p.guidance || null,
          confirmed_symptoms: p.confirmed_symptoms,
          followups_asked: p.followups_asked,
          demographics: p.demographics,
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

function yesNoFromText(text: string): "yes" | "no" | null {
  const t = normalizeToken(text);
  if (/\b(yes|yeah|yep|present|have|i do)\b/.test(t)) return "yes";
  if (/\b(no|not|none|dont|don't|never)\b/.test(t)) return "no";
  return null;
}

function cleanBase64Payload(value?: string | null): string {
  if (!value) return "";
  const payload = value.trim();
  if (!payload) return "";
  if (payload.startsWith("data:") && payload.includes(",")) return payload.split(",", 2)[1].trim();
  return payload;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchImagePrediction(
  imageBase64: string,
  userId: string,
  preferredDatasets: string[] = []
): Promise<ImagePredictionFetchResult> {
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) {
    return {
      prediction: null,
      debug: null,
      error: "BACKEND_URL is not configured.",
      status: 503,
    };
  }
  if (backendLikelyMisconfigured(backendUrl)) {
    return {
      prediction: null,
      debug: null,
      error:
        "Image backend URL is set to localhost in a Vercel deployment. Set BACKEND_URL to your public backend URL.",
      status: 503,
    };
  }
  const sharedSecret = (process.env.SHARED_SECRET || "").trim();
  const timeoutMs = resolveImageTimeoutMs();
  // ✅ INCREASED BUDGET: Models can take 30-60s to load + inference time
  // Budget now 4-5 minutes for comprehensive image analysis on all datasets
  const totalBudgetMs = Math.max(120000, Math.min(300000, timeoutMs + 120000));
  const startedAt = Date.now();

  // Kick off warmup in parallel so cold-start loading overlaps network wait.
  void ensureImageWarmup(userId, preferredDatasets);

  const runRequest = async (requestTimeoutMs: number): Promise<ImagePredictionFetchResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sharedSecret) {
        headers["X-Internal-Secret"] = sharedSecret;
        headers["X-User-Id"] = userId;
      }
      const res = await fetch(`${backendUrl}/api/diagnose/image-predict`, {
        method: "POST",
        headers,
        body: JSON.stringify({ image_base64: imageBase64, preferred_datasets: preferredDatasets }),
        signal: controller.signal,
      });
      const payload = (await res.json().catch(() => ({}))) as {
        image_prediction?: ImagePredictionResult;
        image_debug?: Record<string, unknown>;
        latency_ms?: number;
        detail?: string;
      };
      if (!res.ok) {
        let errorText = payload.detail || `Backend returned HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403) {
          errorText = `${errorText}. Check SHARED_SECRET matches in frontend and backend deployments.`;
        }
        console.error("[diagnose:image] backend error", {
          status: res.status,
          error: errorText,
          debug: payload.image_debug || null,
        });
        return {
          prediction: null,
          debug: payload.image_debug || null,
          error: errorText,
          status: res.status,
        };
      }
      return {
        prediction: payload.image_prediction || null,
        debug: payload.image_debug || null,
        error: payload.image_prediction ? null : "Backend returned no image_prediction payload",
        status: res.status,
      };
    } finally {
      clearTimeout(timer);
    }
  };
  try {
    return await runRequest(timeoutMs);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      await Promise.race([ensureImageWarmup(userId, preferredDatasets, true), sleep(15000)]);
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = totalBudgetMs - elapsedMs;
      if (remainingMs < 20000) {
        return {
          prediction: null,
          debug: null,
          error: `Image inference timed out after ${elapsedMs}ms. Backend is taking too long; please retry with a smaller/clearer image or continue text-only.`,
          status: null,
        };
      }
      const retryTimeoutMs = Math.min(remainingMs, timeoutMs + 60000);
      console.warn("[diagnose:image] first attempt timed out; retrying once", {
        timeoutMs,
        retryTimeoutMs,
        totalBudgetMs,
      });
      try {
        return await runRequest(retryTimeoutMs);
      } catch (retryErr) {
        const timeoutText =
          retryErr instanceof Error && retryErr.name === "AbortError"
            ? `Image inference timed out after ${Date.now() - startedAt}ms.`
            : describeFetchError(retryErr);
        return {
          prediction: null,
          debug: null,
          error: `${timeoutText} Backend may be overloaded or cold. Try again in 20-30 seconds or continue text-only.`,
          status: null,
        };
      }
    }
    let errorText = describeFetchError(err);
    errorText = `${errorText}. Check BACKEND_URL is reachable from Vercel.`;
    console.error("[diagnose:image] fetch failed", {
      error: errorText,
      backendUrl,
      timeoutMs,
      hasSharedSecret: Boolean(sharedSecret),
    });
    return {
      prediction: null,
      debug: null,
      error: errorText,
      status: null,
    };
  }
}

async function ensureImageWarmup(
  userId: string,
  preferredDatasets: string[] = [],
  force = false
): Promise<void> {
  const now = Date.now();
  if (!force && now - imageWarmupLastAt < IMAGE_WARMUP_TTL_MS) return;
  if (imageWarmupInFlight) {
    await imageWarmupInFlight;
    return;
  }
  imageWarmupInFlight = (async () => {
    try {
      await requestImageWarmup(userId, preferredDatasets);
      imageWarmupLastAt = Date.now();
    } finally {
      imageWarmupInFlight = null;
    }
  })();
  await imageWarmupInFlight;
}

async function requestImageWarmup(userId: string, preferredDatasets: string[] = []): Promise<void> {
  const backendUrl = resolveBackendUrl();
  if (!backendUrl) return;
  if (backendLikelyMisconfigured(backendUrl)) return;
  const sharedSecret = (process.env.SHARED_SECRET || "").trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (sharedSecret) {
      headers["X-Internal-Secret"] = sharedSecret;
      headers["X-User-Id"] = userId;
    }
    await fetch(`${backendUrl}/api/diagnose/image-predict/warmup`, {
      method: "POST",
      headers,
      body: JSON.stringify({ preferred_datasets: preferredDatasets }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return;
    }
    console.warn("[diagnose:image] warmup skipped", err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timer);
  }
}

function blendFinalConfidence(textConfidence: number, imageConfidence?: number): number {
  if (typeof imageConfidence !== "number") return Number(textConfidence.toFixed(1));
  const blended = textConfidence * 0.7 + imageConfidence * 0.3;
  return Number(Math.max(0, Math.min(99.9, blended)).toFixed(1));
}

async function openAILiveFollowupQuestion(params: {
  history: string[];
  currentMessage: string;
  confirmedSymptoms: string[];
  deniedSymptoms: string[];
  topCandidates: string[];
  askedItems: string[];
  turns: number;
  maxTurns: number;
  slots: FollowupState["slots"];
}): Promise<{ id: string; text: string; choices?: string[] } | null> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) return null;

  const parseJsonObjectFromText = (raw: string): {
    question_id?: string;
    question_text?: string;
    question_choices?: string[] | null;
  } | null => {
    const direct = raw.trim();
    if (!direct) return null;
    try {
      return JSON.parse(direct) as {
        question_id?: string;
        question_text?: string;
        question_choices?: string[] | null;
      };
    } catch {}

    const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]) as {
          question_id?: string;
          question_text?: string;
          question_choices?: string[] | null;
        };
      } catch {}
    }

    const start = direct.indexOf("{");
    const end = direct.lastIndexOf("}");
    if (start < 0 || end < 0 || end <= start) return null;
    try {
      return JSON.parse(direct.slice(start, end + 1)) as {
        question_id?: string;
        question_text?: string;
        question_choices?: string[] | null;
      };
    } catch {
      return null;
    }
  };

  const configuredModel = (process.env.OPENAI_MODEL || "").trim().replace(/^['"]|['"]$/g, "");
  const models = Array.from(
    new Set(
      [configuredModel, "gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"].filter((m): m is string => Boolean(m))
    )
  );
  let lastError = "unknown_error";

  try {
    for (const model of models) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Return strict JSON only with keys question_id, question_text, question_choices. Ask exactly one concise medically relevant follow-up question to improve diagnosis confidence. Do not repeat already asked questions. question_choices must be null or an array of 2-8 short lowercase options.",
            },
            {
              role: "user",
              content: JSON.stringify({
                turns: params.turns,
                max_turns: params.maxTurns,
                current_message: params.currentMessage,
                recent_history: params.history.slice(-20),
                confirmed_symptoms: params.confirmedSymptoms,
                denied_symptoms: params.deniedSymptoms,
                top_candidates: params.topCandidates,
                demographics: {
                  gender: params.slots.gender || null,
                  age_group: params.slots.ageGroup || null,
                },
                prior_asked_items: params.askedItems,
                constraints: [
                  "Do not ask age group or gender here.",
                  "Ask only one question.",
                  "No diagnosis/treatment advice in the question.",
                  "Prefer yes/no style when clinically useful.",
                ],
              }),
            },
          ],
        }),
      });

      if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 300);
        lastError = `model=${model} status=${res.status} body=${body}`;
        continue;
      }

      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data.choices?.[0]?.message?.content || "";
      const parsed = parseJsonObjectFromText(raw);
      if (!parsed?.question_text?.trim()) {
        lastError = `model=${model} invalid_json_output`;
        continue;
      }

      const text = parsed.question_text.trim();
      const rawId = String(parsed.question_id ?? `ai_followup_${Date.now()}`).toLowerCase();
      const id = `ai:${rawId.replace(/[^a-z0-9:_-]+/g, "_").slice(0, 64)}`;
      const choices = Array.isArray(parsed.question_choices)
        ? parsed.question_choices
            .map((value) => normalizeToken(String(value)))
            .filter(Boolean)
            .slice(0, 8)
        : undefined;

      return { id, text, choices: choices && choices.length > 0 ? choices : undefined };
    }

    console.error("Live follow-up generation failed:", lastError);
    return null;
  } catch (err) {
    console.error("Live follow-up generation crashed:", err instanceof Error ? err.stack || err.message : err);
    return null;
  }
}

async function openAIDecideMaxTurns(params: {
  history: string[];
  currentMessage: string;
  confirmedSymptoms: string[];
  deniedSymptoms: string[];
  topCandidates: string[];
  slots: FollowupState["slots"];
}): Promise<number | null> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) return null;

  const configuredModel = (process.env.OPENAI_MODEL || "").trim().replace(/^['"]|['"]$/g, "");
  const models = Array.from(
    new Set(
      [configuredModel, "gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"].filter((m): m is string => Boolean(m))
    )
  );

  const parseMaxTurns = (raw: string): number | null => {
    const direct = raw.trim();
    if (!direct) return null;
    let parsed: { max_turns?: unknown } | null = null;
    try {
      parsed = JSON.parse(direct) as { max_turns?: unknown };
    } catch {
      const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenced?.[1]) {
        try {
          parsed = JSON.parse(fenced[1]) as { max_turns?: unknown };
        } catch {}
      }
    }
    if (!parsed) return null;
    const n = Number(parsed.max_turns);
    if (!Number.isFinite(n)) return null;
    return Math.max(10, Math.min(20, Math.round(n)));
  };

  for (const model of models) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "Return strict JSON only: {\"max_turns\": number}. Choose required follow-up question count for accurate and efficient triage. Allowed range is 10..20.",
            },
            {
              role: "user",
              content: JSON.stringify({
                current_message: params.currentMessage,
                recent_history: params.history.slice(-20),
                confirmed_symptoms: params.confirmedSymptoms,
                denied_symptoms: params.deniedSymptoms,
                top_candidates: params.topCandidates,
                demographics: {
                  gender: params.slots.gender || null,
                  age_group: params.slots.ageGroup || null,
                },
              }),
            },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content || "";
      const value = parseMaxTurns(content);
      if (value !== null) return value;
    } catch {
      continue;
    }
  }

  return null;
}

async function openAIDiagnosisGuidance(params: {
  diagnosis: string;
  confidence: number;
  confirmedSymptoms: string[];
  demographics: { gender?: string | null; age_group?: string | null };
  precautions: string[];
}): Promise<AIGuidance | null> {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) return null;

  const configuredModel = (process.env.OPENAI_MODEL || "").trim().replace(/^['"]|['"]$/g, "");
  const models = Array.from(
    new Set(
      [configuredModel, "gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"].filter((m): m is string => Boolean(m))
    )
  );

  const parseGuidance = (raw: string): AIGuidance | null => {
    const direct = raw.trim();
    if (!direct) return null;
    let parsed: Partial<AIGuidance> | null = null;
    try {
      parsed = JSON.parse(direct) as Partial<AIGuidance>;
    } catch {
      const fenced = direct.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenced?.[1]) {
        try {
          parsed = JSON.parse(fenced[1]) as Partial<AIGuidance>;
        } catch {}
      }
    }
    if (!parsed) return null;
    const toList = (v: unknown): string[] =>
      Array.isArray(v)
        ? v
            .map((item) => String(item || "").trim())
            .filter(Boolean)
            .slice(0, 6)
        : [];
    const out: AIGuidance = {
      home_remedies: toList(parsed.home_remedies),
      lifestyle_changes: toList(parsed.lifestyle_changes),
      diet_adjustments: toList(parsed.diet_adjustments),
    };
    if (!out.home_remedies.length && !out.lifestyle_changes.length && !out.diet_adjustments.length) return null;
    return out;
  };

  for (const model of models) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Return strict JSON only with keys home_remedies, lifestyle_changes, diet_adjustments. Each value must be an array of 2-5 short safe informational bullets.",
            },
            {
              role: "user",
              content: JSON.stringify({
                diagnosis: params.diagnosis,
                confidence: params.confidence,
                confirmed_symptoms: params.confirmedSymptoms,
                demographics: params.demographics,
                dataset_precautions: params.precautions,
                constraints: [
                  "No prescription dose advice.",
                  "No definitive cure claims.",
                  "Simple practical language.",
                ],
              }),
            },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content || "";
      const parsed = parseGuidance(content);
      if (parsed) return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

function explainQuestionPurpose(questionText: string): string {
  void questionText;
  return "Reason: this answer helps narrow likely causes from your current symptom pattern.";
}

function replyForQuestion(questionText: string, confirmed: Set<string>, turns: number): string {
  const symptoms = Array.from(confirmed).map(formatSymptom).join(", ");
  const reason = explainQuestionPurpose(questionText);
  return `Symptoms identified so far: **${symptoms || "None yet"}**.\n\n**Question ${turns + 1}:** ${questionText}\n${reason}`;
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
      image_base64?: string | null;
      image_filename?: string | null;
      image_mime?: string | null;
    };
    const userMessage = (body.message || "").trim();
    if (!userMessage) return NextResponse.json({ error: "message is required" }, { status: 400 });
    const action = body.session_action || null;
    const imageBase64 = cleanBase64Payload(body.image_base64);
    const hasImagePayload = imageBase64.length > 0;

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
      where: { role: "user", chatSessionId: sessionId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { content: true },
    });
    const priorText = historicalUserMessages.map((m) => m.content);

    const datasets = loadDatasets();
    if (!datasets.loaded) {
      return NextResponse.json({
        reply:
          "Dataset is unavailable right now. Please share your symptoms, duration, and temperature once dataset services are restored.",
        follow_up_suggested: false,
        resource_note: "dataset_unavailable",
      });
    }

    const parsedState = parseState(currentMessages);
    const directInfoReply = !parsedState && !hasMedicalIntent(userMessage, datasets) ? informationalDiseaseReply(userMessage, datasets) : null;
    if (directInfoReply) {
      return NextResponse.json({
        reply: directInfoReply,
        follow_up_suggested: false,
      });
    }

    const existingFinalDiagnosis = parseExistingFinalDiagnosis(currentMessages);
    const shouldStartMedicalFlow = Boolean(parsedState) || hasMedicalIntent(userMessage, datasets);
    if (!shouldStartMedicalFlow) {
      return NextResponse.json({
        reply: friendlyReplyForGeneralChat(userMessage),
        follow_up_suggested: false,
      });
    }

    // Enforce one final prediction per session. Continue only when an active follow-up exists.
    if (!parsedState && existingFinalDiagnosis) {
      return NextResponse.json({
        reply:
          "This chat session already has a final prediction. Please start a new chat for a new medical issue so results stay session-specific.",
        follow_up_suggested: false,
        ml_diagnosis: existingFinalDiagnosis,
      });
    }

    const confirmed = new Set<string>(parsedState?.confirmedSymptoms || []);
    const denied = new Set<string>(parsedState?.deniedSymptoms || []);
    const asked = new Set<string>(parsedState?.askedSymptoms || []);
    const slots: FollowupState["slots"] = { ...(parsedState?.slots || {}) };
    let imagePrediction: ImagePredictionResult | null = parsedState?.imagePrediction || null;
    let imageAnalysisNote: string | null = null;
    let turns = parsedState?.turns || 0;
    let maxTurns = parsedState?.maxTurns && parsedState.maxTurns > 0 ? Math.max(10, parsedState.maxTurns) : 0;

    const extracted = extractSymptoms(userMessage, datasets);
    for (const s of extracted) confirmed.add(s);
    if (!slots.chiefComplaint) {
      slots.chiefComplaint = extractChiefComplaint(userMessage);
    }
    if (!slots.bodySystem || slots.bodySystem === "general") {
      slots.bodySystem = extractBodySystem(userMessage);
    }
    const painLocation = extractPainLocation(userMessage);
    if (painLocation) slots.painLocation = painLocation;
    const painSeverity = extractPainSeverity(userMessage);
    if (typeof painSeverity === "number") {
      slots.painSeverity = painSeverity;
      if (typeof slots.symptomSeverity !== "number") slots.symptomSeverity = painSeverity;
    }
    const progression = extractProgression(userMessage);
    if (progression) slots.progression = progression;
    const redFlags = extractRedFlags(userMessage);
    if (typeof redFlags === "boolean") slots.redFlagsPresent = redFlags;

    const temp = extractTemperatureF(userMessage);
    if (temp) slots.temperatureF = temp;
    const duration = extractDurationDays(userMessage);
    if (duration) slots.durationDays = duration;
    const gender = extractGender(userMessage);
    if (gender && parsedState?.currentQuestionId === "gender") slots.gender = gender;
    const ageGroup = extractAgeGroup(userMessage);
    if (ageGroup && parsedState?.currentQuestionId === "age_group") slots.ageGroup = ageGroup;
    if (maxTurns <= 0) {
      maxTurns =
        (await openAIDecideMaxTurns({
          history: priorText,
          currentMessage: userMessage,
          confirmedSymptoms: Array.from(confirmed),
          deniedSymptoms: Array.from(denied),
          topCandidates: [],
          slots,
        })) || 10;
    }

    if (hasImagePayload) {
      slots.imageAvailable = true;
      slots.imageProvided = true;
      const preferredDatasets = inferPreferredImageDatasets(userMessage, slots, confirmed);
      const imageFetch = await fetchImagePrediction(imageBase64, userId, preferredDatasets);
      if (imageFetch.prediction) {
        const reliable = chooseReliableImagePrediction(imageFetch.prediction, userMessage, slots, confirmed);
        // ✅ ALWAYS USE IMAGE: Always set imagePrediction, never reject (always contributes)
        imagePrediction = reliable.prediction;
        if (reliable.reason) {
          imageAnalysisNote = `Note: ${reliable.reason}`;
        }
      } else {
        const backendReason = imageFetch.error ? ` Backend reason: ${imageFetch.error}` : "";
        console.error("[diagnose:image] image inference unavailable", {
          status: imageFetch.status,
          reason: imageFetch.error,
          debug: imageFetch.debug,
        });
        imageAnalysisNote = `Image inference unavailable.${backendReason}`.trim();
      }
    }

    if (parsedState && action && parsedState.currentQuestionId) {
      const qid = parsedState.currentQuestionId;
      const answer = action === "custom" ? yesNoFromText(userMessage) : action;
      asked.add(qid);
      asked.add(questionTextKey(parsedState.currentQuestionText || ""));

      if (qid === "temperature") {
        if (temp) slots.temperatureF = temp;
        if (answer === "yes") confirmed.add("high fever");
        if (answer === "no") denied.add("high fever");
      } else if (qid === "duration") {
        if (duration) slots.durationDays = duration;
      } else if (qid === "severity") {
        const severity = extractPainSeverity(userMessage);
        if (typeof severity === "number") slots.symptomSeverity = severity;
      } else if (qid === "progression") {
        const parsedProgression = extractProgression(userMessage);
        if (parsedProgression) slots.progression = parsedProgression;
      } else if (qid === "red_flags") {
        if (answer === "yes") slots.redFlagsPresent = true;
        if (answer === "no") slots.redFlagsPresent = false;
      } else if (qid === "gender") {
        const parsedGender = extractGender(userMessage);
        if (parsedGender) slots.gender = parsedGender;
      } else if (qid === "age_group") {
        const parsedAgeGroup = extractAgeGroup(userMessage);
        if (parsedAgeGroup) slots.ageGroup = parsedAgeGroup;
      } else if (qid === "image_available") {
        if (answer === "yes") {
          slots.imageAvailable = true;
          const preferredDatasets = inferPreferredImageDatasets(userMessage, slots, confirmed);
          void ensureImageWarmup(userId, preferredDatasets);
          if (hasImagePayload) {
            slots.imageProvided = true;
          } else {
            slots.imageProvided = false;
          }
        }
        if (answer === "no") {
          slots.imageAvailable = false;
          slots.imageProvided = false;
          imagePrediction = null;
        }
      } else if (qid === "image_upload") {
        if (hasImagePayload) {
          slots.imageAvailable = true;
          slots.imageProvided = true;
        }
      } else if (qid === "image_condition_confirm") {
        if (imagePrediction) {
          addImageGuidedSymptoms(imagePrediction, confirmed, denied, answer);
        }
      } else if (qid === "pain_location") {
        const parsedLocation = extractPainLocation(userMessage);
        if (parsedLocation) {
          slots.painLocation = parsedLocation;
          if (parsedLocation === "knee") confirmed.add("knee pain");
          if (parsedLocation === "hip") confirmed.add("hip joint pain");
          if (parsedLocation === "joint" || parsedLocation === "leg") confirmed.add("joint pain");
        } else {
          const normalizedFreeText = normalizeToken(userMessage);
          if (normalizedFreeText) {
            slots.painLocation = normalizedFreeText.slice(0, 40);
          }
        }
      } else if (qid === "pain_severity") {
        const parsedSeverity = extractPainSeverity(userMessage);
        if (typeof parsedSeverity === "number") slots.painSeverity = parsedSeverity;
      } else if (qid === "pain_swelling") {
        if (answer === "yes") {
          slots.painSwelling = true;
          confirmed.add("swelling joints");
          confirmed.add("swollen legs");
        }
        if (answer === "no") {
          slots.painSwelling = false;
          denied.add("swelling joints");
          denied.add("swollen legs");
        }
      } else if (qid === "pain_redness") {
        if (answer === "yes") slots.painRedness = true;
        if (answer === "no") slots.painRedness = false;
      } else if (qid === "pain_injury") {
        if (answer === "yes") slots.painInjury = true;
        if (answer === "no") slots.painInjury = false;
      } else if (qid === "pain_fever") {
        if (answer === "yes") {
          slots.painFever = true;
          confirmed.add("high fever");
        }
        if (answer === "no") {
          slots.painFever = false;
          denied.add("high fever");
        }
      } else if (qid.startsWith("symptom:")) {
        const symptom = qid.slice("symptom:".length);
        asked.add(symptom);
        if (answer === "yes") confirmed.add(symptom);
        if (answer === "no") denied.add(symptom);
      } else if (qid.startsWith("ai:")) {
        const aiQuestionSymptoms = extractSymptoms(parsedState.currentQuestionText, datasets);
        for (const symptom of aiQuestionSymptoms) {
          if (answer === "yes") confirmed.add(symptom);
          if (answer === "no") denied.add(symptom);
        }
      }
      turns += 1;
    }

    if (hasImagePayload && imagePrediction && !slots.imageObservationShown) {
      slots.imageObservationShown = true;
      const topThree = imagePrediction.per_dataset.slice(0, 3);
      const imageSignal = pickPrimaryImageSignal(imagePrediction, userMessage, slots, confirmed);
      const rawTop = imagePrediction.per_dataset[0];
      const evidenceLines = topThree
        .map(
          (p, idx) =>
            `${idx + 1}. ${p.dataset}: ${p.top_label_name} (${Number(p.top_confidence).toFixed(1)}%)`
        )
        .join("\n");
      const question = imageSpecificQuestion({
        ...imagePrediction,
        best_dataset: imageSignal.primary.dataset,
        best_label_index: imageSignal.primary.top_label_index,
        best_label_name: imageSignal.primary.top_label_name,
        best_confidence: imageSignal.primary.top_confidence,
      });
      const reply = [
        "I analyzed your uploaded image using trained MedMNIST image models.",
        "",
        `Top image-model observations:`,
        evidenceLines,
        "",
        `Primary image signal (context-weighted): **${imageSignal.primary.dataset} -> ${imageSignal.primary.top_label_name} (${Number(
          imageSignal.primary.top_confidence
        ).toFixed(1)}%)**`,
        `Raw highest-confidence dataset: ${rawTop.dataset} -> ${rawTop.top_label_name} (${Number(rawTop.top_confidence).toFixed(1)}%)`,
        "",
        "This image result is generated from your local image datasets/models, not a fake placeholder.",
        "",
        `**Question ${turns + 1}:** ${question}`,
      ].join("\n");

      const nextState = makeState({
        turns,
        maxTurns,
        confirmedSymptoms: Array.from(confirmed),
        deniedSymptoms: Array.from(denied),
        askedSymptoms: Array.from(asked),
        topCandidates: parsedState?.topCandidates || [],
        currentQuestionId: "image_condition_confirm",
        currentQuestionText: question,
        currentQuestionChoices: ["yes", "no"],
        imagePrediction,
        slots,
      });

      return NextResponse.json({
        reply,
        follow_up_suggested: true,
        follow_up_question: question,
        follow_up_choices: ["yes", "no"],
        follow_up_state: nextState,
        image_analysis: {
          used: true,
          source: "medmnist_models",
          status: "ok",
        },
      });
    }

    const predictions = applyClinicalContextAdjustments(
      applyDemographicAdjustments(scoreDiseases(datasets.diseases, confirmed, denied), {
        gender: slots.gender,
        ageGroup: slots.ageGroup,
      }),
      slots
    );
    const top = predictions[0];
    const topCandidates = predictions.slice(0, 5).map((p) => p.disease);

    const reliability = evaluatePredictionReliability(predictions, confirmed.size, turns, imagePrediction);
    const minTurnsForFinal = 10;
    const needsMoreFollowups = turns < minTurnsForFinal || !reliability.reliable;
    let question: { id: string; text: string; choices?: string[] } | null = null;

    if (needsMoreFollowups && turns < maxTurns) {
      if (!slots.ageGroup) {
        question = {
          id: "age_group",
          text: "Please select your age group.",
          choices: ["infant", "toddler", "child", "adolescent", "youth", "adult", "middle_aged", "senior_citizen"],
        };
      } else if (!slots.gender) {
        question = {
          id: "gender",
          text: "Please select your gender for better triage context.",
          choices: ["male", "female", "custom"],
        };
      } else if (typeof slots.imageAvailable !== "boolean") {
        question = {
          id: "image_available",
          text: "Do you have a related medical image for this issue (skin/retina/chest/pathology/blood cell)?",
          choices: ["yes", "no"],
        };
      } else if (slots.imageAvailable === true && !slots.imageProvided) {
        question = {
          id: "image_upload",
          text: "Please upload one medical image now and send a short message (for example: 'uploaded image').",
          choices: ["upload"],  // ✅ Single "upload" option instead of yes/no
        };
      } else {
        const askedTracker = new Set<string>(asked);
        let generated: { id: string; text: string; choices?: string[] } | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const candidate = await openAILiveFollowupQuestion({
            history: priorText,
            currentMessage: userMessage,
            confirmedSymptoms: Array.from(confirmed),
            deniedSymptoms: Array.from(denied),
            topCandidates,
            askedItems: Array.from(askedTracker),
            turns,
            maxTurns,
            slots,
          });
          if (!candidate) break;
          const key = questionTextKey(candidate.text);
          if (askedTracker.has(key)) {
            askedTracker.add(candidate.id);
            continue;
          }
          generated = candidate;
          break;
        }
        question = generated;

        if (!question) {
          question = pickFallbackQuestionFromDataset(datasets, confirmed, denied, askedTracker, topCandidates);
        }
        if (!question) {
          return NextResponse.json({
            reply:
              "Live follow-up generation is currently unavailable and a dataset fallback could not be selected. Please try again shortly. If this continues, verify OPENAI_API_KEY and OPENAI_MODEL.",
            follow_up_suggested: false,
          });
        }
      }
    }

    if (question && turns < maxTurns && needsMoreFollowups) {
      const nextState = makeState({
        turns,
        maxTurns,
        confirmedSymptoms: Array.from(confirmed),
        deniedSymptoms: Array.from(denied),
        askedSymptoms: Array.from(asked),
        topCandidates,
        currentQuestionId: question.id,
        currentQuestionText: question.text,
        currentQuestionChoices: question.choices,
        imagePrediction,
        slots,
      });

      return NextResponse.json({
        reply: replyForQuestion(question.text, confirmed, turns),
        follow_up_suggested: true,
        follow_up_question: question.text,
        follow_up_choices: question.choices || null,
        follow_up_state: nextState,
      });
    }

    if (!top) {
      if (imagePrediction) {
        const imageOnlyGuidance =
          (await openAIDiagnosisGuidance({
            diagnosis: imagePrediction.best_label_name,
            confidence: Number(imagePrediction.best_confidence.toFixed(1)),
            confirmedSymptoms: Array.from(confirmed),
            demographics: {
              gender: slots.gender || null,
              age_group: slots.ageGroup || null,
            },
            precautions: [],
          })) || null;
        const reply = `I could not reach a confident text-only disease match, but your uploaded image produced a usable signal.\n\n**Image-led likely finding: ${imagePrediction.best_label_name}**\nSource dataset: ${imagePrediction.best_dataset}\nImage confidence: ${imagePrediction.best_confidence.toFixed(
          1
        )}%\n\nPlease use this as triage guidance and consult a clinician for confirmation.`;
        return NextResponse.json({
          reply,
          follow_up_suggested: false,
          image_analysis: {
            used: true,
            source: "medmnist_models",
            status: "ok",
          },
          ml_diagnosis: {
            diagnosis: imagePrediction.best_label_name,
            confidence: Number(imagePrediction.best_confidence.toFixed(1)),
            diagnosis_type: "image_guided",
            top_predictions: imagePrediction.per_dataset.slice(0, 5).map((p) => ({
              disease: `${p.dataset}:${p.top_label_name}`,
              probability: Number(p.top_confidence.toFixed(1)),
            })),
            confirmed_symptoms: Array.from(confirmed),
            followups_asked: turns,
            demographics: {
              gender: slots.gender || null,
              age_group: slots.ageGroup || null,
            },
            source: "image_guided",
            considered_prior_history: false,
            image_prediction: imagePrediction,
            used_image: true,
            guidance: imageOnlyGuidance,
          },
        });
      }
      return NextResponse.json({
        reply:
          "I cannot make a safe prediction from the current details. Please share exact symptom location, severity (0-10), duration, and any triggering factors.",
        follow_up_suggested: false,
      });
    }

    const diseaseInfo = {
      description: datasets.descriptions[top.disease] || "",
      precautions: datasets.precautions[top.disease] || [],
    };

    const imageSignal = imagePrediction
      ? pickPrimaryImageSignal(imagePrediction, userMessage, slots, confirmed).primary
      : null;
    const diagnosis = {
      diagnosis: top.disease,
      confidence: blendFinalConfidence(Number(top.probability.toFixed(1)), imagePrediction?.best_confidence),
      diagnosis_type: reliability.reliable ? "confident_dataset_multimodal" : "provisional_dataset_multimodal",
      top_predictions: predictions.slice(0, 5).map((p) => ({
        disease: p.disease,
        probability: Number(p.probability.toFixed(1)),
      })),
      confirmed_symptoms: Array.from(confirmed),
      followups_asked: turns,
      demographics: {
        gender: slots.gender || null,
        age_group: slots.ageGroup || null,
      },
      disease_info: diseaseInfo,
      source: "dataset_current_session",
      considered_prior_history: false,
      image_prediction: imagePrediction,
      used_image: Boolean(imagePrediction),
    };
    const aiGuidance =
      (await openAIDiagnosisGuidance({
        diagnosis: diagnosis.diagnosis,
        confidence: diagnosis.confidence,
        confirmedSymptoms: diagnosis.confirmed_symptoms,
        demographics: diagnosis.demographics,
        precautions: diseaseInfo.precautions,
      })) || null;

    const toLabel = (value: string): string => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const precautionsText =
      diseaseInfo.precautions.length > 0
        ? `\n\n**Self-care steps**\n${diseaseInfo.precautions.map((p) => `- ${p}`).join("\n")}`
        : "";

    const certaintyText = reliability.reliable
      ? "This prediction is reasonably strong from your current symptom and image details."
      : "This is a preliminary prediction and can change after more follow-up answers.";
    const demographicsText = `About you: ${slots.gender || "unknown"}, ${slots.ageGroup || "unknown"}`;
    const imageProbabilityText = imagePrediction
      ? imagePrediction.per_dataset
          .slice(0, 5)
          .map(
            (p, idx) => {
              const multiClass = Array.isArray(p.scores) && p.scores.length > 0
                ? p.scores
                    .slice(0, 3)
                    .map(
                      (s, i) =>
                        `   ${i + 1}) ${toLabel(s.label_name)} (${Number(s.confidence || 0).toFixed(1)}%)`
                    )
                    .join("\n")
                : "";
              return `${idx + 1}. ${toLabel(p.dataset)}\n${multiClass || `   Top: ${toLabel(p.top_label_name)} (${Number(
                p.top_confidence || 0
              ).toFixed(1)}%)`}`;
            }
          )
          .join("\n")
      : "";
    const imageText = imagePrediction
      ? `\n\n**Image clues from your upload**\n${imageProbabilityText}\nMain clue used: ${toLabel(
          imageSignal?.dataset || "unknown"
        )} -> ${toLabel(imageSignal?.top_label_name || "unknown")} (${Number(imageSignal?.top_confidence || 0).toFixed(
          1
        )}%)`
      : `\n\n**Image clues from your upload**\nNot used for this prediction.${
          imageAnalysisNote ? `\nReason: ${imageAnalysisNote}` : ""
        }`;
    const reply = `**Your preliminary result**\nLikely condition: ${toLabel(diagnosis.diagnosis)}\nConfidence: ${
      diagnosis.confidence
    }%\n\n**What I used to estimate this**\nSymptoms: ${
      diagnosis.confirmed_symptoms.map(formatSymptom).join(", ") || "No clear symptoms captured yet"
    }\n${demographicsText}${imageText}\n\n**What this means**\n${certaintyText}\n${
      diseaseInfo.description || "Detailed condition description is not available right now."
    }${precautionsText}\n\nThis guidance is for you and is not a final medical diagnosis.`;

    return NextResponse.json({
      reply,
      follow_up_suggested: false,
      ml_diagnosis: {
        ...diagnosis,
        guidance: aiGuidance,
        image_analysis: {
          used: Boolean(imagePrediction),
          source: imagePrediction ? "medmnist_models" : "text_only",
          status: imagePrediction ? "ok" : hasImagePayload ? "skipped_unreliable_or_unavailable" : "not_requested",
          note: imageAnalysisNote,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

