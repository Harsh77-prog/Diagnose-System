"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowRight,
  Brain,
  ClipboardPlus,
  Globe,
  Hospital,
  Lock,
  ShieldCheck,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Process1 } from "@/components/process1";
import { useRouter } from "next/navigation";

const faqs = [
  {
    trigger: "Is MediCore a substitute for professional medical care?",
    content:
      "No. MediCore provides AI-powered health guidance and symptom analysis, but is not a substitute for professional medical diagnosis or treatment. Always consult licensed healthcare providers for medical advice. In emergencies, contact emergency services immediately.",
  },
  {
    trigger: "How accurate is the symptom analysis?",
    content:
      "Our AI is trained on millions of clinical cases with 94% accuracy on validated medical datasets. However, accuracy depends on complete and accurate symptom reporting. We always recommend professional evaluation for persistent symptoms.",
  },
  {
    trigger: "Is my health data secure and HIPAA compliant?",
    content:
      "Yes. All patient data is encrypted end-to-end, stored on HIPAA-compliant servers, and never shared with third parties. We exceed healthcare security standards and undergo regular compliance audits.",
  },
  {
    trigger: "Can MediCore diagnose conditions?",
    content:
      "MediCore does not provide medical diagnosis. It analyzes symptoms, provides educational information, and helps patients understand when they need professional care. Actual diagnosis must come from licensed healthcare providers.",
  },
  {
    trigger: "What medical image formats are supported?",
    content:
      "We support X-rays, CT scans, MRI images, ultrasounds, and lab reports in common formats (JPEG, PNG, PDF). AI analysis provides observations and highlights areas of concern for physician review.",
  },
  {
    trigger: "How does the doctor referral system work?",
    content:
      "Based on symptoms and location, we connect patients with local specialists, urgent care, or emergency services as appropriate. All referrals are made with patient consent.",
  },
  {
    trigger: "Can healthcare providers integrate MediCore into their practice?",
    content:
      "Yes. We offer enterprise integrations for hospitals, clinics, and telemedicine platforms. Our API supports EHR integration, allowing seamless workflow incorporation.",
  },
  {
    trigger: "How is patient data anonymized?",
    content:
      "We use de-identified data for AI model improvement, with strict patient privacy controls. Patients can opt out of data sharing, and all anonymization meets HIPAA standards.",
  },
  {
    trigger: "What happens if an emergency is detected?",
    content:
      "Our system immediately flags emergency symptoms and directs patients to call emergency services or visit the nearest ER. This includes chest pain, severe difficulty breathing, and other critical presentations.",
  },
  {
    trigger: "Is MediCore available 24/7?",
    content:
      "Yes. Unlike traditional healthcare, MediCore is available anytime, anywhere. For critical emergencies, we always recommend immediate professional care.",
  },
];

const features = [
  {
    i: <Brain className="size-10 text-teal-500" />,
    h: "Conversational AI Doctor",
    s: "Text-based medical conversations designed to collect symptoms, ask relevant follow-up questions, and guide users through structured discussions.",
  },
  {
    i: <ClipboardPlus className="size-10 text-teal-500" />,
    h: "Medical Image Analysis",
    s: "Upload medical images such as X-rays or scans to receive AI-generated observations and visual explanations for review.",
  },
  {
    i: <Activity className="size-10 text-teal-500" />,
    h: "Symptom Analysis",
    s: "Analyzes user-reported symptoms to identify possible conditions, categorize severity, and highlight when professional consultation may be needed.",
  },
  {
    i: <Hospital className="size-10 text-teal-500" />,
    h: "Healthcare Provider Network",
    s: "Supports referrals to appropriate healthcare providers based on context, enabling smoother transitions from AI guidance to real care.",
  },
  {
    i: <Lock className="size-10 text-teal-500" />,
    h: "HIPAA-Compliant Security",
    s: "Built with strong encryption, secure data handling practices, and privacy-first architecture aligned with healthcare compliance standards.",
  },
  {
    i: <Globe className="size-10 text-teal-500" />,
    h: "Multi-Language Support",
    s: "Enables conversations in multiple languages, allowing users to interact comfortably using familiar and preferred language options.",
  },
];

