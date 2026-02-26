"use client";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowRight,
  Brain,
  ClipboardPlus,
  Globe,
  Hospital,
  Lock,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Process1 } from "@/components/process1";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";

const faqs = [
  {
    trigger: "Is MedCoreAI a substitute for professional medical care?",
    content:
      "No. MedCoreAI provides AI-powered health guidance and symptom analysis, but is not a substitute for professional medical diagnosis or treatment. Always consult licensed healthcare providers for medical advice. In emergencies, contact emergency services immediately.",
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
    trigger: "Can MedCoreAI diagnose conditions?",
    content:
      "MedCoreAI does not provide medical diagnosis. It analyzes symptoms, provides educational information, and helps patients understand when they need professional care. Actual diagnosis must come from licensed healthcare providers.",
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
    trigger: "Can healthcare providers integrate MedCoreAI into their practice?",
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
    trigger: "Is MedCoreAI available 24/7?",
    content:
      "Yes. Unlike traditional healthcare, MedCoreAI is available anytime, anywhere. For critical emergencies, we always recommend immediate professional care.",
  },
];

const features = [
  {
    i: <Brain className="h-12 w-10" />,
    h: "Conversational AI Doctor",
    s: "Text-based medical conversations designed to collect symptoms, ask relevant follow-up questions, and guide users through structured discussions.",
  },

  {
    i: <ClipboardPlus className="h-12 w-10" />,
    h: "Medical Image Analysis",
    s: "Upload medical images such as X-rays or scans to receive AI-generated observations and visual explanations for review.",
  },

  {
    i: <Activity className="h-12 w-10" />,
    h: "Symptom Analysis",
    s: "Analyzes user-reported symptoms to identify possible conditions, categorize severity, and highlight when professional consultation may be needed.",
  },

  {
    i: <Hospital className="h-12 w-10" />,
    h: "Healthcare Provider Network",
    s: "Supports referrals to appropriate healthcare providers based on context, enabling smoother transitions from AI guidance to real care.",
  },

  {
    i: <Lock className="h-12 w-10" />,
    h: "HIPAA-Compliant Security",
    s: "Built with strong encryption, secure data handling practices, and privacy-first architecture aligned with healthcare compliance standards.",
  },

  {
    i: <Globe className="h-12 w-10" />,
    h: "Multi-Language Support",
    s: "Enables conversations in multiple languages, allowing users to interact comfortably using familiar and preferred language options.",
  },
];

