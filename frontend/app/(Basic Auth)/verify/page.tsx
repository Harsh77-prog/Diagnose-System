"use client";
import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";
import VerifyAccountScreen from "./components/verify-account";

type VerifyState = "active" | "expired" | "invalid";

export default function VerifyPage() {
  const params = useSearchParams();
  const [isLoading, setLoading] = useState<boolean>(true);
  const [ValidState, setValidState] = useState<VerifyState>("invalid");
  const router = useRouter();
  useEffect(() => {
    const token = params.get("token");
    const TokenValidity = async () => {
      return await axios.post(
        "/api/auth/verify/isValid",
        JSON.stringify({ token }),
      );
    };
    (async () => {
      try {
        const { data } = await TokenValidity();

        if (data) {
          const { validity } = data as any;
          if (validity) {
            setValidState("active");
            await axios.post("/api/auth/verify", JSON.stringify({ token }));
          }
          setLoading(!validity);
        }
      } catch (err) {
        if ((err as any).message.toLowerCase().includes("code 404")) {
          setValidState("invalid");
        }
        if ((err as any).message.toLowerCase().includes("code 400")) {
          setValidState("expired");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [params]);

  return (
    <div className="flex items-center justify-center h-[100vh] flex-col">
      {isLoading
        ? "loading..."
        : ValidState && <VerifyAccountScreen state={ValidState} />}
    </div>
  );
}