export default function Page() {
  const router = useRouter();
  return (
    <main className="bg-slate-50/50">
      {/* Hero */}
      <section className="medical-pattern relative min-h-[85vh] flex flex-col justify-center items-center px-6 py-24 md:py-32 gap-8 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-teal-50/80 to-transparent pointer-events-none" />
        <Badge className="mb-2 rounded-full bg-teal-100 text-teal-700 border-0 px-4 py-1 text-xs font-medium">
          <ShieldCheck className="size-3.5 mr-1.5 inline" />
          Trusted medical guidance
        </Badge>
        <h1 className="relative text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-slate-800 max-w-3xl leading-tight">
          Medical conversations, simplified.
        </h1>
        <p className="relative text-lg text-slate-600 max-w-2xl font-medium">
          A text-first AI medical assistant that helps you understand symptoms,
          medical reports, and possible next steps — without avatars, simulations,
          or exaggerated claims.
        </p>
        <Button
          className="relative mt-2 rounded-xl bg-teal-500 hover:bg-teal-600 text-white px-8 py-6 text-base font-semibold shadow-lg shadow-teal-500/25"
          onClick={() => router.push("/signup")}
        >
          Get Started <ArrowRight className="size-5 ml-1" />
        </Button>
      </section>

      {/* Features */}
      <section
        id="features"
        className="py-16 md:py-24 px-6 bg-white border-y border-slate-100"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 text-center mb-4">
            Everything you need for better health
          </h2>
          <p className="text-slate-600 text-center max-w-2xl mx-auto mb-12">
            From symptom analysis to secure referrals — all in one place.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="group p-6 rounded-2xl bg-slate-50/80 border border-slate-100 hover:border-teal-200 hover:bg-white hover:shadow-lg hover:shadow-teal-500/5 transition-all duration-300"
              >
                <div className="mb-4 flex size-14 items-center justify-center rounded-xl bg-teal-50 text-teal-600 group-hover:bg-teal-100 transition-colors">
                  {feature.i}
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">
                  {feature.h}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {feature.s}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section id="process" className="py-16 md:py-24 bg-slate-50/50">
        <Process1 className="py-0" />
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 md:py-24 px-6 bg-white border-t border-slate-100">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-12 md:gap-16 items-start">
          <div className="md:sticky md:top-24 shrink-0 md:max-w-xs">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
              Frequently asked questions
            </h2>
            <p className="text-slate-600">
              We&apos;ve compiled the most important information to help you get
              the most out of your experience.
            </p>
          </div>
          <Accordion
            type="single"
            collapsible
            defaultValue="item-0"
            className="flex-1 w-full"
          >
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border-slate-200 py-2"
              >
                <AccordionTrigger className="text-left font-semibold text-slate-800 hover:text-teal-600 hover:no-underline py-4">
                  {faq.trigger}
                </AccordionTrigger>
                <AccordionContent className="text-slate-600 pb-4">
                  {faq.content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="medical-pattern relative py-20 md:py-28 px-6">
        <div className="absolute inset-0 bg-gradient-to-b from-teal-500/90 to-teal-600 pointer-events-none rounded-t-3xl" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4">
            Ready to experience smarter healthcare?
          </h2>
          <p className="text-teal-100 text-lg mb-8">
            Start a conversation. Understand better. Decide responsibly.
          </p>
          <Button
            className="rounded-xl bg-white text-teal-600 hover:bg-slate-50 px-8 py-6 text-base font-semibold shadow-xl"
            onClick={() => router.push("/signup")}
          >
            Get Started <ArrowRight className="size-5 ml-1" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-100 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-12 md:py-16">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8 md:gap-12">
            <div className="flex flex-col gap-2">
              <span className="text-xl font-bold text-slate-800">MedCoreAI</span>
              <p className="text-slate-600 text-sm max-w-sm">
                AI-powered medical guidance you can trust. Helping you make
                smarter health decisions, instantly.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-slate-700">
                Useful links
              </span>
              <a href="#features" className="text-sm text-slate-600 hover:text-teal-600">
                Features
              </a>
              <a href="#process" className="text-sm text-slate-600 hover:text-teal-600">
                Process
              </a>
              <a href="#faq" className="text-sm text-slate-600 hover:text-teal-600">
                FAQs
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-200 py-4 px-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-slate-500">
            <span>© 2026 MedCoreAI. For informational use only.</span>
            <span>Built by <span className="text-slate-700 font-medium">@Team</span></span>
          </div>
        </div>
      </footer>
    </main>
  );
}
