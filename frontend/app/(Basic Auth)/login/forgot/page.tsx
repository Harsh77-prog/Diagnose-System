"use client";
import { ForgotPasword } from "@/components/password-reset-request";

export default function ResetRequestPage() {
  return (
    <section className="h-[100vh] w-full flex items-center justify-center">
      <div>
        <ForgotPasword />
      </div>
    </section>
  );
}
