"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Activity, Info, Menu, PlusSquare, Search, Trash2, ChevronLeft, ChevronRight, ShieldCheck, Sparkles, HeartPulse, Apple, Paperclip, Image as ImageIcon, FileText, X, Circle, Square, Triangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { cachedFetch, clearCache } from "@/lib/api-cache"; // ✅ Deduplication & Caching
import DiagnosisResultPopup from "@/components/diagnosis-result-popup";

// Types
type ChatSession = {
    id: string;
    title: string;
    updatedAt: string;
};

type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
    jsonPayload?: string | null;
    isInitial?: boolean;
    // New fields for Hindi
    translatedContent?: string;
    translatedPayload?: DiagnosisPayload;
};

type UserMessagePayload = {
    image_preview?: string;
    image_name?: string;
    report_name?: string;
    report_preview?: string;
};

type FollowupStatePayload = {
    kind?: "followup_state";
    pending?: boolean;
    currentQuestionId?: string;
    currentQuestionText?: string;
    currentQuestionChoices?: string[];
};

type ReportAnalysisPayload = {
    symptoms?: string[];
    findings?: { finding?: string; symptom?: string; severity?: string }[];
    summary?: string;
    serious_findings?: string[];
    abnormal_findings?: string[];
    normal_findings?: string[];
};

type DiagnosisPayload = {
    diagnosis: string;
    confidence?: number;
    source?: "dataset_current_session" | "image_guided" | string;
    guidance?: {
        home_remedies?: string[];
        lifestyle_changes?: string[];
        diet_adjustments?: string[];
    };
    top_predictions?: { disease: string; probability: number }[];
    image_prediction?: {
        best_dataset?: string;
        best_label_name?: string;
        best_confidence?: number;
        per_dataset?: {
            dataset: string;
            top_label_name: string;
            top_confidence: number;
            scores?: { label_index: number; label_name: string; confidence: number }[];
        }[];
    };
    confirmed_symptoms?: string[];
    demographics?: {
        gender?: string | null;
        age_group?: string | null;
    };
    disease_info?: {
        description?: string;
        precautions?: string[];
    };
    report_analysis?: ReportAnalysisPayload | null;
};

function combinedTopPredictions(payload?: DiagnosisPayload | null): { disease: string; probability: number }[] {
    const base = payload?.top_predictions || [];
    return base.map((p) => ({
        disease: p.disease,
        probability: Number(p.probability.toFixed(1))
    })).slice(0, 5);
}

function labelize(text: string): string {
    return text.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeBrandName(text: string): string {
    return text.replace(/\bMediCoreAI\b/g, "MedCoreAI").replace(/\bMediCore\b/g, "MedCoreAI");
}

function extractLatestDiagnosis(messages: Message[]): { messageId: string; payload: DiagnosisPayload } | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (msg.role !== "assistant" || !msg.jsonPayload) continue;
        try {
            const parsed = JSON.parse(msg.jsonPayload) as Partial<DiagnosisPayload>;
            if (parsed?.diagnosis && Array.isArray(parsed.top_predictions)) {
                return { messageId: msg.id, payload: parsed as DiagnosisPayload };
            }
        } catch {
            continue;
        }
    }
    return null;
}

function extractLatestUploadedImage(messages: Message[]): { preview: string; name?: string } | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        if (msg.role !== "user" || !msg.jsonPayload) continue;
        try {
            const parsed = JSON.parse(msg.jsonPayload) as UserMessagePayload;
            if (parsed.image_preview) {
                return { preview: parsed.image_preview, name: parsed.image_name };
            }
        } catch {
            continue;
        }
    }
    return null;
}

async function parseResponseJson<T>(res: Response): Promise<T> {
    const raw = await res.text();

    if (!raw) {
        if (res.status === 504) {
            throw new Error("Request timed out (504). The server took too long to respond. Please try again.");
        }
        throw new Error(`Empty response body (status ${res.status})`);
    }

    try {
        return JSON.parse(raw) as T;
    } catch {
        const textOnly = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
        if (res.status === 504) {
            throw new Error("Request timed out (504). Image analysis backend is taking too long. Please retry.");
        }
        if (!res.ok) {
            throw new Error(`Server error (status ${res.status})${textOnly ? `: ${textOnly}` : ""}`);
        }
        throw new Error(`Invalid JSON response (status ${res.status})${textOnly ? `: ${textOnly}` : ""}`);
    }
}

// Custom Premium Loader for Hindi Button
function PremiumHindiLoader() {
    return (
        <div className="flex items-center gap-1">
            <svg className="animate-spin h-3 w-3 text-current" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-[10px] animate-pulse">Translate...</span>
        </div>
    );
}

