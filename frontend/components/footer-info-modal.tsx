"use client";

import { useEffect } from "react";
import { Mail, Shield, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type FooterInfoModalProps = {
  open: boolean;
  type: "about" | "security" | "contact";
  onClose: () => void;
};

const MODAL_CONTENT = {
  about: {
    icon: Sparkles,
    eyebrow: "About MedCoreAI",
    title: "What This Project Does Today",
    paragraphs: [
      "MedCoreAI is a healthcare-focused AI web app that combines normal medical chat, structured diagnosis flow, medical image analysis, medical report analysis, Hindi translation, and one-time PDF export after results.",
      "The project is designed to help users organize symptoms, review uploaded material, and receive AI-assisted guidance in a clean conversation interface.",
    ],
  },
  security: {
    icon: Shield,
    eyebrow: "Project Security",
    title: "Current Security Notice",
    paragraphs: [
      "This project includes authenticated chat access, saved conversation history, protected backend communication, and upload validation in the current implementation.",
      "It should still be presented as a working software project, not as formally certified HIPAA-compliant infrastructure unless you complete those compliance steps separately.",
    ],
  },
  contact: {
    icon: Mail,
    eyebrow: "Contact",
    title: "Project Contact",
    paragraphs: [
      "For support, bug reports, or project questions, please contact the project owner or development team through the channels you provide with the deployment.",
      "If you want, this placeholder can later be replaced with a real email address, support form, or portfolio/contact page link.",
    ],
  },
} as const;

export function FooterInfoModal({ open, type, onClose }: FooterInfoModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const content = MODAL_CONTENT[type];
  const Icon = content.icon;

  return (
    <div className="fixed inset-0 z-[115] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close info modal"
        onClick={onClose}
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.16),transparent_35%),rgba(15,23,42,0.72)] backdrop-blur-sm"
      />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_45%,#eef2f7_100%)] shadow-[0_28px_90px_rgba(15,23,42,0.25)]">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_50%,#111827_100%)] px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                <Icon className="h-3.5 w-3.5" />
                {content.eyebrow}
              </div>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">{content.title}</h3>
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

        <div className="space-y-4 px-6 py-6 text-sm leading-relaxed text-slate-600">
          {content.paragraphs.map((paragraph) => (
            <div key={paragraph} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              {paragraph}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
