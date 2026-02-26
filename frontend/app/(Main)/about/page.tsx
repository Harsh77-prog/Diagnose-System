import { Activity, Brain, CircleHelp, ShieldCheck, UserRound } from "lucide-react";

export default function AboutPage() {
  return (
    <main className="bg-white">
      <section className="relative w-full overflow-hidden border-b border-[#e5e5e5] bg-[#0f0f0f] px-8 py-24 text-white md:py-44">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.18),transparent_42%),radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.12),transparent_38%),linear-gradient(135deg,#0f0f0f_0%,#171717_45%,#222_100%)]" />
        <div className="absolute -left-20 top-12 h-56 w-56 rounded-full border border-white/20" />
        <div className="absolute -right-12 bottom-10 h-44 w-44 rounded-full border border-white/15" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/25 to-transparent" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <p className="mb-5 inline-flex rounded-full border border-white/25 bg-white/5 px-4 py-1 text-xs tracking-wider text-white/90 uppercase backdrop-blur-sm">
            About This Project
          </p>
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight md:text-6xl">
            MedCoreAI now uses live, problem-specific medical follow-up questions.
          </h1>
          <p className="mt-6 max-w-3xl text-base text-white/85 md:text-lg">
            The assistant starts with demographics, then asks dynamic OpenAI-generated follow-up questions based on your
            exact symptoms and conversation context until confidence becomes reliable.
          </p>
          <div className="mt-10 grid max-w-3xl gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-xs text-white/90 backdrop-blur-sm">
              Dynamic follow-up interviews
            </div>
            <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-xs text-white/90 backdrop-blur-sm">
              Confidence-aware prediction
            </div>
            <div className="rounded-xl border border-white/20 bg-white/5 p-3 text-xs text-white/90 backdrop-blur-sm">
              Safety-first informational output
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#e5e5e5] px-6 py-16 md:px-10">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">How It Works</h2>
          <p className="mt-3 max-w-3xl text-sm text-slate-600 md:text-base">
            This is the live triage flow now running in chat.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4">
              <UserRound className="mb-3 h-5 w-5 text-slate-700" />
              <p className="text-sm font-semibold">1. User Symptoms</p>
              <p className="mt-2 text-xs text-slate-600">You describe your issue in natural language.</p>
            </div>
            <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4">
              <Activity className="mb-3 h-5 w-5 text-slate-700" />
              <p className="text-sm font-semibold">2. Age Group</p>
              <p className="mt-2 text-xs text-slate-600">System asks age group first for triage context.</p>
            </div>
            <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4">
              <Activity className="mb-3 h-5 w-5 text-slate-700" />
              <p className="text-sm font-semibold">3. Gender</p>
              <p className="mt-2 text-xs text-slate-600">Gender is collected second for model calibration.</p>
            </div>
            <div className="rounded-2xl border border-[#e5e5e5] bg-[#fafafa] p-4">
              <Brain className="mb-3 h-5 w-5 text-slate-700" />
              <p className="text-sm font-semibold">4. Live Follow-Ups</p>
              <p className="mt-2 text-xs text-slate-600">OpenAI generates question-by-question follow-ups from context.</p>
            </div>
            <div className="rounded-2xl border border-[#0f0f0f] bg-[#0f0f0f] p-4 text-white">
              <ShieldCheck className="mb-3 h-5 w-5 text-white" />
              <p className="text-sm font-semibold">5. Prediction Output</p>
              <p className="mt-2 text-xs text-white/80">System returns a confidence-based informational prediction.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#e5e5e5] px-6 py-16 md:px-10">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-[#e5e5e5] bg-[#fafafa] p-6 md:p-8">
            <h3 className="text-xl font-bold">Confidence Growth Diagram</h3>
            <p className="mt-2 text-sm text-slate-600">
              Reliability improves as follow-up questions collect higher-signal details.
            </p>
            <div className="mt-6 space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>Initial symptom report</span>
                  <span>28%</span>
                </div>
                <div className="h-2 rounded-full bg-[#e6e6e6]"><div className="h-2 w-[28%] rounded-full bg-[#111]" /></div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>After age + gender</span>
                  <span>41%</span>
                </div>
                <div className="h-2 rounded-full bg-[#e6e6e6]"><div className="h-2 w-[41%] rounded-full bg-[#111]" /></div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>After live follow-up set</span>
                  <span>67%</span>
                </div>
                <div className="h-2 rounded-full bg-[#e6e6e6]"><div className="h-2 w-[67%] rounded-full bg-[#111]" /></div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-slate-600">
                  <span>Reliable threshold reached</span>
                  <span>78%</span>
                </div>
                <div className="h-2 rounded-full bg-[#e6e6e6]"><div className="h-2 w-[78%] rounded-full bg-[#111]" /></div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#e5e5e5] bg-white p-6 md:p-8">
            <h3 className="text-xl font-bold">Question Selection Diagram</h3>
            <p className="mt-2 text-sm text-slate-600">
              Follow-up questions are generated for the current problem, not from a static fixed list.
            </p>
            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3 text-sm">
                Input context: recent symptoms + prior answers + candidate conditions
              </div>
              <div className="mx-2 h-4 border-l border-dashed border-slate-400" />
              <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3 text-sm">
                OpenAI generates one targeted follow-up question
              </div>
              <div className="mx-2 h-4 border-l border-dashed border-slate-400" />
              <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-3 text-sm">
                User responds via chips (yes/no/options) or free text
              </div>
              <div className="mx-2 h-4 border-l border-dashed border-slate-400" />
              <div className="rounded-xl border border-[#0f0f0f] bg-[#0f0f0f] p-3 text-sm text-white">
                Loop repeats until reliability threshold or turn limit
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 md:px-10">
        <div className="mx-auto max-w-6xl rounded-3xl border border-[#e5e5e5] bg-[#fafafa] p-7 md:p-10">
          <div className="mb-4 flex items-center gap-2 text-slate-700">
            <CircleHelp className="h-5 w-5" />
            <h3 className="text-xl font-bold">What This Project Delivers</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 text-sm text-slate-700">
              Dynamic symptom interviews using OpenAI-generated follow-up questions.
            </div>
            <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 text-sm text-slate-700">
              Session-based memory for coherent multi-turn medical conversations.
            </div>
            <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 text-sm text-slate-700">
              Confidence-aware prediction output with top candidate conditions.
            </div>
            <div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 text-sm text-slate-700">
              Informational safety messaging and precaution-oriented guidance.
            </div>
          </div>
          <p className="mt-6 text-sm text-slate-500">
            Safety notice: MedCoreAI is informational and does not replace licensed medical diagnosis or treatment.
          </p>
        </div>
      </section>
    </main>
  );
}
