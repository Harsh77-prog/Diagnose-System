"use client";

import { useEffect } from "react";
import { FileText, ShieldCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type LegalSection = {
  title: string;
  body: string[];
};

type LegalPolicyModalProps = {
  open: boolean;
  type: "privacy" | "terms";
  onClose: () => void;
};

const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: "Information We Process",
    body: [
      "MedCoreAI may process account information, chat messages, uploaded medical images, uploaded reports, and diagnosis-related responses that you submit while using the application.",
      "This information is used to operate the current chat, diagnosis, translation, image-analysis, report-analysis, and PDF-generation features available in the project.",
    ],
  },
  {
    title: "How The Data Is Used",
    body: [
      "Your inputs are used to generate AI-assisted responses, structured follow-up questions, visual analysis, report summaries, and downloadable result documents.",
      "Uploaded content should only be provided when you understand that it is being processed for the requested feature inside the application workflow.",
    ],
  },
  {
    title: "Storage Notice",
    body: [
      "Conversation history and diagnosis-related messages may be stored by the application so users can reopen previous sessions later.",
      "The generated PDF export is currently downloaded on demand and is not permanently stored by the application unless you keep the downloaded file on your own device.",
    ],
  },
  {
    title: "Important Limitation",
    body: [
      "MedCoreAI is an informational software system and not a substitute for a licensed doctor, hospital, emergency service, or formal medical diagnosis.",
      "Do not rely on this application alone for emergencies, urgent symptoms, medication decisions, or situations where delayed care could cause harm.",
    ],
  },
];

const TERMS_SECTIONS: LegalSection[] = [
  {
    title: "Medical Disclaimer",
    body: [
      "MedCoreAI provides AI-assisted educational guidance, symptom-based support, image review signals, report analysis, and downloadable summaries for informational use only.",
      "All output is preliminary and must not be treated as a confirmed diagnosis, prescription, emergency instruction, or professional medical opinion.",
    ],
  },
  {
    title: "User Responsibilities",
    body: [
      "You are responsible for providing accurate information, choosing the closest upload type when asked, and reviewing generated output carefully before acting on it.",
      "You agree not to upload unrelated, illegal, harmful, or misleading content, including non-medical images intended to manipulate the analysis workflow.",
    ],
  },
  {
    title: "No Guarantee",
    body: [
      "The project attempts to improve analysis quality through conversation context, model routing, upload validation, and follow-up questions, but no result is guaranteed to be correct, complete, or fit for clinical use.",
      "MedCoreAI and its project contributors are not responsible for losses or harm caused by exclusive reliance on generated output without professional verification.",
    ],
  },
  {
    title: "Use At Your Own Judgment",
    body: [
      "By using this application, you agree that important healthcare decisions should be confirmed with a qualified medical professional.",
      "If you believe you may be experiencing an urgent or life-threatening condition, seek immediate help from emergency services or a licensed clinician instead of waiting for app output.",
    ],
  },
];

export function LegalPolicyModal({ open, type, onClose }: LegalPolicyModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isPrivacy = type === "privacy";
  const Icon = isPrivacy ? ShieldCheck : FileText;
  const heading = isPrivacy ? "Privacy Policy" : "Terms of Service";
  const eyebrow = isPrivacy ? "Privacy And Data Use" : "Usage Terms And Medical Disclaimer";
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 md:p-6">
      <button
        type="button"
        aria-label="Close policy modal"
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.2),transparent_35%),rgba(15,23,42,0.78)] backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_45%,#eef2f7_100%)] shadow-[0_28px_100px_rgba(15,23,42,0.32)]">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_50%,#111827_100%)] px-6 py-6 text-white md:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                <Icon className="h-3.5 w-3.5" />
                {eyebrow}
              </div>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight md:text-3xl">{heading}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
                These terms are presented to help users understand the current behavior and limitations of the MedCoreAI project.
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-10 w-10 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-6 md:px-8 md:py-8">
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
            <p className="text-sm leading-relaxed text-slate-700">
              By continuing to use MedCoreAI, users acknowledge that this project provides AI-assisted health information only.
              <span className="font-semibold text-slate-900"> Professional medical judgment is still required for real care decisions.</span>
            </p>
          </div>

          <div className="space-y-4">
            {sections.map((section) => (
              <div
                key={section.title}
                className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
              >
                <h3 className="text-base font-semibold text-slate-900">{section.title}</h3>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-300 bg-slate-900 px-5 py-4 text-sm leading-relaxed text-slate-200">
            For urgent symptoms, chest pain, breathing trouble, severe bleeding, collapse, stroke-like symptoms, or any medical emergency, contact local emergency services or a licensed clinician immediately.
          </div>
        </div>
      </div>
    </div>
  );
}