export default function Page() {
  const router = useRouter();
  return (
    <main>
    <section
  className="relative w-full flex justify-center items-center flex-col
             h-auto py-20 md:py-64 px-8 text-white overflow-hidden"
>

  {/* Background Image */}
  <div
    className="absolute inset-0 bg-cover bg-center"
    style={{
      backgroundImage: "url('/image copy.png')", // put image in /public folder
    }}
  />

  {/* Dark Overlay (improves text readability) */}
  <div className="absolute inset-0 bg-black/60" />

  {/* Content */}
  <div className="relative z-10 flex flex-col items-center gap-8">
    <h1 className="scroll-m-20 text-center text-5xl md:text-6xl font-bold tracking-tight md:max-w-[45vw]">
      Medical conversations, simplified.
    </h1>

    <div className="text-md font-semibold text-center md:max-w-[45vw]">
      A text-first AI medical assistant that helps users understand
      symptoms, medical reports, and possible next steps — without avatars,
      simulations, or exaggerated claims.
    </div>

    <Button
      className="w-fit mt-2 px-6"
      onClick={() => router.push("/signup")}
    >
      Get Started <ArrowRight />
    </Button>
  </div>
</section>

      {/*Features*/}

      <section
        id="features"
        className="h-auto p-8 py-16 md:py-42 gap-8 border-b w-full flex justify-center items-center flex-col"
      >
        <h1 className="scroll-m-20 text-center text-5xl md:text-6xl font-bold tracking-tight text-center break-word">
          Everything you need for better health
        </h1>
        <div className="grid md:grid-cols-3">
          {features.map((feature, i) => (
            <div
              key={i}
              className={`border ${i == 0 ? "border-t-1" : ""} ${i >= 0 && i < 3 ? "md:border-t-1" : ""} ${i == 2 && i < 5 ? "md:border-r-1" : ""} md:border-r-0 border-t-0 border-dashed max-w-112 p-8 gap-2 flex flex-col items-center`}
            >
              {feature.i}
              <div>
                <div className="text-lg font-semibold text-center ">
                  {feature.h}
                </div>
                <div className="text-md font-semibold text-center text-muted-foreground">
                  {feature.s}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/*Process*/}
      <section className="h-auto p-8  gap-8 border-b w-full flex justify-center items-center flex-col">
        <Process1 className="py-8 md:py-32" />
      </section>

      {/*FAQ section*/}

      <section className="md:sticky top-0 z-1 h-auto w-fit p-8 md:py-24 gap-12  w-full flex md:flex-row justify-center items-center md:items-start flex-col">
        <div className="gap-4 flex flex-col md:max-w-[42vw]">
          {" "}
          <h1 className="scroll-m-20 text-center text-5xl font-bold tracking-tight text-center md:text-start break-word">
            Frequently asked questions
          </h1>
          <div className="text-lg font-semibold text-center md:text-start">
            We've compiled the most important information to help you get the
            most out of your experience. Can't find what you're looking for?
          </div>
        </div>

        <Accordion
          type="single"
          collapsible
          defaultValue="item-1"
          className="max-w-lg"
        >
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={i.toString()}>
              <AccordionTrigger className="text-md font-semibold ">
                {faq.trigger}
              </AccordionTrigger>
              <AccordionContent>{faq.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className=" relative z-2 rounded-t-2xl md:rounded-t-4xl h-auto p-8 py-20 md:py-62 gap-8 bg-neutral-900 w-full flex justify-center items-center flex-col">
        <h1 className=" text-neutral-200 scroll-m-20 text-center text-5xl md:text-8xl font-bold tracking-tight text-center break-word md:max-w-[56vw]">
          Ready to experience smarter healthcare?
        </h1>
        <div className="text-lg text-muted-foreground font-semibold text-center md:max-w-[45vw]">
          Start a conversation. Understand better. Decide responsibly.
        </div>
        <Button
          className="w-fit mt-2 px-6"
          variant={"secondary"}
          onClick={() => router.push("/signup")}
        >
          Get Started <ArrowRight />
        </Button>
      </section>
      <Separator className="w-[50vw]"></Separator>
      <section className=" p-8 py-0 relative z-2 bg-neutral-100 w-full flex justify-center items-center ">
        <div className=" w-304  md:gap-56 md:py-16 gap-0  flex justify-between flex-col md:flex-row md:border-b">
          <div className=" flex flex-col justify-center  py-4 ">
            <div className="text-xl md:text-2xl text-foreground font-bold text-start py-2">
              MedCoreAI
            </div>
            <div className="w-full text-sm md:text-lg md:text-md text-muted-foreground font-normal text-start ">
              AI-powered medical guidance you can trust. <br />
              Helping you make smarter health decisions, instantly.
            </div>
          </div>

          <div className="flex flex-col py-4 border-b md:w-fit md:border-b-0  ">
            <div className="text-md md:text-xl text-foreground py-1 font-semibold text-start">
              Usefull links
            </div>
            <div className="text-sm md:text-lg text-muted-foreground font-normal text-start">
              Features
            </div>
            <div className="text-sm md:text-lg text-muted-foreground font-normal text-start">
              Process
            </div>
            <div className="text-sm md:text-lg text-muted-foreground font-normal text-start">
              Faqs
            </div>
          </div>
        </div>
      </section>
      <section className=" relative z-2 p-8 py-0 gap-8  bg-neutral-100 w-full flex justify-center items-center flex-col">
        <div className="flex justify-between w-full py-4 md:px-28 border-b md:max-w-[75vw]">
          <div className="text-sm text-muted-foreground font-semibold text-center ">
            © 2026 medcoreai.com
          </div>
          <div className="text-sm text-muted-foreground font-semibold text-center ">
            Built by <span className="text-foreground">@Team</span>
          </div>
        </div>
      </section>

      {/* footer */}
    </main>
  );
}
