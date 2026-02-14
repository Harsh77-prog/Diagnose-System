import { Stethoscope } from "lucide-react";
import React from "react";

import { cn } from "@/lib/utils";

interface Process1Props {
  className?: string;
}

const Process1 = ({ className }: Process1Props) => {
  const process = [
    {
      step: "01",
      title: "Tell us about yourself",
      description:
        "We begin by understanding about you in detail, including your age, gender, lifestyle factors, past medical history, ongoing conditions, and any medications or supplements you are currently taking. This helps us personalize the guidance you receive.",
    },
    {
      step: "02",
      title: "Describe your concerns",
      description:
        "Share what you're experiencing using text or voice input. You can explain symptoms, duration, and severity, and optionally upload medical images, lab reports, or previous prescriptions to give us a clearer picture.",
    },
    {
      step: "03",
      title: "Analysis & Guidance",
      description:
        "Our AI analyzes your information in real time to identify possible conditions, assess risk levels, and provide clear, actionable recommendations on what to do next, from self-care tips to medical consultation.",
    },
    {
      step: "04",
      title: "Smart Routing",
      description:
        "If urgent or life-threatening symptoms are detected, we immediately guide you to emergency care. For non-urgent cases, we help route you to the right specialist or primary care provider for timely follow-up.",
    },
  ];

  return (
    <section className={cn("py-12 md:py-20", className)}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-6 lg:gap-16">
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex size-12 items-center justify-center rounded-xl bg-teal-500 text-white">
                  <Stethoscope className="size-6" />
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-slate-800 tracking-tight">
                  Our Process
                </h2>
              </div>
              <p className="text-slate-600 leading-relaxed">
                A simple, guided workflow designed to understand your health
                concerns, assess urgency, and connect you with the right care at
                the right time.
              </p>
            </div>
          </div>
          <ul className="lg:col-span-4 space-y-0">
            {process.map((step, index) => (
              <li
                key={index}
                className="flex flex-col sm:flex-row gap-6 py-8 border-b border-slate-200 last:border-b-0"
              >
                <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 font-bold text-lg">
                  {step.step}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-slate-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export { Process1 };
