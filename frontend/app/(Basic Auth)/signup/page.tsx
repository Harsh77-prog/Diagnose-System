import Link from "next/link";
import { Stethoscope } from "lucide-react";

import { SignupForm } from "@/components/signup-form";

export default function SignupPage() {
  return (
    <div className="medical-pattern min-h-svh flex flex-col items-center justify-center gap-8 p-6 md:p-10 bg-slate-50/80">
      <div className="w-full max-w-md flex flex-col gap-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 self-center font-semibold text-slate-800 hover:text-teal-600 transition-colors"
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500 text-white shadow-sm">
            <Stethoscope className="size-5" />
          </div>
          MedCoreAI
        </Link>
        <SignupForm />
      </div>
    </div>
  );
}
