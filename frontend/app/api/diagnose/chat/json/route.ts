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
  currentQuestionChoices?: string[];
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
  if (/\bheadache|migraine|dizziness|vertigo|numbness|tingling|seizure\b/.test(t)) return "neurologic";
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
  if (!hasMedicalKeyword) return false;
  return /\b(i|im|i am|my|me|mine|feeling|feel|having|suffering|experienced|experiencing)\b/.test(normalized);
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

function evaluatePredictionReliability(predictions: Prediction[], confirmedCount: number, turns: number): {
  reliable: boolean;
  topProbability: number;
  probabilityGap: number;
} {
  const top = predictions[0];
  if (!top) return { reliable: false, topProbability: 0, probabilityGap: 0 };

  const second = predictions[1];
  const probabilityGap = second ? top.probability - second.probability : top.probability;
  const enoughSymptoms = confirmedCount >= 2;
  const enoughFollowup = turns >= 2;
  const strongConfidence = top.probability >= 62;
  const clearSeparation = probabilityGap >= 12;

  return {
    reliable: strongConfidence && clearSeparation && (enoughSymptoms || enoughFollowup),
    topProbability: top.probability,
    probabilityGap,
  };
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
          maxTurns: p.maxTurns || 6,
          confirmedSymptoms: p.confirmedSymptoms || [],
          deniedSymptoms: p.deniedSymptoms || [],
          askedSymptoms: p.askedSymptoms || [],
          topCandidates: p.topCandidates || [],
          currentQuestionId: p.currentQuestionId,
          currentQuestionText: p.currentQuestionText,
          currentQuestionChoices: p.currentQuestionChoices || undefined,
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

async function openAIFallbackDiagnosis(
  history: string[],
  message: string,
  symptoms: string[],
  demographics: { gender?: FollowupState["slots"]["gender"]; ageGroup?: FollowupState["slots"]["ageGroup"] }
) {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: ((process.env.OPENAI_MODEL || "").trim().replace(/^['"]|['"]$/g, "")) || "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Return strict JSON only with keys diagnosis, confidence, top_predictions (array of up to 5 {disease, probability}), summary, precautions (string array).",
          },
          {
            role: "user",
            content: `History:\n${history.slice(-15).join("\n")}\n\nCurrent message: ${message}\nSymptoms: ${symptoms.join(
              ", "
            )}\nDemographics: gender=${demographics.gender || "unknown"}, age_group=${
              demographics.ageGroup || "unknown"
            }`,
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

    let top = (parsed.top_predictions || [])
      .slice(0, 5)
      .map((p) => ({ disease: p.disease, probability: Number(p.probability) || 0 }));

    const maxProbability = top.reduce((m, p) => Math.max(m, p.probability), 0);
    if (maxProbability > 0 && maxProbability <= 1) {
      top = top.map((p) => ({ ...p, probability: p.probability * 100 }));
    }
    const totalProbability = top.reduce((sum, p) => sum + p.probability, 0);
    if (totalProbability > 0) {
      top = top.map((p) => ({
        ...p,
        probability: Number(((p.probability / totalProbability) * 100).toFixed(1)),
      }));
    }

    let confidence = Number(parsed.confidence);
    if (Number.isNaN(confidence)) confidence = 35;
    if (confidence > 0 && confidence <= 1) confidence *= 100;
    confidence = Number(Math.max(0, Math.min(100, confidence)).toFixed(1));

    return {
      diagnosis: parsed.diagnosis,
      confidence,
      summary: parsed.summary || "",
      precautions: parsed.precautions || [],
      top_predictions: top.length > 0 ? top : [{ disease: parsed.diagnosis, probability: confidence }],
    };
  } catch (err) {
    console.error("OpenAI fallback diagnosis crashed:", err instanceof Error ? err.stack || err.message : err);
    return null;
  }
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

function explainQuestionPurpose(questionText: string): string {
  const q = questionText.toLowerCase();
  if (q.includes("where exactly")) return "Reason: location helps separate joint, muscle, nerve, and vascular causes.";
  if (q.includes("0 to 10") || q.includes("severe")) return "Reason: severity helps estimate urgency and probable condition range.";
  if (q.includes("how long")) return "Reason: symptom duration helps distinguish acute vs chronic causes.";
  if (q.includes("getting better") || q.includes("worse")) return "Reason: trend over time improves diagnostic confidence.";
  if (q.includes("warning signs")) return "Reason: red-flag screening checks for conditions needing urgent care.";
  if (q.includes("gender") || q.includes("age group")) return "Reason: demographics can shift disease likelihood in the dataset.";
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
          "Dataset is unavailable right now. Please share your symptoms, duration, and temperature so I can continue with API-assisted guidance.",
        follow_up_suggested: false,
        resource_note: "dataset_unavailable",
      });
    }

    const parsedState = parseState(currentMessages);
    const directInfoReply = !parsedState ? informationalDiseaseReply(userMessage, datasets) : null;
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
    let turns = parsedState?.turns || 0;
    const maxTurns = parsedState?.maxTurns || 10;

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

    const predictions = applyClinicalContextAdjustments(
      applyDemographicAdjustments(scoreDiseases(datasets.diseases, confirmed, denied), {
        gender: slots.gender,
        ageGroup: slots.ageGroup,
      }),
      slots
    );
    const top = predictions[0];
    const topCandidates = predictions.slice(0, 5).map((p) => p.disease);

    const reliability = evaluatePredictionReliability(predictions, confirmed.size, turns);
    let question: { id: string; text: string; choices?: string[] } | null = null;

    if (!reliability.reliable && turns < maxTurns) {
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
          return NextResponse.json({
            reply:
              "Live follow-up generation is currently unavailable. Please try again shortly. If this continues, verify OPENAI_API_KEY and OPENAI_MODEL.",
            follow_up_suggested: false,
          });
        }
      }
    }

    if (question && turns < maxTurns && !reliability.reliable) {
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
      return NextResponse.json({
        reply:
          "I cannot make a safe prediction from the current details. Please share exact symptom location, severity (0-10), duration, and any triggering factors.",
        follow_up_suggested: false,
      });
    }

    if (!reliability.reliable) {
      const ai = await openAIFallbackDiagnosis(priorText, userMessage, Array.from(confirmed), {
        gender: slots.gender,
        ageGroup: slots.ageGroup,
      });
      if (ai) {
        const datasetComparison = {
          diagnosis: top.disease,
          confidence: Number(top.probability.toFixed(1)),
          top_predictions: predictions.slice(0, 5).map((p) => ({
            disease: p.disease,
            probability: Number(p.probability.toFixed(1)),
          })),
        };
        const reply = `Dataset confidence remained low, so an API-assisted prediction is used.\n\n**Likely condition (API-assisted): ${ai.diagnosis}**\nConfidence: ${Number(
          ai.confidence
        ).toFixed(1)}%\n\n**Dataset comparison:** ${datasetComparison.diagnosis} (${datasetComparison.confidence}%)\n\n${
          ai.summary || "Dataset confidence was low, so this used API-assisted analysis."
        }\n\n${
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
            demographics: {
              gender: slots.gender || null,
              age_group: slots.ageGroup || null,
            },
            disease_info: { description: ai.summary || "", precautions: ai.precautions || [] },
            source: "api_fallback",
            considered_prior_history: false,
            comparison: {
              dataset: datasetComparison,
              openai: {
                diagnosis: ai.diagnosis,
                confidence: Number(ai.confidence.toFixed(1)),
                top_predictions: ai.top_predictions.map((p) => ({
                  disease: p.disease,
                  probability: Number(p.probability.toFixed(1)),
                })),
              },
            },
          },
        });
      }
      return NextResponse.json({
        reply:
          "Dataset confidence is low and API fallback is unavailable right now. Please share detailed symptoms and consult a clinician if symptoms are severe.",
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
      demographics: {
        gender: slots.gender || null,
        age_group: slots.ageGroup || null,
      },
      disease_info: diseaseInfo,
      source: "dataset_current_session",
      considered_prior_history: false,
    };
    const apiComparison = await openAIFallbackDiagnosis(priorText, userMessage, Array.from(confirmed), {
      gender: slots.gender,
      ageGroup: slots.ageGroup,
    });

    const precautionsText =
      diseaseInfo.precautions.length > 0
        ? `\n\n**Precautions:**\n${diseaseInfo.precautions.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
        : "";

    const demographicsText = `Demographics considered: ${slots.gender || "unknown"}, ${slots.ageGroup || "unknown"}`;
    const comparisonText = apiComparison
      ? `\n\n**OpenAI comparison:** ${apiComparison.diagnosis} (${Number(apiComparison.confidence).toFixed(1)}%)`
      : `\n\n**OpenAI comparison:** unavailable`;
    const reply = `**Likely condition: ${diagnosis.diagnosis}**\nConfidence: ${
      diagnosis.confidence
    }%\n\nSymptoms considered: ${diagnosis.confirmed_symptoms.map(formatSymptom).join(", ")}\n${demographicsText}\n\n${
      diseaseInfo.description || "No detailed description available in dataset."
    }${precautionsText}${comparisonText}\n\nThis is informational only and not a medical diagnosis.`;

    return NextResponse.json({
      reply,
      follow_up_suggested: false,
      ml_diagnosis: {
        ...diagnosis,
        comparison: {
          dataset: {
            diagnosis: diagnosis.diagnosis,
            confidence: diagnosis.confidence,
            top_predictions: diagnosis.top_predictions,
          },
          openai: apiComparison
            ? {
                diagnosis: apiComparison.diagnosis,
                confidence: Number(apiComparison.confidence.toFixed(1)),
                top_predictions: apiComparison.top_predictions.map((p) => ({
                  disease: p.disease,
                  probability: Number(p.probability.toFixed(1)),
                })),
              }
            : null,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
