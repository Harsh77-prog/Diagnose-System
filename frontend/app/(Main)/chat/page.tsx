"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Send, Activity, Info, Menu, PlusSquare, Search, Trash2, ChevronLeft, ChevronRight, ShieldCheck, Sparkles, HeartPulse, Apple } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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
};

type FollowupStatePayload = {
    kind?: "followup_state";
    pending?: boolean;
    currentQuestionText?: string;
    currentQuestionChoices?: string[];
};

type DiagnosisPayload = {
    diagnosis: string;
    confidence?: number;
    source?: "dataset_current_session" | "api_fallback" | string;
    comparison?: {
        dataset?: { diagnosis?: string; confidence?: number; top_predictions?: { disease: string; probability: number }[] };
        openai?: { diagnosis?: string; confidence?: number; top_predictions?: { disease: string; probability: number }[] } | null;
    };
    top_predictions?: { disease: string; probability: number }[];
    confirmed_symptoms?: string[];
    disease_info?: {
        description?: string;
        precautions?: string[];
    };
};

function labelize(text: string): string {
    return text.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

function guidanceForDiagnosis(diagnosis: string) {
    const normalized = diagnosis.toLowerCase();

    if (/(flu|cold|viral|fever)/.test(normalized)) {
        return {
            homeRemedies: [
                "Warm fluids, soups, and hydration throughout the day.",
                "Steam inhalation once or twice daily for congestion relief.",
                "Salt-water gargle for throat irritation.",
            ],
            lifestyle: [
                "Take full rest and avoid intense physical activity.",
                "Monitor temperature every 6-8 hours.",
                "Use separate utensils/towels to reduce spread at home.",
            ],
            diet: [
                "Soft warm foods (khichdi, soups, oatmeal).",
                "Vitamin-C rich foods (citrus, guava, amla).",
                "Avoid fried, packaged, and very cold food/drinks.",
            ],
        };
    }

    if (/(gastr|stomach|acidity|indigestion|diarrhea)/.test(normalized)) {
        return {
            homeRemedies: [
                "ORS or electrolyte water in small frequent sips.",
                "Ginger or peppermint tea for mild nausea.",
                "Use warm compress on abdomen for cramp relief.",
            ],
            lifestyle: [
                "Eat smaller meals and avoid lying down after eating.",
                "Maintain hand hygiene and safe drinking water.",
                "Track triggers like spicy/oily foods.",
            ],
            diet: [
                "BRAT-style options: banana, rice, applesauce, toast.",
                "Curd/yogurt and plain boiled foods.",
                "Avoid spicy, oily, caffeinated, and sugary drinks.",
            ],
        };
    }

    if (/(headache|migraine)/.test(normalized)) {
        return {
            homeRemedies: [
                "Hydration and quiet dark-room rest.",
                "Cold or warm compress on forehead/neck.",
                "Gentle neck and shoulder stretches.",
            ],
            lifestyle: [
                "Keep a regular sleep schedule.",
                "Reduce screen glare and frequent long screen sessions.",
                "Manage stress using breathing exercises.",
            ],
            diet: [
                "Regular meals to avoid long fasting gaps.",
                "Magnesium-rich foods: nuts, seeds, leafy greens.",
                "Limit high-caffeine and ultra-processed snacks.",
            ],
        };
    }

    return {
        homeRemedies: [
            "Hydrate adequately and take sufficient rest.",
            "Use symptom-relief measures appropriate for discomfort.",
            "Monitor worsening signs and seek care if needed.",
        ],
        lifestyle: [
            "Maintain sleep, hydration, and gentle daily activity.",
            "Track symptoms in a daily log.",
            "Avoid self-medicating beyond basic OTC guidance.",
        ],
        diet: [
            "Prefer home-cooked balanced meals with fruits/vegetables.",
            "Avoid excessive sugar, fried, and heavily processed foods.",
            "Continue small frequent meals if appetite is low.",
        ],
    };
}

async function parseResponseJson<T>(res: Response): Promise<T> {
    const raw = await res.text();

    if (!raw) {
        throw new Error(`Empty response body (status ${res.status})`);
    }

    try {
        return JSON.parse(raw) as T;
    } catch {
        throw new Error(`Invalid JSON response (status ${res.status})`);
    }
}

// Component for rendering animated ML Disease Probability Bars
function AnimatedProgress({ label, percentage, delay = 0 }: { label: string, percentage: number, delay?: number }) {
    const [width, setWidth] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => setWidth(percentage), delay);
        return () => clearTimeout(timer);
    }, [percentage, delay]);

    return (
        <div className="mb-3 w-full max-w-sm">
            <div className="flex justify-between text-[13px] mb-1">
                <span className="font-semibold text-slate-800">{label.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
                <span className="text-slate-500 font-medium">{percentage.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full bg-[#e5e5e5] rounded-full overflow-hidden">
                <div
                    className="h-full bg-[#0f0f0f] rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${width}%` }}
                />
            </div>
        </div>
    );
}

// Generates ChatGPT style clean topic headings
function generateChatTitle(prompt: string) {
    const prefixesToRemove = [
        "can you evaluate my ", "what are the precautions for ",
        "give me a healthy list of ", "explain common ",
        "i have a ", "i have an ", "i am experiencing ", "i feel ", "what is a ",
        "tell me about ", "can you tell me about ", "i have ",
        "can you help with ", "how do i treat ", "symptoms of "
    ];
    let title = prompt.toLowerCase().trim();
    for (const prefix of prefixesToRemove) {
        if (title.startsWith(prefix)) {
            title = title.substring(prefix.length);
            break;
        }
    }
    // Remove trailing punctuation
    title = title.replace(/[?.!]+$/, "");

    // Capitalize each word
    title = title.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    if (title.length > 30) {
        title = title.substring(0, 30) + "...";
    }
    return title || "New Diagnosis";
}

export default function ChatDashboard() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);

    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [followUpActive, setFollowUpActive] = useState(false);
    const [followUpQuestion, setFollowUpQuestion] = useState<string>("");
    const [followUpChoices, setFollowUpChoices] = useState<string[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
    const [latestDiagnosis, setLatestDiagnosis] = useState<DiagnosisPayload | null>(null);
    const [latestDiagnosisMessageId, setLatestDiagnosisMessageId] = useState<string | null>(null);
    const [resultPanelMinimized, setResultPanelMinimized] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        setFollowUpQuestion("");
        setFollowUpChoices([]);
        setInput("");
        setLatestDiagnosis(null);
        setLatestDiagnosisMessageId(null);
        setResultPanelMinimized(false);
        if (window.innerWidth < 768) {
            setSidebarOpen(false);
        }
    }

    async function loadSession(id: string) {
        setCurrentSessionId(id);
        setLoading(true);
        setFollowUpActive(false);
        setFollowUpChoices([]);
        setLatestDiagnosis(null);
        setLatestDiagnosisMessageId(null);
        setResultPanelMinimized(false);

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
                            if (payload.currentQuestionText) {
                                setFollowUpQuestion(payload.currentQuestionText);
                            } else {
                                setFollowUpQuestion("Please answer the follow-up question.");
                            }
                            setFollowUpChoices(Array.isArray(payload.currentQuestionChoices) ? payload.currentQuestionChoices : []);
                        } else {
                            setFollowUpActive(false);
                            setFollowUpQuestion("");
                            setFollowUpChoices([]);
                        }
                    } catch {
                        setFollowUpActive(false);
                        setFollowUpQuestion("");
                        setFollowUpChoices([]);
                    }
                } else {
                    setFollowUpActive(false);
                    setFollowUpQuestion("");
                    setFollowUpChoices([]);
                }
            } else {
                setMessages([]);
                setFollowUpActive(false);
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

    async function sendMessage(text: string, action?: "yes" | "no" | "custom") {
        if (loading) return;
        if (!text.trim() && !action) return;

        const sentText = action === "yes" ? "Yes" : action === "no" ? "No" : text;
        const optimisticUserMessage: Message = { id: Date.now().toString(), role: "user", content: sentText };
        setMessages(prev => [...prev, optimisticUserMessage]);

        setInput("");
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
                    body: JSON.stringify({ role: "user", content: sentText })
                });

                // Ask ML Engine
                const res = await fetch("/api/diagnose/chat/json", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-session-id": activeSessionId
                    },
                    body: JSON.stringify({
                        message: sentText,
                        session_action: action || null
                    }),
                });

                const data = await parseResponseJson<{
                    error?: string;
                    reply?: string;
                    ml_diagnosis?: unknown;
                    follow_up_state?: unknown;
                    follow_up_suggested?: boolean;
                    follow_up_question?: string;
                    follow_up_choices?: string[] | null;
                }>(res);
                if (!res.ok) throw new Error(data.error || "Failed to fetch ML response");

                // Save Assistant Message to DB
                await fetch(`/api/chat/sessions/${activeSessionId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        role: "assistant",
                        content: data.reply || "Error parsing response",
                        jsonPayload: data.ml_diagnosis || data.follow_up_state || null
                    })
                });

                // Fetch DB messages again to restore perfect sync
                const syncRes = await fetch(`/api/chat/sessions/${activeSessionId}/messages`);
                const syncData = await parseResponseJson<{ messages?: Message[] }>(syncRes);
                if (syncData.messages && syncData.messages.length > 0) {
                    setMessages(syncData.messages);
                }

                if (data.follow_up_suggested) {
                    setFollowUpActive(true);
                    setFollowUpQuestion(data.follow_up_question || "Please answer the follow-up question.");
                    setFollowUpChoices(Array.isArray(data.follow_up_choices) ? data.follow_up_choices : []);
                } else {
                    setFollowUpActive(false);
                    setFollowUpQuestion("");
                    setFollowUpChoices([]);
                }
            }
        } catch (err: any) {
            console.error("Chat Error:", err);
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

    if (status === "loading") {
        return <div className="h-screen flex items-center justify-center text-slate-500 bg-white">Loading...</div>;
    }

    const filteredSessions = sessions.filter(s =>
        (s.title || "Diagnosis Chat").toLowerCase().includes(searchQuery.toLowerCase())
    );
    const panelPredictions = latestDiagnosis?.top_predictions || [];
    const datasetPanelPredictions =
        latestDiagnosis?.source === "dataset_current_session"
            ? panelPredictions
            : latestDiagnosis?.comparison?.dataset?.top_predictions || [];
    const openAiPanelPredictions =
        latestDiagnosis?.source === "api_fallback"
            ? panelPredictions
            : latestDiagnosis?.comparison?.openai?.top_predictions || [];
    const panelConfidence = Math.max(0, Math.min(100, Number(latestDiagnosis?.confidence || panelPredictions[0]?.probability || 0)));
    const panelPrecautions = latestDiagnosis?.disease_info?.precautions || [];
    const panelDescription = latestDiagnosis?.disease_info?.description || "";
    const panelSymptoms = latestDiagnosis?.confirmed_symptoms || [];
    const guidance = latestDiagnosis ? guidanceForDiagnosis(latestDiagnosis.diagnosis) : null;

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
                    <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
                        <Menu className="w-5 h-5 text-slate-800" />
                    </Button>
                    <span className="ml-3 font-semibold text-slate-900">MediCore</span>
                    <Button variant="ghost" size="icon" className="ml-auto" onClick={handleNewChat}>
                        <PlusSquare className="w-5 h-5 text-slate-800" />
                    </Button>
                </header>

                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth font-sans">
                    {messages.length === 0 && !loading ? (
                        <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center px-4 animate-in fade-in duration-500">
                            <div className="w-16 h-16 rounded-2xl bg-[#0f0f0f] text-white flex items-center justify-center shadow-md mb-6">
                                <Activity className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-medium text-[#0f0f0f] mb-8">How can I help you today?</h2>

                            {/* Prompt Chips */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                                <Button variant="outline" className="h-auto py-3 px-4 justify-start text-left rounded-xl border-[#e5e5e5] hover:bg-[#f9f9f9] transition-colors" onClick={() => setInput("Evaluate my recent symptoms details.")}>
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-sm font-medium text-[#0f0f0f]">Evaluate symptoms</span>
                                        <span className="text-xs text-[#8e8e8e]">Get a preliminary AI diagnosis</span>
                                    </div>
                                </Button>
                                <Button variant="outline" className="h-auto py-3 px-4 justify-start text-left rounded-xl border-[#e5e5e5] hover:bg-[#f9f9f9] transition-colors" onClick={() => setInput("What are the precautions for stomach ache?")}>
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-sm font-medium text-[#0f0f0f]">Health precautions</span>
                                        <span className="text-xs text-[#8e8e8e]">Learn how to manage conditions</span>
                                    </div>
                                </Button>
                                <Button variant="outline" className="h-auto py-3 px-4 justify-start text-left rounded-xl border-[#e5e5e5] hover:bg-[#f9f9f9] transition-colors" onClick={() => setInput("Give me a healthy list of dietary habits.")}>
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-sm font-medium text-[#0f0f0f]">Dietary habits</span>
                                        <span className="text-xs text-[#8e8e8e]">Improve your daily lifestyle</span>
                                    </div>
                                </Button>
                                <Button variant="outline" className="h-auto py-3 px-4 justify-start text-left rounded-xl border-[#e5e5e5] hover:bg-[#f9f9f9] transition-colors" onClick={() => setInput("Explain common medical terminology.")}>
                                    <div className="flex flex-col gap-1 items-start">
                                        <span className="text-sm font-medium text-[#0f0f0f]">Understand reports</span>
                                        <span className="text-xs text-[#8e8e8e]">Decode medical jargon</span>
                                    </div>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="w-full flex flex-col space-y-6">
                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex max-w-3xl mx-auto w-full group ${msg.role === "user" ? "justify-end" : "justify-start"} px-2 md:px-0`}>
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
                                            <div className="font-semibold text-slate-800 text-[13px] mb-1.5 px-1 tracking-tight">
                                                MediCore
                                            </div>
                                        )}

                                        {msg.role === "user" ? (
                                            <div className="bg-[#f4f4f4] text-[15px] leading-relaxed text-[#0f0f0f] px-5 py-2.5 rounded-2xl rounded-tr-md">
                                                <div className="whitespace-pre-wrap">{msg.content}</div>
                                            </div>
                                        ) : (
                                            <div className="text-[15px] leading-relaxed text-[#0f0f0f] whitespace-pre-wrap prose prose-slate prose-sm max-w-none w-full border-none shadow-none">
                                                {msg.content.split("**").map((text, i) => (
                                                    i % 2 === 1 ? <strong key={i} className="font-semibold text-black">{text}</strong> : text
                                                ))}

                                                {/* Render Animated ML Progress Bars if payload exists */}
                                                {msg.jsonPayload && (() => {
                                                    try {
                                                        const payload = JSON.parse(msg.jsonPayload) as DiagnosisPayload;
                                                        const predictions: { disease: string, probability: number }[] = payload.top_predictions || [];

                                                        if (Array.isArray(predictions) && predictions.length > 0) {
                                                            return (
                                                                <div className="mt-5 p-4 rounded-xl border border-[#e5e5e5] bg-[#f9f9f9]">
                                                                    <div className="text-[12px] font-semibold text-[#8e8e8e] uppercase tracking-wider mb-4">Diagnosis Probabilities</div>
                                                                    {predictions.map((pred, idx) => (
                                                                        <AnimatedProgress
                                                                            key={pred.disease}
                                                                            label={pred.disease}
                                                                            percentage={pred.probability}
                                                                            delay={idx * 150} // Stagger animations
                                                                        />
                                                                    ))}
                                                                </div>
                                                            );
                                                        }
                                                    } catch (e) {
                                                        console.error("Failed to parse ML Payload:", e);
                                                    }
                                                    return null;
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {loading && (
                                <div className="flex justify-start max-w-3xl mx-auto w-full group px-2 md:px-0">
                                    <div className="shrink-0 mr-4 mt-1">
                                        <div className="w-[30px] h-[30px] rounded-full border border-[#e5e5e5] bg-white flex items-center justify-center shadow-sm">
                                            <Activity className="w-4 h-4 text-black animate-pulse" />
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-start min-w-0">
                                        <div className="font-semibold text-slate-800 text-[13px] mb-1.5 px-1 tracking-tight">MediCore</div>
                                        <div className="flex items-center gap-1.5 h-6">
                                            <span className="w-1.5 h-1.5 bg-[#d1d5db] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                            <span className="w-1.5 h-1.5 bg-[#d1d5db] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                            <span className="w-1.5 h-1.5 bg-[#d1d5db] rounded-full animate-bounce"></span>
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
                        <div className="bg-[#f4f4f4] rounded-[24px] border border-[#e5e5e5] hover:border-[#d4d4d4] shadow-sm overflow-hidden focus-within:ring-1 focus-within:ring-[#d4d4d4] transition-all flex flex-col">
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
                                                    variant="outline"
                                                    className="h-8 text-xs rounded-full bg-white border-[#e5e5e5] capitalize"
                                                    onClick={() => sendMessage(choice, "custom")}
                                                    disabled={loading}
                                                >
                                                    {choice.replace(/_/g, " ")}
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

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    sendMessage(input, followUpActive ? "custom" : undefined);
                                }}
                                className="flex items-end p-2.5"
                            >
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder={loading ? "MediCore is thinking..." : "Message MediCore..."}
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
                            MediCore can make mistakes. Consider verifying important information.
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
                        <div className="rounded-2xl bg-gradient-to-br from-[#111827] to-[#1f2937] text-white p-4">
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
                                    style={{ background: `conic-gradient(#10b981 ${panelConfidence}%, #374151 ${panelConfidence}% 100%)` }}
                                >
                                    <div className="h-12 w-12 rounded-full bg-[#111827] grid place-items-center">{Math.round(panelConfidence)}%</div>
                                </div>
                                <div className="text-xs text-slate-300 leading-relaxed">
                                    Model confidence gauge based on your confirmed symptoms and follow-up responses.
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-3">Dataset Prediction Chart</div>
                            <div className="space-y-2.5">
                                {(datasetPanelPredictions.slice(0, 5)).map((pred) => (
                                    <div key={pred.disease}>
                                        <div className="flex items-center justify-between text-[12px] mb-1">
                                            <span className="font-medium text-slate-700">{labelize(pred.disease)}</span>
                                            <span className="text-slate-500">{pred.probability.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600" style={{ width: `${pred.probability}%` }} />
                                        </div>
                                    </div>
                                ))}
                                {datasetPanelPredictions.length === 0 ? (
                                    <div className="text-[12px] text-slate-500">Dataset prediction chart unavailable.</div>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-200 bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-3">OpenAI Prediction Chart</div>
                            <div className="space-y-2.5">
                                {(openAiPanelPredictions.slice(0, 5)).map((pred) => (
                                    <div key={pred.disease}>
                                        <div className="flex items-center justify-between text-[12px] mb-1">
                                            <span className="font-medium text-slate-700">{labelize(pred.disease)}</span>
                                            <span className="text-slate-500">{pred.probability.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-600" style={{ width: `${pred.probability}%` }} />
                                        </div>
                                    </div>
                                ))}
                                {openAiPanelPredictions.length === 0 ? (
                                    <div className="text-[12px] text-slate-500">OpenAI prediction chart unavailable.</div>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-6 w-6 rounded-lg bg-amber-100 text-amber-700 grid place-items-center">
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
                                        <span key={symptom} className="text-[11px] px-2.5 py-1 rounded-full bg-gradient-to-r from-sky-50 to-cyan-50 text-sky-800 border border-sky-100">
                                            {labelize(symptom)}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-6 w-6 rounded-lg bg-emerald-100 text-emerald-700 grid place-items-center">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Home Remedies</div>
                            </div>
                            <ul className="space-y-2 text-[13px] text-slate-700">
                                {(panelPrecautions.length > 0 ? panelPrecautions.slice(0, 3) : guidance?.homeRemedies || []).map((item, idx) => (
                                    <li key={`${item}-${idx}`} className="leading-relaxed flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-6 w-6 rounded-lg bg-violet-100 text-violet-700 grid place-items-center">
                                    <HeartPulse className="w-3.5 h-3.5" />
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-violet-800">Lifestyle Changes</div>
                            </div>
                            <ul className="space-y-2 text-[13px] text-slate-700">
                                {(guidance?.lifestyle || []).map((item, idx) => (
                                    <li key={`${item}-${idx}`} className="leading-relaxed flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-4 mb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-6 w-6 rounded-lg bg-orange-100 text-orange-700 grid place-items-center">
                                    <Apple className="w-3.5 h-3.5" />
                                </div>
                                <div className="text-xs font-semibold uppercase tracking-wider text-orange-800">Diet Adjustments</div>
                            </div>
                            <ul className="space-y-2 text-[13px] text-slate-700">
                                {(guidance?.diet || []).map((item, idx) => (
                                    <li key={`${item}-${idx}`} className="leading-relaxed flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </aside>
        </div >
    );
}
