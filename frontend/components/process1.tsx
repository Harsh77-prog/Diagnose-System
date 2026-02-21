import { Asterisk, CornerDownRight } from "lucide-react";
import React from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

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
    <section className={cn("py-32", className)}>
      <div className="container">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-6 lg:gap-20">
          <div className="top-10 col-span-2 h-fit w-fit gap-3 space-y-7 py-8 lg:sticky">
            <div className="relative w-fit text-5xl font-semibold tracking-tight lg:text-7xl">
              {" "}
              <h1 className="w-fit">Our Process</h1>
              <Asterisk className="absolute -top-2 -right-2 size-5 text-orange-500 md:size-10 lg:-right-14" />
            </div>
            <p className="text-base text-foreground/50">
              A simple, guided workflow designed to understand your health
              concerns, assess urgency, and connect you with the right care at
              the right time.
            </p>
          </div>
          <ul className="relative col-span-4 w-full lg:pl-22">
            {process.map((step, index) => (
              <li
                key={index}
                className="relative flex flex-col justify-between gap-10 border-t py-8 md:flex-row lg:py-10"
              >
                <div className="flex size-12 items-center justify-center bg-muted px-4 py-1 tracking-tighter">
                  0{index + 1}
                </div>
                <div className="">
                  <h3 className="mb-4 text-2xl font-semibold tracking-tighter lg:text-3xl">
                    {step.title}
                  </h3>
                  <p className="text-foreground/50">{step.description}</p>
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