function ImageTip({ text }: { text: string }) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        async function fetchImage() {
            try {
                const res = await fetch(`/api/images/search?query=${encodeURIComponent(text)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted) setImageUrl(data.imageUrl);
                }
            } catch (err) {
                console.error("Failed to fetch tip image:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        fetchImage();
        return () => { isMounted = false; };
    }, [text]);

    return (
        <li className="flex items-start gap-3 group">
            {imageUrl ? (
                <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-slate-200 mt-0.5 shadow-sm group-hover:shadow-md transition-shadow">
                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
            ) : loading ? (
                <div className="shrink-0 w-12 h-12 rounded-lg bg-slate-100 animate-pulse mt-0.5 border border-slate-200" />
            ) : (
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
            )}
            <span className="leading-relaxed">{text}</span>
        </li>
    );
}

// Component for rendering animated ML Disease Probability Bars
function AnimatedProgress({ label, percentage, delay = 0 }: { label: string, percentage: number, delay?: number }) {
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => setWidth(percentage), delay);
        return () => clearTimeout(timer);
    }, [percentage, delay]);

    return (
        <div className="mb-3 w-full">
            <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="text-slate-700 font-medium">{label.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
                <span className="text-slate-600">{percentage.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-slate-700 to-slate-500 transition-all duration-1000 ease-out"
                    style={{ width: `${width}%` }}
                />
            </div>
        </div>
    );
}

// ✨ Beautiful Image Analysis Progress Bar Component
function ImageAnalysisProgressBar({
    progress,
    phase,
    isVisible
}: {
    progress: number;
    phase: "detecting" | "analyzing" | "inferring" | "results";
    isVisible: boolean;
}) {
    const phaseNames = {
        detecting: { label: "🔍 Detecting Image Type", time: "2-3s" },
        analyzing: { label: "🧬 Analyzing Medical Features", time: "5-8s" },
        inferring: { label: "🤖 Running AI Models", time: "8-12s" },
        results: { label: "✅ Processing Results", time: "1-2s" }
    };

    const phaseInfo = phaseNames[phase];
    const totalEstimate = phase === "detecting" ? "2-3s" : phase === "analyzing" ? "7-11s" : phase === "inferring" ? "15-27s" : "16-29s";

    if (!isVisible) return null;

    return (
        <div className="max-w-3xl mx-auto w-full px-2 md:px-0">
            <div className="rounded-2xl border border-[#e5e5e5] bg-gradient-to-br from-[#fafafa] via-[#f5f5f5] to-[#fafafa] p-6 shadow-sm animate-in fade-in duration-300">
                {/* Header with Phase Info */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#0f0f0f] animate-pulse" />
                        <div>
                            <div className="text-sm font-semibold text-[#0f0f0f]">{phaseInfo.label}</div>
                            <div className="text-xs text-[#8e8e8e] mt-0.5">Estimated: ~{phaseInfo.time}</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-[#0f0f0f]">{Math.round(progress)}%</div>
                        <div className="text-xs text-[#8e8e8e] mt-0.5">Total: ~{totalEstimate}</div>
                    </div>
                </div>

                {/* Main Progress Bar */}
                <div className="w-full h-3 bg-[#e5e5e5] rounded-full overflow-hidden shadow-inner mb-4">
                    <div
                        className="h-full bg-gradient-to-r from-[#0f0f0f] via-[#404040] to-[#0f0f0f] rounded-full shadow-lg transition-all duration-300 ease-out relative overflow-hidden"
                        style={{ width: `${progress}%` }}
                    >
                        <div className="absolute inset-0 bg-white/10 animate-pulse" />
                    </div>
                </div>

                {/* Phase Indicators */}
                <div className="flex justify-between text-xs font-medium">
                    <div className={`flex items-center gap-1 ${phase === "detecting" || progress > 0 ? "text-[#0f0f0f]" : "text-[#999999]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${phase === "detecting" ? "bg-[#0f0f0f] scale-150" : progress > 0 ? "bg-[#404040]" : "bg-[#d1d1d1]"}`} />
                        Detect
                    </div>
                    <div className={`flex items-center gap-1 ${phase === "analyzing" || progress > 25 ? "text-[#0f0f0f]" : "text-[#999999]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${phase === "analyzing" ? "bg-[#0f0f0f] scale-150" : progress > 25 ? "bg-[#404040]" : "bg-[#d1d1d1]"}`} />
                        Analyze
                    </div>
                    <div className={`flex items-center gap-1 ${phase === "inferring" || progress > 50 ? "text-[#0f0f0f]" : "text-[#999999]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${phase === "inferring" ? "bg-[#0f0f0f] scale-150" : progress > 50 ? "bg-[#404040]" : "bg-[#d1d1d1]"}`} />
                        Infer
                    </div>
                    <div className={`flex items-center gap-1 ${phase === "results" || progress > 75 ? "text-[#0f0f0f]" : "text-[#999999]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${phase === "results" ? "bg-[#0f0f0f] scale-150" : progress > 75 ? "bg-[#404040]" : "bg-[#d1d1d1]"}`} />
                        Results
                    </div>
                </div>

                {/* Info Text */}
                <div className="mt-4 text-xs text-[#666666] text-center">
                    {phase === "detecting" && "Analyzing image characteristics and medical content..."}
                    {phase === "analyzing" && "Extracting features and running medical filters..."}
                    {phase === "inferring" && "Running inference on 5 deep learning models..."}
                    {phase === "results" && "Generating diagnosis and compiling results..."}
                </div>
            </div>
        </div>
    );
}

// ✨ Beautiful Report Analysis Progress Bar Component
function ReportAnalysisProgressBar({
    progress,
    phase,
    isVisible
}: {
    progress: number;
    phase: "extracting" | "analyzing" | "inferring" | "results";
    isVisible: boolean;
}) {
    const phaseNames = {
        extracting: { label: "📄 Extracting Text", time: "2-4s" },
        analyzing: { label: "🧠 Analyzing Content", time: "4-7s" },
        inferring: { label: "💡 Extracting Symptoms", time: "6-10s" },
        results: { label: "📋 Compiling Report", time: "1-2s" }
    };

    const phaseInfo = phaseNames[phase];
    const totalEstimate = phase === "extracting" ? "2-4s" : phase === "analyzing" ? "6-11s" : phase === "inferring" ? "12-21s" : "13-23s";

    if (!isVisible) return null;

    return (
        <div className="max-w-3xl mx-auto w-full px-2 md:px-0">
            <div className="rounded-2xl border border-[#e5e5e5] bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#f8fafc] p-6 shadow-sm animate-in fade-in duration-300">
                {/* Header with Phase Info */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#0f0f0f] animate-pulse" />
                        <div>
                            <div className="text-sm font-semibold text-[#0f0f0f]">{phaseInfo.label}</div>
                            <div className="text-xs text-[#8e8e8e] mt-0.5">Estimated: ~{phaseInfo.time}</div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-[#0f0f0f]">{Math.round(progress)}%</div>
                        <div className="text-xs text-[#8e8e8e] mt-0.5">Total: ~{totalEstimate}</div>
                    </div>
                </div>

                {/* Main Progress Bar */}
                <div className="w-full h-3 bg-[#e5e5e5] rounded-full overflow-hidden shadow-inner mb-4">
                    <div
                        className="h-full bg-gradient-to-r from-[#0f0f0f] via-[#404040] to-[#0f0f0f] rounded-full shadow-lg transition-all duration-300 ease-out relative overflow-hidden"
                        style={{ width: `${progress}%` }}
                    >
                        <div className="absolute inset-0 bg-white/10 animate-pulse" />
                    </div>
                </div>

                {/* Phase Indicators */}
                <div className="flex justify-between text-xs font-medium">
                    <div className={`flex items-center gap-1 ${phase === "extracting" || progress > 0 ? "text-[#0f0f0f]" : "text-[#999999]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${phase === "extracting" ? "bg-[#0f0f0f] scale-150" : progress > 0 ? "bg-[#404040]" : "bg-[#d1d1d1]"}`} />
                        Extract
                    </div>
                    <div className={`flex items-center gap-1 ${phase === "analyzing" || progress > 25 ? "text-[#0f0f0f]" : "text-[#999999]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${phase === "analyzing" ? "bg-[#0f0f0f] scale-150" : progress > 25 ? "bg-[#404040]" : "bg-[#d1d1d1]"}`} />
                        Analyze
                    </div>
                    <div className={`flex items-center gap-1 ${phase === "inferring" || progress > 50 ? "text-[#0f0f0f]" : "text-[#999999]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${phase === "inferring" ? "bg-[#0f0f0f] scale-150" : progress > 50 ? "bg-[#404040]" : "bg-[#d1d1d1]"}`} />
                        Infer
                    </div>
                    <div className={`flex items-center gap-1 ${phase === "results" || progress > 75 ? "text-[#0f0f0f]" : "text-[#999999]"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${phase === "results" ? "bg-[#0f0f0f] scale-150" : progress > 75 ? "bg-[#404040]" : "bg-[#d1d1d1]"}`} />
                        Results
                    </div>
                </div>

                {/* Info Text */}
                <div className="mt-4 text-xs text-[#666666] text-center">
                    {phase === "extracting" && "Extracting text from your medical report..."}
                    {phase === "analyzing" && "Analyzing report content with AI..."}
                    {phase === "inferring" && "Extracting symptoms and medical findings..."}
                    {phase === "results" && "Compiling analysis results..."}
                </div>
            </div>
        </div>
    );
}

// Generates ChatGPT style clean topic headings
function generateChatTitle(prompt: string) {
    const cleaned = prompt.trim().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
    if (!cleaned) return "New Diagnosis";
    if (cleaned.length <= 30) return cleaned;
    return `${cleaned.slice(0, 30)}...`;
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

const DIAGNOSIS_TRIGGER_HELP =
    "Tip: Start diagnosis mode with `diagnose:` or `predict:`. Example: `diagnose: I have fever`.";

const DEFAULT_GUIDANCE = {
    homeRemedies: [
        "Hydrate adequately and rest.",
        "Use basic symptom-relief measures as needed.",
        "Seek care if symptoms worsen.",
    ],
    lifestyle: [
        "Maintain sleep and hydration.",
        "Track symptoms daily.",
        "Avoid unnecessary self-medication.",
    ],
    diet: [
        "Prefer balanced home-cooked meals.",
        "Reduce fried and heavily processed foods.",
        "Use small frequent meals if appetite is low.",
    ],
};

export default function ChatDashboard() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);

    const [input, setInput] = useState("");
    const [attachments, setAttachments] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const [followUpActive, setFollowUpActive] = useState(false);
    const [followUpQuestionId, setFollowUpQuestionId] = useState<string>("");
    const [followUpQuestion, setFollowUpQuestion] = useState<string>("");
    const [followUpChoices, setFollowUpChoices] = useState<string[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [latestDiagnosis, setLatestDiagnosis] = useState<DiagnosisPayload | null>(null);
    const [latestDiagnosisMessageId, setLatestDiagnosisMessageId] = useState<string | null>(null);
    const [latestUploadedImage, setLatestUploadedImage] = useState<{ preview: string; name?: string } | null>(null);
    const [resultPanelMinimized, setResultPanelMinimized] = useState(false);
    const [mobilePanel, setMobilePanel] = useState<"none" | "history" | "prediction">("none");
    const [hindiByMessage, setHindiByMessage] = useState<Record<string, boolean>>({});
    const [translatedByMessage, setTranslatedByMessage] = useState<Record<string, string | { content: string; payload?: DiagnosisPayload }>>({});
    const [translatingByMessage, setTranslatingByMessage] = useState<Record<string, boolean>>({});
    const [imageAnalysisProgress, setImageAnalysisProgress] = useState(0);
    const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
    const [analysisPhase, setAnalysisPhase] = useState<"detecting" | "analyzing" | "inferring" | "results">
        ("detecting");
    
    // Report analysis progress state
    const [reportAnalysisProgress, setReportAnalysisProgress] = useState(0);
    const [isAnalyzingReport, setIsAnalyzingReport] = useState(false);
    const [reportAnalysisPhase, setReportAnalysisPhase] = useState<"extracting" | "analyzing" | "inferring" | "results">
        ("extracting");
    
    // Track uploaded report for preview
    const [latestUploadedReport, setLatestUploadedReport] = useState<{ preview: string; name: string; type: string } | null>(null);
    
    // Track symptoms identified from image and report analysis
    const [imageIdentifiedSymptoms, setImageIdentifiedSymptoms] = useState<string[]>([]);
    const [reportIdentifiedSymptoms, setReportIdentifiedSymptoms] = useState<string[]>([]);

    // Popup state for diagnosis result modal
    const [showDiagnosisPopup, setShowDiagnosisPopup] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const reportInputRef = useRef<HTMLInputElement>(null);
    const inFlightHindiRequestsRef = useRef<Record<string, Promise<boolean>>>({});
    const failedHindiPrefetchRef = useRef<Record<string, boolean>>({});

    // Auth redirection
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    // Load Sessions on Mount
    useEffect(() => {
        if (status === "authenticated") {
            fetchSessions();
        }
    }, [status]);

    // Scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [input]);

    function handleFileAdd(files: FileList | null) {
        if (!files || files.length === 0) return;
        const incoming = Array.from(files);
        const uploadQuestionId = followUpActive ? followUpQuestionId : "";
        if (uploadQuestionId === "image_upload") {
            const images = incoming.filter((file) => file.type.startsWith("image/"));
            if (images.length > 0) {
                void sendMessage("uploaded image", "custom", images);
                return;
            }
        }
        if (uploadQuestionId === "report_upload") {
            const reports = incoming.filter((file) => !file.type.startsWith("image/"));
            if (reports.length > 0) {
                void sendMessage("uploaded medical report", "custom", reports);
                return;
            }
        }
        setAttachments((prev) => [...prev, ...incoming]);
    }

    function removeAttachment(index: number) {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    }

    // Track latest diagnosis and auto-open result panel
    useEffect(() => {
        const latest = extractLatestDiagnosis(messages);
        if (!latest) {
            setLatestDiagnosis(null);
            setLatestDiagnosisMessageId(null);
            return;
        }
        if (latest.messageId !== latestDiagnosisMessageId) {
            setLatestDiagnosis(latest.payload);
            setLatestDiagnosisMessageId(latest.messageId);
            setResultPanelMinimized(false);
        }
    }, [messages, latestDiagnosisMessageId]);

    useEffect(() => {
        setLatestUploadedImage(extractLatestUploadedImage(messages));
    }, [messages]);

    // Track latest uploaded report from messages
    useEffect(() => {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const msg = messages[i];
            if (msg.role !== "user" || !msg.jsonPayload) continue;
            try {
                const parsed = JSON.parse(msg.jsonPayload) as UserMessagePayload;
                if (parsed.report_preview || parsed.report_name) {
                    setLatestUploadedReport({
                        preview: parsed.report_preview || "",
                        name: parsed.report_name || "Uploaded Report",
                        type: "pdf"
                    });
                    return;
                }
            } catch {
                continue;
            }
        }
        setLatestUploadedReport(null);
    }, [messages]);

    async function fetchSessions() {
        try {
            const res = await fetch("/api/chat/sessions");
            const data = await parseResponseJson<{ sessions?: ChatSession[] }>(res);
            if (data.sessions && data.sessions.length > 0) {
                setSessions(data.sessions);
            }
            // Always start with an empty new chat (ChatGPT behavior)
            handleNewChat();
        } catch (e) {
            console.error("Failed to fetch sessions", e);
        }
    }

    function handleNewChat() {
        setCurrentSessionId(null);
        setMessages([]);
        setFollowUpActive(false);
        setFollowUpQuestionId("");
        setFollowUpQuestion("");
        setFollowUpChoices([]);
        setInput("");
        setLatestDiagnosis(null);
        setLatestDiagnosisMessageId(null);
        setResultPanelMinimized(false);
        setHindiByMessage({});
        setTranslatedByMessage({});
        setTranslatingByMessage({});
        inFlightHindiRequestsRef.current = {};
        failedHindiPrefetchRef.current = {};
        if (window.innerWidth < 768) {
            setSidebarOpen(false);
        }
    }

    async function loadSession(id: string) {
        setCurrentSessionId(id);
        setLoading(true);
        setFollowUpActive(false);
        setFollowUpQuestionId("");
        setFollowUpChoices([]);
        setLatestDiagnosis(null);
        setLatestDiagnosisMessageId(null);
        setResultPanelMinimized(false);
        setHindiByMessage({});
        setTranslatedByMessage({});
        setTranslatingByMessage({});
        inFlightHindiRequestsRef.current = {};
        failedHindiPrefetchRef.current = {};

        if (window.innerWidth < 768) {
            setSidebarOpen(false);
        }

        try {
            const res = await fetch(`/api/chat/sessions/${id}/messages`);
            const data = await parseResponseJson<{ messages?: Message[] }>(res);

            if (data.messages && data.messages.length > 0) {
                setMessages(data.messages);
                // Restore follow-up state from persisted assistant payload.
                const lastMsg = data.messages[data.messages.length - 1];
                if (lastMsg.role === "assistant" && lastMsg.jsonPayload) {
                    try {
                        const payload = JSON.parse(lastMsg.jsonPayload) as FollowupStatePayload;
                        if (payload.kind === "followup_state" && payload.pending) {
                            setFollowUpActive(true);
                            setFollowUpQuestionId(payload.currentQuestionId || "");
                            if (payload.currentQuestionText) {
                                setFollowUpQuestion(payload.currentQuestionText);
                            } else {
                                setFollowUpQuestion("Please answer the follow-up question.");
                            }
                            setFollowUpChoices(Array.isArray(payload.currentQuestionChoices) ? payload.currentQuestionChoices : []);
                        } else {
                            setFollowUpActive(false);
                            setFollowUpQuestionId("");
                            setFollowUpQuestion("");
                            setFollowUpChoices([]);
                        }
                    } catch {
                        setFollowUpActive(false);
                        setFollowUpQuestionId("");
                        setFollowUpQuestion("");
                        setFollowUpChoices([]);
                    }
                } else {
                    setFollowUpActive(false);
                    setFollowUpQuestionId("");
                    setFollowUpQuestion("");
                    setFollowUpChoices([]);
                }
            } else {
                setMessages([]);
                setFollowUpActive(false);
                setFollowUpQuestionId("");
                setFollowUpQuestion("");
                setFollowUpChoices([]);
            }
        } catch (e) {
            console.error("Failed to load messages", e);
        } finally {
            setLoading(false);
        }
    }

    async function deleteSession(id: string) {
        if (deletingSessionId) return;
        setDeletingSessionId(id);
        try {
            const res = await fetch(`/api/chat/sessions/${id}`, {
                method: "DELETE",
            });
            const data = await parseResponseJson<{ error?: string; ok?: boolean }>(res);
            if (!res.ok) throw new Error(data.error || "Failed to delete session");

            setSessions(prev => prev.filter(s => s.id !== id));
            if (currentSessionId === id) {
                handleNewChat();
            }
        } catch (e) {
            console.error("Failed to delete session", e);
        } finally {
            setDeletingSessionId(null);
        }
    }

    async function sendMessage(text: string, action?: "yes" | "no" | "custom", overrideAttachments?: File[]) {
        if (loading) return;
        if (!text.trim() && !action) return;

        const sentText = action === "yes" ? "Yes" : action === "no" ? "No" : text;
        const pendingAttachments = overrideAttachments ? [...overrideAttachments] : [...attachments];
        const firstImage = pendingAttachments.find((f) => f.type.startsWith("image/")) || null;
        const firstReport = pendingAttachments.find((f) => !f.type.startsWith("image/")) || null;
        const imageDataUrl = firstImage ? await fileToBase64(firstImage) : null;
        const reportDataUrl = firstReport ? await fileToBase64(firstReport) : null;
        const optimisticUserMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: sentText,
            jsonPayload: (imageDataUrl || reportDataUrl)
                ? JSON.stringify({ 
                    image_preview: imageDataUrl || undefined, 
                    image_name: firstImage?.name, 
                    report_name: firstReport?.name,
                    report_preview: reportDataUrl || undefined
                } as UserMessagePayload)
                : null,
        };
        setMessages(prev => [...prev, optimisticUserMessage]);

        setInput("");
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setLoading(true);

        let activeSessionId = currentSessionId;

        try {
            // Auto-create session if it's a new chat based on user input
            if (!activeSessionId) {
                const generatedTitle = generateChatTitle(sentText);
                const res = await fetch("/api/chat/sessions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ title: generatedTitle })
                });
                const data = await parseResponseJson<{ session?: ChatSession }>(res);
                if (data.session) {
                    const createdSession = data.session;
                    activeSessionId = createdSession.id;
                    setCurrentSessionId(activeSessionId);
                    setSessions(prev => [createdSession, ...prev]);
                } else {
                    throw new Error("Failed to create session");
                }
            }

            // Save User Message to DB
            if (activeSessionId) {
                await fetch(`/api/chat/sessions/${activeSessionId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        role: "user",
                        content: sentText,
                        jsonPayload: imageDataUrl || firstReport ? { image_preview: imageDataUrl || undefined, image_name: firstImage?.name, report_name: firstReport?.name } : null
                    })
                });

                // 🚀 Start progress tracking if image is being analyzed
                let progressInterval: NodeJS.Timeout | null = null;
                if (imageDataUrl) {
                    setIsAnalyzingImage(true);
                    setImageAnalysisProgress(0);
                    setAnalysisPhase("detecting");

                    progressInterval = setInterval(() => {
                        setImageAnalysisProgress(prev => {
                            if (prev < 20) {
                                setAnalysisPhase("detecting");
                                return prev + Math.random() * 3;
                            } else if (prev < 50) {
                                setAnalysisPhase("analyzing");
                                return prev + Math.random() * 2.5;
                            } else if (prev < 85) {
                                setAnalysisPhase("inferring");
                                return prev + Math.random() * 1.5;
                            } else {
                                setAnalysisPhase("results");
                                return Math.min(prev + Math.random() * 1, 99);
                            }
                        });
                    }, 300);
                }

                // 🚀 Start progress tracking if report is being analyzed
                let reportProgressInterval: NodeJS.Timeout | null = null;
                if (reportDataUrl) {
                    setIsAnalyzingReport(true);
                    setReportAnalysisProgress(0);
                    setReportAnalysisPhase("extracting");

                    reportProgressInterval = setInterval(() => {
                        setReportAnalysisProgress(prev => {
                            if (prev < 25) {
                                setReportAnalysisPhase("extracting");
                                return prev + Math.random() * 4;
                            } else if (prev < 60) {
                                setReportAnalysisPhase("analyzing");
                                return prev + Math.random() * 3;
                            } else if (prev < 85) {
                                setReportAnalysisPhase("inferring");
                                return prev + Math.random() * 2;
                            } else {
                                setReportAnalysisPhase("results");
                                return Math.min(prev + Math.random() * 1, 99);
                            }
                        });
                    }, 400);
                }

                // Check if this should trigger diagnosis flow
                // Always use diagnosis API if there's an active follow-up state
                const hasActiveFollowup = followUpActive;
                const messageLower = sentText.toLowerCase().trim();
                const diagnosisPrefixes = ["diagnose:", "predict:", "symptoms:", "symptom:"];
                const diagnosisKeywords = ["diagnose", "predict", "symptom", "symptoms", "ill", "sick", "pain", "ache", "fever", "cough", "cold"];
                const shouldDiagnose = hasActiveFollowup || diagnosisPrefixes.some(prefix => messageLower.startsWith(prefix)) ||
                    diagnosisKeywords.some(keyword => messageLower.includes(keyword));

                let data: any;

                if (shouldDiagnose) {
                    // Use diagnosis engine
                    const res = await fetch("/api/diagnose/chat/json", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-session-id": activeSessionId
                        },
                        body: JSON.stringify({
                            message: sentText,
                            session_action: action || null,
                            image_base64: imageDataUrl,
                            image_filename: firstImage?.name || null,
                            image_mime: firstImage?.type || null,
                            report_base64: reportDataUrl,
                            report_filename: firstReport?.name || null,
                            report_mime: firstReport?.type || null
                        }),
                    });

                    data = await parseResponseJson<{
                        error?: string;
                        reply?: string;
                        ml_diagnosis?: unknown;
                        follow_up_state?: unknown;
                        follow_up_suggested?: boolean;
                        follow_up_question?: string;
                        follow_up_choices?: string[] | null;
                    }>(res);

                    if (!res.ok) throw new Error(data.error || "Failed to fetch ML response");
                } else {
                    // Use normal conversation API
                    const res = await fetch("/api/conversation/chat/json", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-session-id": activeSessionId
                        },
                        body: JSON.stringify({
                            message: sentText,
                            session_action: action || null,
                            image_base64: imageDataUrl,
                            image_filename: firstImage?.name || null,
                            image_mime: firstImage?.type || null
                        }),
                    });

                    data = await parseResponseJson<{
                        error?: string;
                        reply?: string;
                        is_diagnosis_suggestion?: boolean;
                        source?: string;
                    }>(res);

                    if (!res.ok) throw new Error(data.error || "Failed to fetch conversation response");
                }

                // 🎯 Complete progress bar if image was analyzed
                if (progressInterval) {
                    clearInterval(progressInterval);
                    setImageAnalysisProgress(100);
                    setAnalysisPhase("results");
                    await new Promise(resolve => setTimeout(resolve, 800));
                    setIsAnalyzingImage(false);
                }

                // 🎯 Complete progress bar if report was analyzed
                if (reportProgressInterval) {
                    clearInterval(reportProgressInterval);
                    setReportAnalysisProgress(100);
                    setReportAnalysisPhase("results");
                    await new Promise(resolve => setTimeout(resolve, 800));
                    setIsAnalyzingReport(false);
                }

                // 🧬 Extract symptoms from API response if diagnosis was performed
                if (shouldDiagnose && data.ml_diagnosis) {
                    const diagnosis = data.ml_diagnosis as DiagnosisPayload;
                    
                    // Extract image symptoms
                    if (diagnosis.image_prediction?.per_dataset) {
                        const imgSymptoms = diagnosis.image_prediction.per_dataset
                            .map(ds => ds.top_label_name)
                            .filter(Boolean);
                        setImageIdentifiedSymptoms(imgSymptoms);
                    }
                    
                    // Extract report symptoms
                    if (diagnosis.report_analysis?.symptoms) {
                        setReportIdentifiedSymptoms(diagnosis.report_analysis.symptoms);
                    }
                }

                // Save Assistant Message to DB
                await fetch(`/api/chat/sessions/${activeSessionId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        role: "assistant",
                        content: data.reply || "Error parsing response",
                        jsonPayload: shouldDiagnose ? (data.ml_diagnosis || data.follow_up_state || null) : null
                    })
                });

                // Fetch DB messages again to restore perfect sync
                const syncRes = await fetch(`/api/chat/sessions/${activeSessionId}/messages`);
                const syncData = await parseResponseJson<{ messages?: Message[] }>(syncRes);
                if (syncData.messages && syncData.messages.length > 0) {
                    setMessages(syncData.messages);
                }

                if (shouldDiagnose && data.follow_up_suggested) {
                    setFollowUpActive(true);
                    const statePayload = (data.follow_up_state && typeof data.follow_up_state === "object") ? data.follow_up_state as { currentQuestionId?: string } : null;
                    setFollowUpQuestionId(statePayload?.currentQuestionId || "");
                    setFollowUpQuestion(data.follow_up_question || "Please answer the follow-up question.");
                    setFollowUpChoices(Array.isArray(data.follow_up_choices) ? data.follow_up_choices : []);
                } else {
                    setFollowUpActive(false);
                    setFollowUpQuestionId("");
                    setFollowUpQuestion("");
                    setFollowUpChoices([]);
                    
                    // 🎯 Trigger popup when diagnosis is complete (no more follow-up questions)
                    if (shouldDiagnose && data.ml_diagnosis) {
                        // Small delay to allow the message to be rendered first
                        setTimeout(() => {
                            setShowDiagnosisPopup(true);
                        }, 500);
                    }
                }
            }
        } catch (err: any) {
            console.error("Chat Error:", err);
            // 🛑 Clean up progress bars on error
            setIsAnalyzingImage(false);
            setImageAnalysisProgress(0);
            setIsAnalyzingReport(false);
            setReportAnalysisProgress(0);
            const fallbackMessage = `Error: ${err?.message || "Unexpected chat error"}`;

            if (activeSessionId) {
                try {
                    await fetch(`/api/chat/sessions/${activeSessionId}/messages`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            role: "assistant",
                            content: fallbackMessage,
                            jsonPayload: null
                        })
                    });

                    const syncRes = await fetch(`/api/chat/sessions/${activeSessionId}/messages`);
                    const syncData = await parseResponseJson<{ messages?: Message[] }>(syncRes);
                    if (syncData.messages && syncData.messages.length > 0) {
                        setMessages(syncData.messages);
                    } else {
                        setMessages(prev => [...prev, {
                            id: (Date.now() + 1).toString(),
                            role: "assistant",
                            content: fallbackMessage
                        }]);
                    }
                } catch (persistErr) {
                    console.error("Failed to persist fallback assistant message:", persistErr);
                    setMessages(prev => [...prev, {
                        id: (Date.now() + 1).toString(),
                        role: "assistant",
                        content: fallbackMessage
                    }]);
                }
            } else {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: "assistant",
                    content: fallbackMessage
                }]);
            }
        } finally {
            setLoading(false);
        }
    }

    async function fetchHindiForMessage(msg: Message, allowRetry = false): Promise<boolean> {
        if (msg.role !== "assistant") return false;
        if (translatedByMessage[msg.id]) return true;
        if (!allowRetry && failedHindiPrefetchRef.current[msg.id]) return false;

        const existingRequest = inFlightHindiRequestsRef.current[msg.id];
        if (existingRequest) return existingRequest;

        const request = (async () => {
            try {
                setTranslatingByMessage((prev) => ({ ...prev, [msg.id]: true }));
                
                // If it's a diagnosis message, we want to translate the structural data too
                let textToTranslate: string = msg.content;
                let payloadObj: any = null;
                
                if (msg.jsonPayload) {
                    try {
                        const parsed = JSON.parse(msg.jsonPayload);
                        if (parsed.diagnosis || parsed.disease_info) {
                            payloadObj = parsed;
                            // Pre-process payload for translation
                            const toTranslate = {
                                diagnosis: parsed.diagnosis,
                                description: parsed.disease_info?.description,
                                precautions: parsed.disease_info?.precautions,
                                home_remedies: parsed.guidance?.home_remedies,
                                lifestyle_changes: parsed.guidance?.lifestyle_changes,
                                diet_adjustments: parsed.guidance?.diet_adjustments,
                                text_content: msg.content // Also include main text
                            };
                            textToTranslate = JSON.stringify(toTranslate);
                        }
                    } catch { /* use msg.content as fallback */ }
                }

                // ✅ USE CACHED FETCH: Translation results are cacheable for 10 minutes
                const data = await cachedFetch<{ translated_text?: string; error?: string }>(
                    "/api/diagnose/translate",
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: textToTranslate, target_lang: "hi" }),
                    },
                    10 * 60 * 1000 // Cache for 10 minutes
                );

                if (!data.translated_text && data.error) {
                    throw new Error(data.error || "Translation failed");
                }

                let finalTranslation = data.translated_text || msg.content;
                let finalPayload: DiagnosisPayload | undefined = undefined;

                if (finalTranslation.startsWith("{")) {
                    try {
                        const jsonParsed = JSON.parse(finalTranslation);
                        if (payloadObj && jsonParsed.diagnosis) {
                            // Merge translated fields back into original structural payload
                            finalPayload = {
                                ...payloadObj,
                                diagnosis: jsonParsed.diagnosis || payloadObj.diagnosis,
                                disease_info: {
                                    ...payloadObj.disease_info,
                                    description: jsonParsed.description || payloadObj.disease_info?.description,
                                    precautions: Array.isArray(jsonParsed.precautions) ? jsonParsed.precautions : payloadObj.disease_info?.precautions
                                },
                                guidance: {
                                    ...payloadObj.guidance,
                                    home_remedies: Array.isArray(jsonParsed.home_remedies) ? jsonParsed.home_remedies : payloadObj.guidance?.home_remedies,
                                    lifestyle_changes: Array.isArray(jsonParsed.lifestyle_changes) ? jsonParsed.lifestyle_changes : payloadObj.guidance?.lifestyle_changes,
                                    diet_adjustments: Array.isArray(jsonParsed.diet_adjustments) ? jsonParsed.diet_adjustments : payloadObj.guidance?.diet_adjustments,
                                }
                            };
                            finalTranslation = jsonParsed.text_content || msg.content;
                        } else if (jsonParsed.text || jsonParsed.translated_text) {
                            finalTranslation = (jsonParsed.text || jsonParsed.translated_text || finalTranslation).trim();
                        }
                    } catch { /* use as-is if invalid JSON */ }
                }

                setTranslatedByMessage((prev) => ({ 
                    ...prev, 
                    [msg.id]: { 
                        content: finalTranslation, 
                        payload: finalPayload 
                    } 
                } as any));
                
                delete failedHindiPrefetchRef.current[msg.id];
                return true;
            } catch (err) {
                failedHindiPrefetchRef.current[msg.id] = true;
                console.error("Hindi translation failed:", err);
                return false;
            } finally {
                setTranslatingByMessage((prev) => ({ ...prev, [msg.id]: false }));
                delete inFlightHindiRequestsRef.current[msg.id];
            }
        })();

        inFlightHindiRequestsRef.current[msg.id] = request;
        return request;
    }

    async function ensureHindiForMessage(msg: Message): Promise<boolean> {
        return fetchHindiForMessage(msg, true);
    }

    useEffect(() => {
        const recentAssistantMessages = messages
            .filter((msg) => msg.role === "assistant")
            .slice(-4);

        recentAssistantMessages.forEach((msg) => {
            if (translatedByMessage[msg.id]) return;
            if (msg.id in inFlightHindiRequestsRef.current) return;
            if (failedHindiPrefetchRef.current[msg.id]) return;
            void fetchHindiForMessage(msg);
        });
    }, [messages, translatedByMessage]);

    if (status === "loading") {
        return <div className="h-screen flex items-center justify-center text-slate-500 bg-white">Loading...</div>;
    }

    const filteredSessions = sessions.filter(s =>
        (s.title || "Diagnosis Chat").toLowerCase().includes(searchQuery.toLowerCase())
    );
    const panelPredictions = combinedTopPredictions(latestDiagnosis);
    const datasetPanelPredictions = panelPredictions;
    const imagePanelPredictions = latestDiagnosis?.image_prediction?.per_dataset || [];
    const panelConfidence = Math.max(0, Math.min(100, Number(latestDiagnosis?.confidence || panelPredictions[0]?.probability || 0)));
    const panelPrecautions = latestDiagnosis?.disease_info?.precautions || [];
    const panelDescription = latestDiagnosis?.disease_info?.description || "";
    const panelSymptoms = latestDiagnosis?.confirmed_symptoms || [];
    const guidance = latestDiagnosis ? DEFAULT_GUIDANCE : null;
    const panelGuidance = {
        homeRemedies: latestDiagnosis?.guidance?.home_remedies || [],
        lifestyle: latestDiagnosis?.guidance?.lifestyle_changes || [],
        diet: latestDiagnosis?.guidance?.diet_adjustments || [],
    };
    const homeRemedyItems = panelGuidance.homeRemedies.length > 0
        ? panelGuidance.homeRemedies
        : (panelPrecautions.length > 0 ? panelPrecautions.slice(0, 3) : guidance?.homeRemedies || []);
    const lifestyleItems = panelGuidance.lifestyle.length > 0
        ? panelGuidance.lifestyle
        : (guidance?.lifestyle || []);
    const dietItems = panelGuidance.diet.length > 0
        ? panelGuidance.diet
        : (guidance?.diet || []);

    return (
        <div className="flex h-screen bg-white overflow-hidden font-sans pt-[64px]">

            {/* Sidebar ChatGPT Style */}
            <aside className={`${sidebarOpen ? 'w-[260px]' : 'w-0'} transition-all duration-300 flex-shrink-0 bg-[#f9f9f9] border-r border-[#e5e5e5] flex flex-col overflow-hidden hidden md:flex relative group`}>
                <div className="p-3 flex items-center justify-between">
                    <Button
                        onClick={handleNewChat}
                        variant="ghost"
                        className="w-[calc(100%-36px)] justify-start gap-2 text-[14px] hover:bg-[#ececec] text-[#0f0f0f] font-medium h-10 px-3"
                    >
                        <div className="w-6 h-6 rounded-full bg-white border border-[#e5e5e5] flex items-center justify-center shrink-0 shadow-sm mr-1">
                            <Activity className="w-3.5 h-3.5 text-black" />
                        </div>
                        New chat
                        <div className="ml-auto">
                            <PlusSquare className="w-4 h-4 text-slate-500 opacity-70" />
                        </div>
                    </Button>
                    <Button
                        onClick={() => setSidebarOpen(false)}
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#ececec]"
                        title="Close sidebar"
                    >
                        <Menu className="w-4 h-4 text-slate-500" />
                    </Button>
                </div>

                <div className="px-3 mt-1 relative">
                    <Search className="w-3.5 h-3.5 absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search chats..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-8 pl-8 pr-3 text-[13px] bg-[#ececec] border-transparent rounded-md focus:outline-none focus:ring-1 focus:ring-[#d4d4d4] focus:bg-white transition-all text-[#0f0f0f] placeholder:text-slate-500"
                    />
                </div>

                <div className="mt-2 flex-1 overflow-y-auto px-3 pb-4">
                    <div className="text-[11px] font-semibold text-[#8e8e8e] mt-4 mb-2 px-2 uppercase tracking-wider">Recent</div>
                    <div className="space-y-0.5 mt-1">
                        {filteredSessions.map(s => (
                            <div
                                key={s.id}
                                className={`w-full px-2 py-1 rounded-md text-[13.5px] transition-colors flex items-center gap-2 ${currentSessionId === s.id ? 'bg-[#ececec] text-[#0f0f0f] font-medium' : 'text-[#4d4d4d] hover:bg-[#f1f1f1]'}`}
                            >
                                <button
                                    onClick={() => loadSession(s.id)}
                                    className="flex-1 min-w-0 text-left px-1 py-1"
                                    title={s.title || "Diagnosis Chat"}
                                >
                                    <span className="truncate block font-medium w-full text-left">{s.title || "Diagnosis Chat"}</span>
                                </button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-slate-500 hover:text-red-600 hover:bg-red-50"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        deleteSession(s.id);
                                    }}
                                    disabled={deletingSessionId === s.id}
                                    title="Delete chat"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </aside >

            {/* Main Chat Area */}
            < main className="flex-1 flex flex-col h-full relative bg-white min-w-0" >

                {/* Desktop Open Sidebar Button */}
                {
                    !sidebarOpen && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSidebarOpen(true)}
                            className="absolute top-3 left-3 z-20 hidden md:flex text-slate-600 hover:bg-[#f4f4f4]"
                            title="Open sidebar"
                        >
                            <Menu className="w-5 h-5" />
                        </Button>
                    )
                }

                {/* Mobile Header */}
                <header className="h-14 border-b border-[#e5e5e5] flex items-center px-4 md:hidden bg-white shrink-0 sticky top-0 z-10 transition-shadow">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMobilePanel((prev) => (prev === "history" ? "none" : "history"))}
                        title="Open chat history"
                    >
                        <Menu className="w-5 h-5 text-slate-800" />
                    </Button>
                    <span className="ml-3 font-semibold text-slate-900">MedCoreAI</span>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto mr-1 text-[12px] px-2.5 h-8 border border-[#e5e5e5] rounded-full"
                        onClick={() => setMobilePanel((prev) => (prev === "prediction" ? "none" : "prediction"))}
                    >
                        Results
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                            setMobilePanel("none");
                            handleNewChat();
                        }}
                    >
                        <PlusSquare className="w-5 h-5 text-slate-800" />
                    </Button>
                </header>

                {/* Mobile Panels (History + Prediction) */}
                {mobilePanel !== "none" ? (
                    <div className="md:hidden absolute inset-x-0 top-14 bottom-0 z-20 bg-white border-b border-[#e5e5e5] overflow-y-auto">
                        {mobilePanel === "history" ? (
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-sm font-semibold text-slate-800">Chat History</div>
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMobilePanel("none")}>
                                        Close
                                    </Button>
                                </div>

                                <div className="relative mb-3">
                                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search chats..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full h-9 pl-8 pr-3 text-[13px] bg-[#ececec] border-transparent rounded-md focus:outline-none focus:ring-1 focus:ring-[#d4d4d4] focus:bg-white transition-all text-[#0f0f0f] placeholder:text-slate-500"
                                    />
                                </div>

                                <div className="space-y-1">
                                    {filteredSessions.length === 0 ? (
                                        <div className="text-xs text-slate-500">No chats yet. Start a new conversation.</div>
                                    ) : (
                                        filteredSessions.map((s) => (
                                            <div
                                                key={s.id}
                                                className={`w-full px-2 py-1 rounded-md text-[13.5px] transition-colors flex items-center gap-2 ${currentSessionId === s.id ? "bg-[#ececec] text-[#0f0f0f] font-medium" : "text-[#4d4d4d] hover:bg-[#f1f1f1]"}`}
                                            >
                                                <button
                                                    onClick={() => {
                                                        loadSession(s.id);
                                                        setMobilePanel("none");
                                                    }}
                                                    className="flex-1 min-w-0 text-left px-1 py-1"
                                                    title={s.title || "Diagnosis Chat"}
                                                >
                                                    <span className="truncate block font-medium w-full text-left">{s.title || "Diagnosis Chat"}</span>
                                                </button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-slate-500 hover:text-red-600 hover:bg-red-50"
                                                    onClick={(e: React.MouseEvent) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        deleteSession(s.id);
                                                    }}
                                                    disabled={deletingSessionId === s.id}
                                                    title="Delete chat"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-semibold text-slate-800">Prediction Panel</div>
                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMobilePanel("none")}>
                                        Close
                                    </Button>
                                </div>

                                {!latestDiagnosis ? (
                                    <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4 text-sm text-slate-600">
                                        Diagnosis results will appear here after follow-up completes.
                                    </div>
                                ) : (
                                    <>
                                        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-4 med-lift med-fade-up">
                                            <div className="text-[11px] uppercase tracking-wider text-slate-300">Likely condition</div>
                                            <div className="text-lg font-semibold mt-1">{labelize(latestDiagnosis.diagnosis)}</div>
                                            <div className="text-xs text-slate-300 mt-1">Confidence: {panelConfidence.toFixed(1)}%</div>
                                        </div>
                                        {latestUploadedImage ? (
                                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">Uploaded Medical Image</div>
                                                <img
                                                    src={latestUploadedImage.preview}
                                                    alt={latestUploadedImage.name || "Uploaded medical image"}
                                                    className="w-full max-h-64 object-contain rounded-xl border border-slate-200"
                                                />
                                            </div>
                                        ) : null}

                                        <div className="rounded-2xl border border-slate-200 bg-white p-4 med-lift med-fade-up">
                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-3">Top Predictions</div>
                                            <div className="space-y-2.5">
                                                {(panelPredictions.slice(0, 5)).map((pred: { disease: string; probability: number }) => (
                                                    <div key={pred.disease}>
                                                        <div className="flex items-center justify-between text-[12px] mb-1">
                                                            <span className="font-medium text-slate-700">{labelize(pred.disease)}</span>
                                                            <span className="text-slate-500">{pred.probability.toFixed(1)}%</span>
                                                        </div>
                                                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                                            <div className="h-full rounded-full bg-gradient-to-r from-slate-700 to-slate-500" style={{ width: `${pred.probability}%` }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Explanation</div>
                                            <p className="text-[13px] text-slate-700 leading-relaxed">
                                                {panelDescription || "The prediction is estimated from symptom patterns in the dataset and your follow-up responses."}
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 med-lift med-fade-up">
                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-800 mb-2">Home Remedies</div>
                                            <ul className="space-y-2 text-[13px] text-slate-700">
                                                {homeRemedyItems.map((item, idx) => (
                                                    <li key={`${item}-${idx}`} className="leading-relaxed flex items-start gap-2">
                                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 med-lift med-fade-up">
                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-800 mb-2">Lifestyle Changes</div>
                                            <ul className="space-y-2 text-[13px] text-slate-700">
                                                {lifestyleItems.map((item, idx) => (
                                                    <li key={`${item}-${idx}`} className="leading-relaxed flex items-start gap-2">
                                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 med-lift med-fade-up">
                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-800 mb-2">Diet Adjustments</div>
                                            <ul className="space-y-2 text-[13px] text-slate-700">
                                                {dietItems.map((item, idx) => (
                                                    <li key={`${item}-${idx}`} className="leading-relaxed flex items-start gap-2">
                                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
                                                        <span>{item}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                ) : null}

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth font-sans">
                    <div className="max-w-3xl mx-auto w-full">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 text-slate-700 px-4 py-2.5 text-[12px] md:text-[13px] med-fade-up">
                            {DIAGNOSIS_TRIGGER_HELP}
                        </div>
                    </div>

                    {messages.length === 0 && !loading ? (
                        <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center px-4 animate-in fade-in duration-500">
                            <div className="w-16 h-16 rounded-2xl bg-[#0f0f0f] text-white flex items-center justify-center shadow-md mb-6">
                                <Activity className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-medium text-[#0f0f0f] mb-2">Hello! I am MedCoreAI</h2>
                            <p className="text-sm text-[#666666] mb-8">Welcome to your healthcare companion. I can help you with general conversations as well as medical diagnosis assistance.</p>

                            {/* Prompt Chips */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                                <Button variant="outline" className="h-auto py-3 px-4 justify-start text-left rounded-xl border-[#e5e5e5] hover:bg-[#f9f9f9] transition-colors" onClick={() => setInput("Evaluate my symptoms.")}>
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-sm font-medium text-[#0f0f0f]">Symptom Evaluation</span>
                                        <span className="text-xs text-[#8e8e8e]">Get preliminary AI diagnosis</span>
                                    </div>
                                </Button>
                                <Button variant="outline" className="h-auto py-3 px-4 justify-start text-left rounded-xl border-[#e5e5e5] hover:bg-[#f9f9f9] transition-colors" onClick={() => setInput("What precautions should I take for stomach pain?")}>
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-sm font-medium text-[#0f0f0f]">Health Precautions</span>
                                        <span className="text-xs text-[#8e8e8e]">Learn to manage conditions</span>
                                    </div>
                                </Button>
                                <Button variant="outline" className="h-auto py-3 px-4 justify-start text-left rounded-xl border-[#e5e5e5] hover:bg-[#f9f9f9] transition-colors" onClick={() => setInput("Give me a healthy list of dietary habits.")}>
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-sm font-medium text-[#0f0f0f]">Dietary Habits</span>
                                        <span className="text-xs text-[#8e8e8e]">Improve your daily lifestyle</span>
                                    </div>
                                </Button>
                                <Button variant="outline" className="h-auto py-3 px-4 justify-start text-left rounded-xl border-[#e5e5e5] hover:bg-[#f9f9f9] transition-colors" onClick={() => setInput("Explain common medical terminology.")}>
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-sm font-medium text-[#0f0f0f]">Understand Reports</span>
                                        <span className="text-xs text-[#8e8e8e]">Decode medical jargon</span>
                                    </div>
                                </Button>
                            </div>
                            
                            <div className="mt-6 text-xs text-[#8e8e8e]">
                                Start your message with "diagnose:" or "predict:" to begin diagnosis. Example: "diagnose: I have a fever"
                            </div>
                        </div>
                    ) : (
                        <div className="w-full flex flex-col space-y-6">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex max-w-3xl mx-auto w-full group med-fade-up ${msg.role === "user" ? "justify-end" : "justify-start"} px-2 md:px-0`}>
                                    {/* Assistant Avatar */}
                                    {msg.role === "assistant" && (
                                        <div className="shrink-0 mr-4 mt-1">
                                            <div className="w-[30px] h-[30px] rounded-full border border-[#e5e5e5] flex items-center justify-center shadow-sm bg-white">
                                                <Activity className="w-4 h-4 text-black" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Message Content */}
                                    <div className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} min-w-0 ${msg.role === "user" ? 'max-w-[85%] md:max-w-[75%]' : 'max-w-full'}`}>

                                        {msg.role === "assistant" && (
                                            <div className="w-full flex items-center gap-2 font-semibold text-slate-800 text-[13px] mb-1.5 px-1 tracking-tight">
                                                <span>MedCoreAI</span>
                                                <button
                                                    type="button"
                                                    className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex items-center justify-center min-w-[50px] ${hindiByMessage[msg.id] ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"}`}
                                                    onClick={async () => {
                                                        const isHindiEnabled = !!hindiByMessage[msg.id];
                                                        if (isHindiEnabled) {
                                                            setHindiByMessage((prev) => ({ ...prev, [msg.id]: false }));
                                                            return;
                                                        }
                                                        const translated = await ensureHindiForMessage(msg);
                                                        setHindiByMessage((prev) => ({ ...prev, [msg.id]: translated }));
                                                    }}
                                                >
                                                    {translatingByMessage[msg.id] ? <PremiumHindiLoader /> : (hindiByMessage[msg.id] ? "Hindi - On" : "Hindi")}
                                                </button>
                                            </div>
                                        )}

                                        {msg.role === "user" ? (
                                            <div className="bg-slate-100 text-[15px] leading-relaxed text-[#0f0f0f] px-5 py-2.5 rounded-2xl rounded-tr-md border border-slate-200">
                                                <div className="whitespace-pre-wrap">{msg.content}</div>
                                                {msg.jsonPayload && (() => {
                                                    try {
                                                        const payload = JSON.parse(msg.jsonPayload) as UserMessagePayload;
                                                        let hasAttachment = false;
                                                        
                                                        // Show image preview if available
                                                        if (payload.image_preview) {
                                                            hasAttachment = true;
                                                            return (
                                                                <div className="mt-2">
                                                                    <img
                                                                        src={payload.image_preview}
                                                                        alt={payload.image_name || "Uploaded medical image"}
                                                                        className="max-h-56 w-auto rounded-xl border border-slate-300"
                                                                    />
                                                                </div>
                                                            );
                                                        }
                                                        
                                                        // Show report preview link if available
                                                        if (payload.report_preview || payload.report_name) {
                                                            hasAttachment = true;
                                                            return (
                                                                <div className="mt-2 flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-300">
                                                                    <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                                                                        <FileText className="w-5 h-5 text-red-600" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="text-sm font-medium text-slate-800 truncate">
                                                                            {payload.report_name || "Uploaded Report"}
                                                                        </div>
                                                                        <div className="text-xs text-slate-500">PDF Document</div>
                                                                    </div>
                                                                    {payload.report_preview && (
                                                                        <a
                                                                            href={payload.report_preview}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
                                                                        >
                                                                            View PDF
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            );
                                                        }
                                                        
                                                        return null;
                                                    } catch {
                                                        return null;
                                                    }
                                                })()}
                                            </div>
                                        ) : (
                                            <div className="text-[15px] leading-relaxed text-[#0f0f0f] whitespace-pre-wrap prose prose-slate prose-sm max-w-none w-full border-none shadow-none">
                                                {(() => {
                                                    const hindiData = translatedByMessage[msg.id] as any;
                                                    const isHindi = !!hindiByMessage[msg.id];
                                                    
                                                    const renderedText = (isHindi && hindiData ? hindiData.content : normalizeBrandName(msg.content));
                                                    
                                                    let diagnosisPayload: DiagnosisPayload | null = null;
                                                    try {
                                                        if (isHindi && hindiData?.payload) {
                                                            diagnosisPayload = hindiData.payload;
                                                        } else if (msg.jsonPayload) {
                                                            const parsed = JSON.parse(msg.jsonPayload) as DiagnosisPayload;
                                                            if (parsed?.diagnosis) diagnosisPayload = parsed;
                                                        }
                                                    } catch (e) {
                                                        console.error("Failed to parse ML Payload:", e);
                                                    }

                                                    if (!diagnosisPayload) {
                                                        return renderedText.split("**").map((text: string, i: number) => (
                                                            i % 2 === 1 ? <strong key={i} className="font-semibold text-black">{text}</strong> : text
                                                        ));
                                                    }

                                                    const symptoms = diagnosisPayload.confirmed_symptoms || [];
                                                    const precautions = diagnosisPayload.disease_info?.precautions || [];
                                                    const description = diagnosisPayload.disease_info?.description || renderedText;
                                                    const gender = diagnosisPayload.demographics?.gender || "unknown";
                                                    const ageGroup = diagnosisPayload.demographics?.age_group || "unknown";
                                                    const confidence = Number(diagnosisPayload.confidence || 0);

                                                    return (
                                                        <div className="not-prose mt-1 space-y-3 max-w-2xl">
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                                                                    <div className="flex items-center gap-2 text-slate-700 text-[11px] uppercase tracking-wider font-semibold">
                                                                        <Circle className="w-3.5 h-3.5" /> {isHindi ? "संभावित स्थिति" : "Likely Condition"}
                                                                    </div>
                                                                    <div className="text-[17px] font-semibold text-slate-900 mt-2">{labelize(diagnosisPayload.diagnosis)}</div>
                                                                    <div className="text-[13px] text-slate-600 mt-1">{isHindi ? "विश्वास:" : "Confidence:"} {confidence.toFixed(1)}%</div>
                                                                </div>
                                                                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                                                                    <div className="flex items-center gap-2 text-slate-700 text-[11px] uppercase tracking-wider font-semibold">
                                                                        <Square className="w-3.5 h-3.5" /> {isHindi ? "लक्षण और संदर्भ" : "Symptoms And Context"}
                                                                    </div>
                                                                    <div className="text-[13px] text-slate-700 mt-2">
                                                                        <div><span className="font-semibold">{isHindi ? "लक्षण:" : "Symptoms:"}</span> {symptoms.length > 0 ? symptoms.map((s: string) => isHindi ? s : labelize(s)).join(", ") : (isHindi ? "अभी तक कोई स्पष्ट लक्षण नहीं मिले हैं।" : "No clear symptoms captured yet.")}</div>
                                                                        <div className="mt-1"><span className="font-semibold">{isHindi ? "प्रोफ़ाइल:" : "Profile:"}</span> {isHindi ? gender : labelize(String(gender))}, {isHindi ? ageGroup : labelize(String(ageGroup))}</div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                                                <div className="text-[11px] uppercase tracking-wider text-slate-600 font-semibold">{isHindi ? "इसका क्या मतलब है" : "What This Means"}</div>
                                                                <div className="text-[13px] text-slate-700 mt-2 leading-relaxed">{description}</div>
                                                            </div>

                                                            {precautions.length > 0 ? (
                                                                <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                                                                    <div className="flex items-center gap-2 text-slate-700 text-[11px] uppercase tracking-wider font-semibold">
                                                                        <ShieldCheck className="w-3.5 h-3.5" /> Self-Care Steps
                                                                    </div>
                                                                    <ul className="mt-2 space-y-1.5 text-[13px] text-slate-700">
                                                                        {precautions.slice(0, 6).map((item: string, idx: number) => (
                                                                            <li key={`${item}-${idx}`} className="flex items-start gap-2">
                                                                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-600 shrink-0" />
                                                                                <span>{item}</span>
                                                                            </li>
                                                                        ))}
                                                                    </ul>
                                                                </div>
                                                            ) : null}

                                                                                                                         {/* Unified Text Model Signals Card */}
                                                             {(() => {
                                                                 const textPredictions = combinedTopPredictions(diagnosisPayload);
                                                                 if (textPredictions.length > 0) {
                                                                     return (
                                                                         <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                                                                             <div className="flex items-center gap-2 text-slate-700 text-[11px] uppercase tracking-wider font-semibold mb-3">
                                                                                 <Activity className="w-3.5 h-3.5" /> Dataset Prediction Chart
                                                                             </div>
                                                                             <div className="space-y-1">
                                                                                 {textPredictions.map((pred, idx) => (
                                                                                     <AnimatedProgress
                                                                                         key={pred.disease}
                                                                                         label={pred.disease}
                                                                                         percentage={pred.probability}
                                                                                         delay={idx * 150}
                                                                                     />
                                                                                 ))}
                                                                             </div>
                                                                         </div>
                                                                     );
                                                                 }
                                                                 return null;
                                                             })()}

                                                             <div className="text-[11px] text-slate-500">This is informational only and not a final medical diagnosis.</div>
                                                        </div>
                                                    );
                                                })()}

                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {loading && (
                                <div className="flex justify-start max-w-3xl mx-auto w-full group px-2 md:px-0 flex-col">
                                    {/* Image Analysis Progress Bar - Shows in message flow */}
                                    {isAnalyzingImage && (
                                        <div className="mb-6">
                                            <ImageAnalysisProgressBar
                                                progress={imageAnalysisProgress}
                                                phase={analysisPhase}
                                                isVisible={isAnalyzingImage}
                                            />
                                        </div>
                                    )}

                                    {/* Report Analysis Progress Bar - Shows in message flow */}
                                    {isAnalyzingReport && (
                                        <div className="mb-6">
                                            <ReportAnalysisProgressBar
                                                progress={reportAnalysisProgress}
                                                phase={reportAnalysisPhase}
                                                isVisible={isAnalyzingReport}
                                            />
                                        </div>
                                    )}

                                    {/* Standard MedCoreAI thinking indicator */}
                                    <div className="flex items-start gap-4">
                                        <div className="shrink-0 mr-0 mt-1">
                                            <div className="w-[30px] h-[30px] rounded-full border border-[#e5e5e5] bg-white flex items-center justify-center shadow-sm">
                                                <Activity className="w-4 h-4 text-black animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-start min-w-0">
                                            <div className="font-semibold text-slate-800 text-[13px] mb-1.5 px-1 tracking-tight">MedCoreAI</div>
                                            <div className="flex items-center gap-1.5 h-6">
                                                <span className="w-1.5 h-1.5 bg-[#d1d5db] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                                <span className="w-1.5 h-1.5 bg-[#d1d5db] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                                <span className="w-1.5 h-1.5 bg-[#d1d5db] rounded-full animate-bounce"></span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Main Input Area - Floating ChatGPT Style */}
                <div className="shrink-0 pt-2 pb-6 px-4 md:px-8 bg-white w-full border-t border-slate-100">
                    <div className="max-w-3xl mx-auto w-full">
                        <div className="bg-slate-50 rounded-[24px] border border-slate-200 hover:border-slate-300 shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-slate-300 transition-all flex flex-col med-lift">
                            {followUpActive ? (
                                <div className="p-3 bg-white flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-[#e5e5e5]">
                                    <span className="text-[13px] font-medium text-slate-600 flex items-center gap-2">
                                        <Info className="w-4 h-4" /> {followUpQuestion || "Please verify this symptom"}
                                    </span>
                                    <div className="flex flex-wrap gap-2">
                                        {followUpChoices.length > 0 ? (
                                            followUpChoices.map((choice) => (
                                                <Button
                                                    key={choice}
                                                    size="sm"
                                                    variant={choice === "upload" ? "default" : "outline"}
                                                    className={choice === "upload" ? "h-8 text-xs rounded-full bg-blue-600 hover:bg-blue-700 text-white" : "h-8 text-xs rounded-full bg-white border-[#e5e5e5] capitalize"}
                                                    onClick={() => {
                                                        // ✅ Special handling for "upload" choice - trigger file picker
                                                        if (choice === "upload") {
                                                            if (followUpQuestionId === "report_upload") {
                                                                reportInputRef.current?.click();
                                                            } else {
                                                                imageInputRef.current?.click();
                                                            }
                                                        } else {
                                                            sendMessage(choice, "custom");
                                                        }
                                                    }}
                                                    disabled={loading}
                                                >
                                                    {choice.replace(/_/g, " ").charAt(0).toUpperCase() + choice.replace(/_/g, " ").slice(1)}
                                                </Button>
                                            ))
                                        ) : (
                                            <>
                                                <Button size="sm" className="bg-black hover:bg-black/80 text-white w-16 h-8 text-xs rounded-full" onClick={() => sendMessage("", "yes")} disabled={loading}>Yes</Button>
                                                <Button size="sm" variant="outline" className="w-16 h-8 text-xs rounded-full bg-white border-[#e5e5e5]" onClick={() => sendMessage("", "no")} disabled={loading}>No</Button>
                                            </>
                                        )}

                                    </div>
                                </div>
                            ) : null}

                            {attachments.length > 0 ? (
                                <div className="px-3 pt-3 flex flex-wrap gap-2">
                                    {attachments.map((file, index) => (
                                        <div
                                            key={`${file.name}-${index}`}
                                            className="flex items-center gap-2 rounded-full border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm"
                                        >
                                            <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                                            <span className="max-w-[220px] truncate">{file.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeAttachment(index)}
                                                className="rounded-full p-0.5 text-slate-500 hover:text-slate-800"
                                                aria-label="Remove attachment"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    sendMessage(input, followUpActive ? "custom" : undefined);
                                }}
                                className="flex items-end gap-2 p-2.5"
                            >
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => {
                                        handleFileAdd(e.target.files);
                                        e.currentTarget.value = "";
                                    }}
                                />
                                <input
                                    ref={reportInputRef}
                                    type="file"
                                    accept=".pdf,.txt,.csv,.png,.jpg,.jpeg,.webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        handleFileAdd(e.target.files);
                                        e.currentTarget.value = "";
                                    }}
                                />
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="outline"
                                            className="h-9 w-9 rounded-full border-[#e5e5e5] bg-white text-slate-600 hover:bg-[#f7f7f7]"
                                            aria-label="Add attachment"
                                        >
                                            <PlusSquare className="w-4 h-4" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" className="w-56 p-2">
                                        <div className="text-[11px] uppercase tracking-wide text-slate-500 px-2 pb-1">Upload</div>
                                        <button
                                            type="button"
                                            onClick={() => imageInputRef.current?.click()}
                                            className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                        >
                                            <ImageIcon className="w-4 h-4" />
                                            Upload image
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => reportInputRef.current?.click()}
                                            className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100"
                                        >
                                            <FileText className="w-4 h-4" />
                                            Upload reports
                                        </button>
                                    </PopoverContent>
                                </Popover>
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder={loading ? "MedCoreAI is thinking..." : "Message MedCoreAI... (use diagnose: to start diagnosis)"}
                                    disabled={loading}
                                    className="flex-1 bg-transparent border-0 shadow-none focus-visible:outline-none focus:ring-0 min-h-[40px] max-h-[200px] resize-none text-[15px] pt-2 px-3 w-full placeholder:text-slate-500 text-black overflow-y-auto"
                                    rows={1}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            sendMessage(input, followUpActive ? "custom" : undefined);
                                        }
                                    }}
                                />
                                <div className="mb-0.5 mr-0.5 ml-2 mt-auto shrink-0">
                                    <Button
                                        type="submit"
                                        disabled={loading || !input.trim()}
                                        size="icon"
                                        className={`h-[32px] w-[32px] rounded-full transition-all ${input.trim() ? 'bg-black text-white' : 'bg-[#e5e5e5] text-white cursor-not-allowed'}`}
                                    >
                                        <Send className="w-3.5 h-3.5 ml-0.5" />
                                    </Button>
                                </div>
                            </form>
                        </div>
                        <div className="text-center mt-2.5 text-[11px] text-[#8e8e8e]">
                            MedCoreAI can make mistakes. Consider verifying important information.
                        </div>
                    </div>
                </div>
            </main >

            {/* Right Result Panel */}
            <aside className="hidden lg:flex h-full border-l border-[#e5e5e5] bg-[#fafafa]">
                {!latestDiagnosis ? (
                    <div className="w-[340px] p-5 flex flex-col justify-center items-center text-center text-slate-500">
                        <div className="w-11 h-11 rounded-xl bg-white border border-[#e5e5e5] flex items-center justify-center mb-3">
                            <Activity className="w-5 h-5 text-slate-600" />
                        </div>
                        <div className="text-sm font-semibold text-slate-700">Prediction Panel</div>
                        <p className="text-xs mt-2 leading-relaxed max-w-[260px]">
                            After diagnosis, detailed results with charts, home remedies, lifestyle, and diet guidance will appear here.
                        </p>
                    </div>
                ) : resultPanelMinimized ? (
                    <div className="w-14 p-2 flex flex-col items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-full border border-[#e5e5e5] bg-white"
                            onClick={() => setResultPanelMinimized(false)}
                            title="Expand results panel"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                    </div>
                ) : (
                    <div className="w-[340px] h-full overflow-y-auto p-4 space-y-4">
                        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-4 med-lift med-fade-up">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[11px] uppercase tracking-wider text-slate-300">Likely condition</div>
                                    <div className="text-lg font-semibold mt-1">{labelize(latestDiagnosis.diagnosis)}</div>
                                    <div className="text-xs text-slate-300 mt-1">Confidence: {panelConfidence.toFixed(1)}%</div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white"
                                    onClick={() => setResultPanelMinimized(true)}
                                    title="Minimize results panel"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                            <div className="mt-4 flex items-center gap-4">
                                <div
                                    className="h-16 w-16 rounded-full grid place-items-center text-xs font-semibold"
                                    style={{ background: `conic-gradient(#334155 ${panelConfidence}%, #94a3b8 ${panelConfidence}% 100%)` }}
                                >
                                    <div className="h-12 w-12 rounded-full bg-slate-900 grid place-items-center med-ring-pulse">{Math.round(panelConfidence)}%</div>
                                </div>
                                <div className="text-xs text-slate-300 leading-relaxed">
                                    Model confidence gauge based on your confirmed symptoms and follow-up responses.
                                </div>
                            </div>
                        </div>
                        {latestUploadedImage ? (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 med-lift med-fade-up">
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-3">Uploaded Medical Image</div>
                                <img
                                    src={latestUploadedImage.preview}
                                    alt={latestUploadedImage.name || "Uploaded medical image"}
                                    className="w-full max-h-72 object-contain rounded-xl border border-slate-200"
                                />
                            </div>
                        ) : null}

                        {latestUploadedReport ? (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 med-lift med-fade-up">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">Uploaded Report</div>
                                    <FileText className="w-4 h-4 text-slate-500" />
                                </div>
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                                    <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                                        <FileText className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-800 truncate">{latestUploadedReport.name}</div>
                                        <div className="text-xs text-slate-500">PDF Document</div>
                                    </div>
                                    {latestUploadedReport.preview && (
                                        <a
                                            href={latestUploadedReport.preview}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                                        >
                                            View
                                        </a>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        {(imageIdentifiedSymptoms.length > 0 || reportIdentifiedSymptoms.length > 0) ? (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 med-lift med-fade-up">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-lg bg-green-100 flex items-center justify-center">
                                        <Activity className="w-3.5 h-3.5 text-green-600" />
                                    </div>
                                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">Symptoms Identified So Far</div>
                                </div>
                                <div className="space-y-3">
                                    {imageIdentifiedSymptoms.length > 0 && (
                                        <div>
                                            <div className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wide">From Image Analysis</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {imageIdentifiedSymptoms.map((symptom, idx) => (
                                                    <span key={`img-${idx}`} className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                                        {labelize(symptom)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {reportIdentifiedSymptoms.length > 0 && (
                                        <div>
                                            <div className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wide">From Report Analysis</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {reportIdentifiedSymptoms.map((symptom, idx) => (
                                                    <span key={`rep-${idx}`} className="text-[11px] px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                                                        {labelize(symptom)}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : null}

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 med-lift med-fade-up">
                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-700 mb-3">Dataset Prediction Chart</div>
                            <div className="space-y-2.5">
                                {(datasetPanelPredictions.slice(0, 5)).map((pred) => (
                                    <div key={pred.disease}>
                                        <div className="flex items-center justify-between text-[12px] mb-1">
                                            <span className="font-medium text-slate-700">{labelize(pred.disease)}</span>
                                            <span className="text-slate-500">{pred.probability.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-slate-700 to-slate-500" style={{ width: `${pred.probability}%` }} />
                                        </div>
                                    </div>
                                ))}
                                {datasetPanelPredictions.length === 0 ? (
                                    <div className="text-[12px] text-slate-500">Dataset prediction chart unavailable.</div>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4 med-lift med-fade-up">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-6 w-6 rounded-lg bg-slate-100 text-slate-700 grid place-items-center">
                                    <Sparkles className="w-3.5 h-3.5" />
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Explanation</div>
                            </div>
                            <p className="text-[13px] text-slate-700 leading-relaxed">
                                {panelDescription || "The prediction is estimated from symptom patterns in the dataset and your follow-up responses."}
                            </p>
                            {panelSymptoms.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {panelSymptoms.map((symptom) => (
                                        <span key={symptom} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                                            {labelize(symptom)}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 med-lift med-fade-up">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-6 w-6 rounded-lg bg-slate-100 text-slate-700 grid place-items-center">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-800">Home Remedies</div>
                            </div>
                            <ul className="space-y-3 text-[13px] text-slate-700">
                                {homeRemedyItems.map((item, idx) => (
                                    <ImageTip key={`${item}-${idx}`} text={item} />
                                ))}
                            </ul>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 med-lift med-fade-up">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-6 w-6 rounded-lg bg-slate-100 text-slate-700 grid place-items-center">
                                    <HeartPulse className="w-3.5 h-3.5" />
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-800">Lifestyle Changes</div>
                            </div>
                            <ul className="space-y-3 text-[13px] text-slate-700">
                                {lifestyleItems.map((item, idx) => (
                                    <ImageTip key={`${item}-${idx}`} text={item} />
                                ))}
                            </ul>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 mb-4 med-lift med-fade-up">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-6 w-6 rounded-lg bg-slate-100 text-slate-700 grid place-items-center">
                                    <Apple className="w-3.5 h-3.5" />
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-800">Diet Adjustments</div>
                            </div>
                            <ul className="space-y-3 text-[13px] text-slate-700">
                                {dietItems.map((item, idx) => (
                                    <ImageTip key={`${item}-${idx}`} text={item} />
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </aside>

            {/* Diagnosis Result Popup Modal */}
            <DiagnosisResultPopup
                isOpen={showDiagnosisPopup}
                onClose={() => setShowDiagnosisPopup(false)}
                diagnosis={latestDiagnosis}
                uploadedReport={latestUploadedReport}
                uploadedImage={latestUploadedImage || undefined}
                imageIdentifiedSymptoms={imageIdentifiedSymptoms}
                reportIdentifiedSymptoms={reportIdentifiedSymptoms}
            />
        </div >
    );
}

