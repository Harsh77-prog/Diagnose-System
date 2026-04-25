"use client";
import { Button } from "@/components/ui/button";
import {
  Activity,
  ArrowRight,
  Brain,
  ClipboardPlus,
  Globe,
  Lock,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  HeartPulse,
  FileText,
  Stethoscope,
  Clock,
  Users,
  Zap,
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
import { useRef, useState } from "react";
import { MedicalParticleRingCanvas } from "@/components/medical-particle-background";
import { LegalPolicyModal } from "@/components/legal-policy-modal";
import { FooterInfoModal } from "@/components/footer-info-modal";

const faqs = [
  {
    trigger: "Is MedCoreAI a substitute for professional medical care?",
    content:
      "No. MedCoreAI provides AI-powered health guidance and symptom analysis, but is not a substitute for professional medical diagnosis or treatment. Always consult licensed healthcare providers for medical advice. In emergencies, contact emergency services immediately.",
  },
  {
    trigger: "How do I start diagnosis mode?",
    content:
      "You can start diagnosis by typing commands like `diagnose:` or `predict:` before your message. Image uploads and report uploads also enter the diagnosis flow automatically when they are attached in chat.",
  },
  {
    trigger: "Can MedCoreAI answer normal medical questions too?",
    content:
      "Yes. The chat supports both normal healthcare conversation and the structured diagnosis flow. For example, you can ask educational questions like what a disease is, then switch into diagnosis when you want symptom-based guidance.",
  },
  {
    trigger: "What kinds of uploads are supported?",
    content:
      "The current app supports medical images and medical reports. Images are routed through the visual analysis flow, while reports such as PDFs are analyzed to extract findings and symptoms that can be used in the diagnosis process.",
  },
  {
    trigger: "How does image analysis choose the correct model?",
    content:
      "The app uses a mix of user-selected image type, conversation context, symptoms, and filename hints to choose the best matching image dataset. If the upload looks incorrect or unrelated, the system can ask the user to upload a proper medical image again.",
  },
  {
    trigger: "What happens if I upload the wrong image?",
    content:
      "The current system includes a validation step before image analysis. If an upload looks like a non-medical image or does not match the selected image type closely enough, the chat asks for a correct upload instead of returning a misleading result.",
  },
  {
    trigger: "Can I download my diagnosis as a PDF?",
    content:
      "Yes. After a completed result, the popup can generate and download a polished PDF summary. Right now that PDF is downloaded on demand and is not permanently stored by the app for later retrieval.",
  },
  {
    trigger: "Can I translate the response into Hindi?",
    content:
      "Yes. Assistant replies can be translated into Hindi directly in chat, which makes the result easier to review without leaving the conversation view.",
  },
  {
    trigger: "Does the app save my conversation history?",
    content:
      "Yes. Chat sessions and messages are stored so users can reopen previous conversations later. Diagnosis results remain available through the saved conversation history, even though the generated PDF file itself is not stored.",
  },
  {
    trigger: "Are the results final medical diagnoses?",
    content:
      "No. MedCoreAI provides AI-assisted guidance, preliminary analysis, and educational help. Users should treat the output as supportive information and verify important or urgent issues with a qualified healthcare professional.",
  },
];

const features = [
  {
    icon: Brain,
    title: "Conversational AI Doctor",
    description:
      "Text-based medical conversations designed to collect symptoms, ask relevant follow-up questions, and guide users through structured discussions.",
  },
  {
    icon: ClipboardPlus,
    title: "Medical Image Analysis",
    description:
      "Upload medical images such as X-rays or scans to receive AI-generated observations and visual explanations for review.",
  },
  {
    icon: Activity,
    title: "Symptom Analysis",
    description:
      "Analyzes user-reported symptoms to identify possible conditions, categorize severity, and highlight when professional consultation may be needed.",
  },
  {
    icon: FileText,
    title: "One-Time PDF Report Export",
    description:
      "After a completed result, users can generate and download a polished PDF summary from the result popup for offline review and sharing.",
  },
  {
    icon: ShieldCheck,
    title: "Medical Report Analysis",
    description:
      "Supports uploaded medical reports and extracts useful findings, symptoms, and clinical signals that are merged into the diagnosis flow.",
  },
  {
    icon: Zap,
    title: "Hindi Translation Support",
    description:
      "Assistant replies can be translated into Hindi directly inside the chat so users can review guidance in a more familiar language.",
  },
];

const stats = [
  { icon: Users, value: "1M+", label: "Users Trusted" },
  { icon: ShieldCheck, value: "94%", label: "Accuracy Rate" },
  { icon: Clock, value: "24/7", label: "Availability" },
];

const quickActions = [
  { icon: HeartPulse, label: "Check Symptoms", path: "/chat" },
  { icon: FileText, label: "Analyze Reports", path: "/chat" },
  { icon: Stethoscope, label: "Talk to AI Doctor", path: "/chat" },
];

// Feature card component with hover effects
function FeatureCard({ feature, index }: { feature: typeof features[0]; index: number }) {
  const Icon = feature.icon;

  return (
    <div
      className="relative group p-6 rounded-2xl border border-neutral-200 bg-white backdrop-blur-sm transition-all duration-500 hover:scale-[1.02] hover:shadow-xl"
      style={{
        animation: `fadeInUp 0.6s ease-out ${index * 0.1}s both`,
      }}
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-neutral-100 to-neutral-50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      <div className="relative z-10">
        <div className="inline-flex p-3 rounded-xl bg-neutral-900 mb-4">
          <Icon className="h-6 w-6 text-white" />
        </div>
        
        <h3 className="text-xl font-semibold mb-3 text-neutral-900 group-hover:text-neutral-700 transition-colors duration-300">
          {feature.title}
        </h3>
        
        <p className="text-neutral-600 leading-relaxed">
          {feature.description}
        </p>
        
        <div className="mt-4 flex items-center gap-2 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform translate-y-2 group-hover:translate-y-0">
          <span>Learn more</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

// Stat card component for light theme
function StatCard({ stat, index }: { stat: typeof stats[0]; index: number }) {
  const Icon = stat.icon;
  
  return (
    <div
      className="flex flex-col items-center p-6 rounded-xl bg-white border border-neutral-200"
      style={{
        animation: `fadeInUp 0.6s ease-out ${index * 0.15}s both`,
      }}
    >
      <Icon className="h-8 w-8 text-neutral-900 mb-3" />
      <div className="text-3xl font-bold text-neutral-900">{stat.value}</div>
      <div className="text-sm text-neutral-500">{stat.label}</div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement>(null);
  const [activeLegalModal, setActiveLegalModal] = useState<"privacy" | "terms" | null>(null);
  const [activeFooterModal, setActiveFooterModal] = useState<"about" | "security" | "contact" | null>(null);

  return (
    <main className="overflow-x-hidden">
      {/* Hero Section - Light Theme */}
      <section 
        ref={heroRef}
        className="relative w-full min-h-screen flex items-center justify-center px-6 pt-24 bg-gradient-to-br from-white via-neutral-50 to-neutral-100"
      >
        {/* Medical Particle Ring Background - Gradient Shiny Black Theme */}
        <MedicalParticleRingCanvas intensity="low" theme="shiny" />
        
        {/* Grid Pattern Overlay */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMwMDAwMDAiIGZpbGwtb3BhY2l0eT0iMC4wMiI+PHBhdGggZD0iTTM2IDM0djItSDI0di0yaDEyek0zNiAzMHYySDI0di0yaDEyek0zNiAyNnYySDI0di0yaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-30" />
        
        <div className="relative z-10 max-w-6xl mx-auto text-center">
          {/* Badge */}
          <div 
            className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 backdrop-blur-sm mb-8 transition-all duration-700 opacity-100 translate-y-0 shadow-sm"
          >
            <Sparkles className="h-4 w-4 text-neutral-600" />
            <span>AI-Powered Healthcare Revolution</span>
          </div>

          {/* Main Heading */}
          <h1 
            className="scroll-m-20 text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl md:text-6xl lg:text-7xl mb-6 transition-all duration-700 delay-100 opacity-100 translate-y-0"
          >
            Everything you need for{" "}
            <span className="bg-gradient-to-r from-neutral-700 via-neutral-900 to-neutral-700 bg-clip-text text-transparent">
              better health
            </span>
          </h1>

          {/* Subheading */}
          <p 
            className="mx-auto max-w-2xl text-lg text-neutral-600 mb-10 transition-all duration-700 delay-200 opacity-100 translate-y-0"
          >
            Experience the future of healthcare with our AI-powered medical assistant. 
            Get instant, accurate health guidance available 24/7
          </p>

          {/* CTA Buttons */}
          <div 
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12 transition-all duration-700 delay-300 opacity-100 translate-y-0"
          >
            <Button 
              size="lg"
              className="px-8 py-6 text-lg bg-neutral-900 hover:bg-neutral-800 text-white shadow-lg shadow-neutral-900/25 transition-all duration-300 hover:shadow-neutral-900/40 hover:scale-105"
              onClick={() => router.push("/signup")}
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-8 py-6 text-lg border-neutral-300 text-neutral-900 hover:bg-neutral-100 hover:border-neutral-400 backdrop-blur-sm transition-all duration-300"
              onClick={() => router.push("/chat")}
            >
              Try Demo Chat
            </Button>
          </div>

          {/* Quick Actions */}
          <div 
            className="flex flex-wrap items-center justify-center gap-3 mb-12 transition-all duration-700 delay-400 opacity-100 translate-y-0"
          >
            {quickActions.map((action, index) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={index}
                  onClick={() => router.push(action.path)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-neutral-200 text-sm text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-all duration-300 backdrop-blur-sm"
                >
                  <ActionIcon className="h-4 w-4" />
                  {action.label}
                </button>
              );
            })}
          </div>

          {/* Stats */}
          <div 
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mt-16 transition-all duration-700 delay-500 opacity-100 translate-y-0"
          >
            {stats.map((stat, index) => (
              <StatCard key={index} stat={stat} index={index} />
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="flex flex-col items-center gap-2 text-neutral-400">
            <span className="text-xs uppercase tracking-widest">Scroll</span>
            <div className="w-px h-12 bg-gradient-to-b from-neutral-400 to-transparent" />
          </div>
        </div>

        <style jsx>{`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </section>

      {/* Features Section - Light Theme */}
      <section id="features" className="relative py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm font-medium text-neutral-700 mb-6 shadow-sm">
              <Zap className="h-4 w-4 text-neutral-600" />
              <span>Powerful Features</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4">
              Comprehensive Healthcare AI
            </h2>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              Advanced AI capabilities designed to provide you with accurate, 
              personalized health guidance whenever you need it.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <FeatureCard key={index} feature={feature} index={index} />
            ))}
          </div>
        </div>
      </section>

      {/* Process Section */}
      <section className="relative py-24 px-6 bg-neutral-50 border-y border-neutral-200">
        <div className="max-w-7xl mx-auto">
          <Process1 className="py-0" />
        </div>
      </section>

      {/* FAQ Section - Light Theme */}
      <section className="relative py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            {/* Left Side - Title */}
            <div className="lg:sticky lg:top-32">
              <div className="inline-flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-sm font-medium text-neutral-700 mb-6 shadow-sm">
                <ShieldCheck className="h-4 w-4 text-neutral-600" />
                <span>Get Answers</span>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-6">
                Frequently Asked Questions
              </h2>
              <p className="text-lg text-neutral-600 mb-8">
                We've compiled the most important information to help you get the 
                most out of your experience. Can't find what you're looking for?
              </p>
              <Button
                variant="outline"
                className="border-neutral-300 text-neutral-900 hover:bg-neutral-100"
                onClick={() => router.push("/contact")}
              >
                Contact Support
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Right Side - Accordion */}
            <div>
              <Accordion
                type="single"
                collapsible
                defaultValue="item-1"
                className="space-y-4"
              >
                {faqs.map((faq, i) => (
                  <AccordionItem 
                    key={i} 
                    value={i.toString()}
                    className="border border-neutral-200 rounded-xl px-6 bg-white data-[state=open]:bg-neutral-50 transition-all duration-300"
                  >
                    <AccordionTrigger className="text-left py-4 text-base font-semibold text-neutral-900 hover:text-neutral-700 transition-colors">
                      {faq.trigger}
                    </AccordionTrigger>
                    <AccordionContent className="text-neutral-600 pb-4">
                      {faq.content}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - Light Theme */}
      <section className="relative py-32 px-6 overflow-hidden bg-gradient-to-br from-neutral-100 via-white to-neutral-100">
        {/* Animated orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-neutral-200 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-neutral-200 rounded-full blur-3xl animate-pulse delay-1000" />
        
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-bold text-neutral-900 mb-6">
            Ready to experience{" "}
            <span className="bg-gradient-to-r from-neutral-700 via-neutral-900 to-neutral-700 bg-clip-text text-transparent">
              smarter healthcare?
            </span>
          </h2>
          <p className="text-xl text-neutral-600 mb-10 max-w-2xl mx-auto">
            Start a conversation. Understand better. Decide responsibly. 
            Join thousands of users who trust MedCoreAI for their health guidance.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="px-8 py-6 text-lg bg-neutral-900 hover:bg-neutral-800 text-white shadow-lg shadow-neutral-900/25 transition-all duration-300 hover:shadow-neutral-900/40 hover:scale-105"
              onClick={() => router.push("/signup")}
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-8 py-6 text-lg border-neutral-300 text-neutral-900 hover:bg-neutral-100 transition-all duration-300"
              onClick={() => router.push("/chat")}
            >
              Try It Now
            </Button>
          </div>
        </div>
      </section>

      {/* Footer - Light Theme */}
      <footer className="relative bg-white border-t border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-neutral-900 flex items-center justify-center">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-neutral-900">MedCoreAI</span>
              </div>
              <p className="text-neutral-600 mb-6 max-w-md">
                AI-powered medical guidance you can trust. Helping you make 
                smarter health decisions, instantly.
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setActiveFooterModal("about")}
                  className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 transition-colors"
                >
                  <Globe className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFooterModal("security")}
                  className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 transition-colors"
                >
                  <Lock className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-neutral-900 font-semibold mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-neutral-600 hover:text-neutral-900 transition-colors">Features</a></li>
                <li>
                  <button
                    type="button"
                    onClick={() => setActiveFooterModal("security")}
                    className="text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    Security
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-neutral-900 font-semibold mb-4">Company</h4>
              <ul className="space-y-3">
                <li>
                  <button
                    type="button"
                    onClick={() => setActiveFooterModal("about")}
                    className="text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    About
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setActiveFooterModal("contact")}
                    className="text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    Contact
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <Separator className="bg-neutral-200 mb-8" />

          {/* Bottom Bar */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-neutral-500">
            <p>&copy; 2026 MedCoreAI. All rights reserved.</p>
            <div className="flex gap-6">
              <button
                type="button"
                onClick={() => setActiveLegalModal("privacy")}
                className="hover:text-neutral-900 transition-colors"
              >
                Privacy Policy
              </button>
              <button
                type="button"
                onClick={() => setActiveLegalModal("terms")}
                className="hover:text-neutral-900 transition-colors"
              >
                Terms of Service
              </button>
              <a href="#" className="hover:text-neutral-900 transition-colors">Built by @ MedCoreAI Team 🔱🕉️ </a>
            </div>
          </div>
        </div>
      </footer>

      <LegalPolicyModal
        open={activeLegalModal === "privacy"}
        type="privacy"
        onClose={() => setActiveLegalModal(null)}
      />
      <LegalPolicyModal
        open={activeLegalModal === "terms"}
        type="terms"
        onClose={() => setActiveLegalModal(null)}
      />
      <FooterInfoModal
        open={activeFooterModal === "about"}
        type="about"
        onClose={() => setActiveFooterModal(null)}
      />
      <FooterInfoModal
        open={activeFooterModal === "security"}
        type="security"
        onClose={() => setActiveFooterModal(null)}
      />
      <FooterInfoModal
        open={activeFooterModal === "contact"}
        type="contact"
        onClose={() => setActiveFooterModal(null)}
      />
    </main>
  );
}
