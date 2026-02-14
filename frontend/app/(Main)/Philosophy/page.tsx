"use client";

import { motion } from "framer-motion";
import { Compass, Brain, Puzzle, ShieldAlert, FlaskConical } from "lucide-react";

export default function Philosophy() {
  return (
    <motion.div
      className="min-h-screen bg-slate-50/50"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="max-w-3xl mx-auto px-6 pt-24 pb-16 md:pt-28 md:pb-24">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex size-12 items-center justify-center rounded-xl bg-teal-500 text-white">
            <Compass className="size-6" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-800">
            Philosophy
          </h1>
        </div>

        <p className="text-lg text-slate-600 mb-10 leading-relaxed">
          This project is built on a simple belief:{" "}
          <span className="font-semibold text-slate-800">
            medical AI should explain, not decide — and assist, not replace.
          </span>
        </p>

        <section className="mb-10 p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <h2 className="flex items-center gap-2 mb-3 text-xl font-semibold text-slate-800">
            <Brain className="size-5 text-teal-500" />
            Core belief
          </h2>
          <p className="text-slate-600 leading-relaxed">
            Healthcare is complex, contextual, and deeply human. Software should
            support understanding — not simulate authority.
            <br />
            <br />
            This system avoids avatars, personas, and artificial confidence to
            reduce the risk of misplaced trust and over-reliance.
          </p>
        </section>

        <section className="mb-10 p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <h2 className="flex items-center gap-2 mb-3 text-xl font-semibold text-slate-800">
            <Puzzle className="size-5 text-teal-500" />
            What the system does
          </h2>
          <ul className="list-none space-y-2 text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-1">•</span>
              Helps users articulate symptoms clearly
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-1">•</span>
              Explains medical reports in accessible language
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-1">•</span>
              Provides general medical context and considerations
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-1">•</span>
              Encourages appropriate professional consultation
            </li>
          </ul>
        </section>

        <section className="mb-10 p-6 rounded-2xl bg-amber-50/80 border border-amber-100">
          <h2 className="flex items-center gap-2 mb-3 text-xl font-semibold text-slate-800">
            <ShieldAlert className="size-5 text-amber-600" />
            What it does not do
          </h2>
          <ul className="list-none space-y-2 text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-amber-600 mt-1">•</span>
              Does not diagnose conditions
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 mt-1">•</span>
              Does not prescribe medication
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 mt-1">•</span>
              Does not replace doctors or emergency services
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 mt-1">•</span>
              Does not guarantee accuracy or outcomes
            </li>
          </ul>
        </section>

        <section className="mb-10 p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
          <h2 className="flex items-center gap-2 mb-3 text-xl font-semibold text-slate-800">
            <ShieldAlert className="size-5 text-teal-500" />
            Safety & responsibility
          </h2>
          <p className="text-slate-600 mb-3">The system is designed with conservative defaults:</p>
          <ul className="list-none space-y-2 text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-1">•</span>
              Clear disclaimers at every critical interaction
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-1">•</span>
              Bias toward suggesting professional care when uncertain
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-1">•</span>
              No medical certainty language
            </li>
            <li className="flex items-start gap-2">
              <span className="text-teal-500 mt-1">•</span>
              Privacy-first handling of sensitive data
            </li>
          </ul>
        </section>

        <section className="mb-10 p-6 rounded-2xl bg-teal-50/80 border border-teal-100">
          <h2 className="flex items-center gap-2 mb-3 text-xl font-semibold text-slate-800">
            <FlaskConical className="size-5 text-teal-600" />
            Beta mindset
          </h2>
          <p className="text-slate-600 leading-relaxed">
            This is an early-stage system. Its purpose is learning — about user
            behavior, system limits, and responsible AI design in healthcare.
            <br />
            <br />
            Features may change, improve, or be removed as understanding grows.
          </p>
        </section>

        <p className="text-sm text-slate-500 leading-relaxed p-4 rounded-xl bg-slate-100/80 border border-slate-100">
          This platform is for informational purposes only and does not provide
          medical advice, diagnosis, or treatment. Always consult a qualified
          healthcare professional.
        </p>
      </div>
    </motion.div>
  );
}
