"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function OnboardingPage() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
      return;
    }

    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  return null;
}
