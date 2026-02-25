"use client";
import PasswordResetScreen from "./components/password-reset";

import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import axios from "axios";

type VerifyState = "active" | "expired" | "invalid";

export default function Page() {
  return (
    <Suspense fallback={"loading..."}>
      <Reset />
    </Suspense>
  );
}
function Reset() {
  const params = useSearchParams();
  const [isLoading, setLoading] = useState<boolean>(true);
  const [ValidState, setValidState] = useState<VerifyState>("invalid");
  const [token, setToken] = useState<string>("");

  const router = useRouter();

  const session = useSession();
  useEffect(() => {
    const token = params.get("token");
    if (!token) return;
    setToken(token);
    const TokenValidity = async () => {
      return await axios.post(
        "/api/auth/reset/isValid",
        JSON.stringify({ token }),
      );
    };
    (async () => {
      try {
        const { data } = await TokenValidity();
        if (data) {
          const { validity } = data as any;
          setLoading(!validity);
          if (validity) setValidState("active");
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
    <div>
      {isLoading ? (
        "loading..."
      ) : (
        <section className="font-sans w-full h-[100vh] flex items-center justify-center ">
          <PasswordResetScreen state={ValidState} token={token} />
        </section>
      )}
    </div>
  );
}
