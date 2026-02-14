"use client";

import { motion } from "framer-motion";
import { Heart, Shield, Users, Zap } from "lucide-react";

export default function AboutPage() {
  const values = [
    {
      icon: <Heart className="size-8 text-teal-500" />,
      title: "Patient-First",
      description:
        "We put your health understanding first. Clear, accessible language for complex medical concepts.",
    },
    {
      icon: <Shield className="size-8 text-teal-500" />,
      title: "Secure & Private",
      description:
        "HIPAA-compliant security. Your health data is encrypted and never shared without consent.",
    },
    {
      icon: <Users className="size-8 text-teal-500" />,
      title: "Professional Network",
      description:
        "Seamless referrals to healthcare providers when professional care is needed.",
    },
    {
      icon: <Zap className="size-8 text-teal-500" />,
      title: "Always Available",
      description:
        "24/7 AI assistance to help you articulate symptoms and understand next steps.",
    },
  ];

  return (
    <motion.div
      className="min-h-screen bg-slate-50/50"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-24 pb-16 md:pt-28 md:pb-24">
        <h1 className="text-4xl md:text-5xl font-bold text-slate-800 mb-4">
          About MedCoreAI
        </h1>
        <p className="text-lg text-slate-600 mb-12 leading-relaxed">
          MedCoreAI is an AI-powered medical guidance platform designed to help
          you understand symptoms, medical reports, and make informed health
          decisions — with clarity and care.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 mb-14">
          {values.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="flex gap-4 p-6 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-teal-100 transition-all"
            >
              <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                {item.icon}
              </div>
              <div>
                <h2 className="font-semibold text-lg text-slate-800 mb-2">
                  {item.title}
                </h2>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {item.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="text-sm text-slate-500 leading-relaxed p-4 rounded-xl bg-slate-100/80 border border-slate-100">
          MedCoreAI is for informational purposes only and does not provide
          medical advice, diagnosis, or treatment. Always consult a qualified
          healthcare professional.
        </p>
      </div>
    </motion.div>
  );
}
