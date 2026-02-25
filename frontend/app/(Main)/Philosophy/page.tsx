"use client";

import { motion } from "framer-motion";

export default function Philosophy() {
  return (
    <motion.div
      className="min-h-screen px-4 py-8 md:px-64 mt-20 md:py-16 flex items-center justify-center"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-3xl">
        {/* TITLE */}
        <h1 className="mb-6 text-4xl font-bold">🧭 Philosophy</h1>

        <p className="mb-10 text-lg text-neutral-700">
          This project is built on a simple belief: <br />
          <span className="font-bold">
            medical AI should explain, not decide — and assist, not replace.
          </span>
        </p>

        {/* CORE BELIEF */}
        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">🧠 Core belief</h2>
          <p className="text-neutral-700">
            Healthcare is complex, contextual, and deeply human. Software should
            support understanding — not simulate authority.
            <br />
            <br />
            This system avoids avatars, personas, and artificial confidence to
            reduce the risk of misplaced trust and over-reliance.
          </p>
        </section>

        {/* WHAT THE SYSTEM DOES */}
        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">
            🧩 What the system does
          </h2>
          <ul className="list-disc list-inside space-y-2 text-neutral-700">
            <li>Helps users articulate symptoms clearly</li>
            <li>Explains medical reports in accessible language</li>
            <li>Provides general medical context and considerations</li>
            <li>Encourages appropriate professional consultation</li>
          </ul>
        </section>

        {/* WHAT IT DOES NOT DO */}
        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">
            ⚠️ What it does not do
          </h2>
          <ul className="list-disc list-inside space-y-2 text-neutral-700">
            <li>Does not diagnose conditions</li>
            <li>Does not prescribe medication</li>
            <li>Does not replace doctors or emergency services</li>
            <li>Does not guarantee accuracy or outcomes</li>
          </ul>
        </section>

        {/* SAFETY & RESPONSIBILITY */}
        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">
            🛡️ Safety & responsibility
          </h2>
          <p className="text-neutral-700">
            The system is designed with conservative defaults:
          </p>
          <ul className="mt-3 list-disc list-inside space-y-2 text-neutral-700">
            <li>Clear disclaimers at every critical interaction</li>
            <li>Bias toward suggesting professional care when uncertain</li>
            <li>No medical certainty language</li>
            <li>Privacy-first handling of sensitive data</li>
          </ul>
        </section>

        {/* BETA STATEMENT */}
        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">🧪 Beta mindset</h2>
          <p className="text-neutral-700">
            This is an early-stage system. Its purpose is learning — about user
            behavior, system limits, and responsible AI design in healthcare.
            <br />
            <br />
            Features may change, improve, or be removed as understanding grows.
          </p>
        </section>

        {/* FOOTER NOTE */}
        <p className="mt-12 text-sm text-neutral-500">
          This platform is for informational purposes only and does not provide
          medical advice, diagnosis, or treatment. Always consult a qualified
          healthcare professional.
        </p>
      </div>
    </motion.div>
  );
}
