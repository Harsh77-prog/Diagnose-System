"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Send,
  FileText,
  AlertTriangle,
  Loader2,
  Stethoscope,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  BrainCircuit,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Message = {
  role: "user" | "assistant";
  content: string;
  risk_level?: string;
  suggested_action?: string;
  follow_up_question?: string;
  ml_diagnosis?: Record<string, unknown>;
};

export default function DiagnosePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [reportText, setReportText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showReportPanel, setShowReportPanel] = useState(false);
  const [lastRisk, setLastRisk] = useState<{ level: string; action: string } | null>(null);
  const [backendUnavailable, setBackendUnavailable] = useState(false);
  const [awaitingFollowUp, setAwaitingFollowUp] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login?callbackUrl=/diagnose");
      return;
    }
    if (status === "authenticated") loadHistory();
  }, [status, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadHistory() {
    setLoadingHistory(true);
    setBackendUnavailable(false);
    try {
      const res = await fetch("/api/diagnose/history");
      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "BACKEND_UNREACHABLE") setBackendUnavailable(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const hist = (data.history || []).map((h: { role: string; content: string }) => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        }));
        setMessages(hist);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleUploadReport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/diagnose/upload-report", { method: "POST", body: form });
      if (res.ok) {
        const data = await res.json();
        setReportText((prev) => (prev ? prev + "\n\n" : "") + (data.extracted_text || ""));
        setShowReportPanel(true);
      }
    } catch {
      // ignore
    }
    e.target.value = "";
  }

  async function sendToBackend(message: string, sessionAction?: string) {
    setLoading(true);
    setLastRisk(null);

    try {
      const res = await fetch("/api/diagnose/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message,
          session_action: sessionAction || undefined,
        }),
      });

      if (res.status === 401) {
        router.replace("/login?callbackUrl=/diagnose");
        return;
      }

      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        setBackendUnavailable(true);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.error || "Diagnosis service is not running. Start the Python backend and try again.",
          },
        ]);
        setAwaitingFollowUp(false);
        return;
      }

      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply || "I couldn't generate a response. Please try again.",
          risk_level: data.risk_level,
          suggested_action: data.suggested_action,
          follow_up_question: data.follow_up_question,
          ml_diagnosis: data.ml_diagnosis,
        },
      ]);

      if (data.risk_level) setLastRisk({ level: data.risk_level, action: data.suggested_action || "" });

      // Check if there's a follow-up question
      if (data.follow_up_suggested && data.follow_up_question) {
        setAwaitingFollowUp(true);
        setLastMessage(message);
      } else {
        setAwaitingFollowUp(false);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please check your connection and try again." },
      ]);
      setAwaitingFollowUp(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    if (loading) return;

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setAwaitingFollowUp(false);
    setLastMessage(text);

    await sendToBackend(text);
  }

  async function handleFollowUpAnswer(answer: "yes" | "no") {
    if (loading) return;

    setMessages((prev) => [...prev, { role: "user", content: answer === "yes" ? "Yes" : "No" }]);
    setAwaitingFollowUp(false);

    await sendToBackend(lastMessage, answer);
  }

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <Loader2 className="size-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col pt-16">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white/95 backdrop-blur-sm sticky top-14 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500 text-white">
              <Stethoscope className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Diagnose
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  <BrainCircuit className="size-3" />
                  ML-Powered
                </span>
              </h1>
              <p className="text-xs text-slate-500">BioBERT + ML Ensemble — 100% offline, no API key needed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Backend unavailable banner */}
      {backendUnavailable && (
        <div className="max-w-4xl w-full mx-auto px-4 mt-2">
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-slate-800">Diagnosis service is not running</p>
              <p className="text-sm text-slate-600 mt-1">
                Start the Python backend so chat and history work. In the <code className="bg-amber-100 px-1 rounded">backend</code> folder run:{" "}
                <code className="bg-amber-100 px-1.5 py-0.5 rounded text-xs">uvicorn main:app --reload --port 8000</code>
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={() => { setBackendUnavailable(false); loadHistory(); }}
              >
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Risk banner */}
      {lastRisk && lastRisk.level !== "low" && (
        <div className="max-w-4xl w-full mx-auto px-4 mt-2">
          <div
            className={
              lastRisk.level === "critical"
                ? "rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2"
                : "rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2"
            }
          >
            <AlertTriangle
              className={
                lastRisk.level === "critical" ? "size-5 text-red-600 shrink-0 mt-0.5" : "size-5 text-amber-600 shrink-0 mt-0.5"
              }
            />
            <div>
              <p className="font-medium text-slate-800 capitalize">{lastRisk.level} risk</p>
              <p className="text-sm text-slate-600">{lastRisk.action}</p>
            </div>
          </div>
        </div>
      )}

      {/* Report context panel */}
      {showReportPanel && (
        <div className="max-w-4xl w-full mx-auto px-4 mt-2">
          <div className="rounded-xl bg-white border border-slate-200 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">Report / document context</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-500"
                onClick={() => setShowReportPanel(false)}
              >
                <ChevronDown className="size-4" />
              </Button>
            </div>
            <textarea
              className="w-full min-h-[80px] rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-sm text-slate-700 resize-y"
              placeholder="Paste or upload report text..."
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 flex flex-col gap-4 overflow-y-auto">
        {loadingHistory ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-6 animate-spin text-teal-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-2xl bg-teal-50 border border-teal-100 p-6 max-w-md">
              <div className="flex items-center justify-center gap-2 mb-3">
                <BrainCircuit className="size-6 text-teal-600" />
                <p className="text-slate-700 font-medium">ML-Powered Symptom Checker</p>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Describe your symptoms in natural language. The system uses BioBERT for symptom extraction
                and a trained ML ensemble (Random Forest + XGBoost + Logistic Regression) for disease prediction.
                No API keys needed — everything runs locally!
              </p>
              <ul className="text-sm text-slate-600 text-left list-disc list-inside space-y-1">
                <li>Describe how you feel naturally</li>
                <li>Example: &quot;I have a headache and feel tired&quot;</li>
                <li>The AI will ask follow-up questions if needed</li>
                <li>Upload a report (PDF/text) for context</li>
              </ul>
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "flex justify-end"
                  : "flex justify-start"
              }
            >
              <div
                className={
                  m.role === "user"
                    ? "rounded-2xl rounded-br-md bg-teal-500 text-white px-4 py-2.5 max-w-[85%]"
                    : "rounded-2xl rounded-bl-md bg-white border border-slate-200 px-4 py-3 max-w-[85%] shadow-sm"
                }
              >
                {m.role === "assistant" ? (
                  <div className="text-sm text-slate-800 whitespace-pre-wrap prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5">
                    {m.content.split("\n").map((line, j) => {
                      // Bold text
                      const parts = line.split(/(\*\*[^*]+\*\*)/g);
                      return (
                        <span key={j}>
                          {parts.map((part, k) => {
                            if (part.startsWith("**") && part.endsWith("**")) {
                              return <strong key={k}>{part.slice(2, -2)}</strong>;
                            }
                            // Italic text
                            const italicParts = part.split(/(\_[^_]+\_)/g);
                            return italicParts.map((ip, l) => {
                              if (ip.startsWith("_") && ip.endsWith("_")) {
                                return <em key={`${k}-${l}`}>{ip.slice(1, -1)}</em>;
                              }
                              return <span key={`${k}-${l}`}>{ip}</span>;
                            });
                          })}
                          {j < m.content.split("\n").length - 1 && "\n"}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                )}
                {m.role === "assistant" && m.risk_level && m.risk_level !== "low" && (
                  <p className="text-xs mt-2 pt-2 border-t border-slate-100 text-amber-700">
                    Risk: {m.risk_level}. {m.suggested_action}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-white border border-slate-200 px-4 py-3 flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-teal-500" />
              <span className="text-sm text-slate-500">Analyzing with ML engine...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Follow-up Yes/No buttons */}
      {awaitingFollowUp && !loading && (
        <div className="max-w-4xl w-full mx-auto px-4 pb-2">
          <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 flex items-center justify-center gap-4">
            <span className="text-sm text-slate-700 font-medium">Answer the follow-up question:</span>
            <Button
              onClick={() => handleFollowUpAnswer("yes")}
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl px-6 gap-2"
              disabled={loading}
            >
              <ThumbsUp className="size-4" />
              Yes
            </Button>
            <Button
              onClick={() => handleFollowUpAnswer("no")}
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl px-6 gap-2"
              disabled={loading}
            >
              <ThumbsDown className="size-4" />
              No
            </Button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-slate-200 bg-white/95 backdrop-blur-sm sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <div className="flex gap-2">
              <label className="cursor-pointer flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 size-10 shrink-0">
                <FileText className="size-5" />
                <input
                  type="file"
                  accept=".pdf,.txt"
                  className="hidden"
                  onChange={handleUploadReport}
                />
              </label>
              <button
                type="button"
                onClick={() => setShowReportPanel((v) => !v)}
                className="rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 px-3 py-2 text-sm shrink-0"
              >
                {showReportPanel ? "Hide report" : "Add report"}
              </button>
            </div>
            <textarea
              className="flex-1 min-h-[44px] max-h-32 rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 resize-y focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400"
              placeholder={awaitingFollowUp ? "Or type your symptoms for a new diagnosis..." : "Describe symptoms or ask a question..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              rows={1}
            />
            <Button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-teal-500 hover:bg-teal-600 size-10 shrink-0"
            >
              <Send className="size-5" />
            </Button>
          </form>
          <p className="text-xs text-slate-500 mt-2 text-center">
            🧠 Powered by BioBERT + ML Ensemble. Not a substitute for professional medical advice.
          </p>
        </div>
      </div>
    </div>
  );
}
