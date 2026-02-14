"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Send,
  ImagePlus,
  FileText,
  AlertTriangle,
  Loader2,
  Stethoscope,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type Message = { role: "user" | "assistant"; content: string; risk_level?: string; suggested_action?: string };

export default function DiagnosePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [reportText, setReportText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showReportPanel, setShowReportPanel] = useState(false);
  const [lastRisk, setLastRisk] = useState<{ level: string; action: string } | null>(null);
  const [backendUnavailable, setBackendUnavailable] = useState(false);
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

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setImagePreview(dataUrl);
      setImageBase64(base64 || null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text && !imageBase64) return;
    if (loading) return;

    const userContent = text || "(Image attached)";
    setMessages((prev) => [...prev, { role: "user", content: userContent }]);
    setInput("");
    setImagePreview(null);
    setImageBase64(null);
    setLoading(true);
    setLastRisk(null);

    try {
      const res = await fetch("/api/diagnose/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text || "(Please describe what you see in the image or your main concern.)",
          report_text: reportText || undefined,
          image_b64: imageBase64 || undefined,
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
            content: data.error || "Diagnosis service is not running. Start the Python backend (see SETUP.md) and try again.",
          },
        ]);
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
        },
      ]);
      if (data.risk_level) setLastRisk({ level: data.risk_level, action: data.suggested_action || "" });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please check your connection and try again." },
      ]);
    } finally {
      setLoading(false);
    }
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
              <h1 className="text-lg font-bold text-slate-800">Diagnose</h1>
              <p className="text-xs text-slate-500">Describe symptoms, attach reports or images</p>
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
              <p className="text-slate-700 font-medium mb-2">Start your assessment</p>
              <p className="text-sm text-slate-600 mb-4">
                Describe your symptoms, paste lab or imaging report text, or upload an image. I’ll ask follow-up
                questions and help you understand next steps. This is not a substitute for professional medical care.
              </p>
              <ul className="text-sm text-slate-600 text-left list-disc list-inside space-y-1">
                <li>Attach an image (e.g. X-ray, rash photo)</li>
                <li>Paste or upload a report (PDF/text)</li>
                <li>Describe how you feel in your own words</li>
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
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
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
              <span className="text-sm text-slate-500">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 bg-white/95 backdrop-blur-sm sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-4">
          {imagePreview && (
            <div className="mb-2 relative inline-block">
              <img
                src={imagePreview}
                alt="Attached"
                className="h-20 w-20 object-cover rounded-lg border border-slate-200"
              />
              <button
                type="button"
                className="absolute -top-1 -right-1 size-5 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center"
                onClick={() => {
                  setImagePreview(null);
                  setImageBase64(null);
                }}
              >
                ×
              </button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <div className="flex-1 flex gap-2">
              <label className="cursor-pointer flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 size-10 shrink-0">
                <ImagePlus className="size-5" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                />
              </label>
              <label className="cursor-pointer flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 size-10 shrink-0">
                <FileText className="size-5" />
                <input
                  type="file"
                  accept=".pdf,.txt,image/*"
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
              placeholder="Describe symptoms or ask a question..."
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
              disabled={loading || (!input.trim() && !imageBase64)}
              className="rounded-xl bg-teal-500 hover:bg-teal-600 size-10 shrink-0"
            >
              <Send className="size-5" />
            </Button>
          </form>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Not a substitute for professional medical advice. In an emergency, seek care immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
