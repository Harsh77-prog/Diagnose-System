"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const name = `${firstName} ${lastName}`;

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      // auto login after signup → redirect to Diagnose
      await signIn("credentials", {
        email,
        password,
        redirect: true,
        callbackUrl: "/diagnose",
      });
    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="rounded-2xl border-slate-200 bg-white shadow-xl shadow-slate-200/30">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl text-slate-800">Create your account</CardTitle>
          <CardDescription className="text-slate-600">
            Enter your details to get started with MedCoreAI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="firstName" className="text-slate-700">First name</FieldLabel>
                  <Input
                    name="firstName"
                    id="firstName"
                    type="text"
                    placeholder="John"
                    required
                    className="rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="lastName" className="text-slate-700">Last name</FieldLabel>
                  <Input
                    name="lastName"
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    required
                    className="rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white"
                  />
                </Field>
              </Field>
              <Field>
                <FieldLabel htmlFor="email" className="text-slate-700">Email</FieldLabel>
                <Input
                  name="email"
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password" className="text-slate-700">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  required
                  name="password"
                  className="rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white"
                />
                <FieldDescription className="text-slate-500">
                  Use 8+ characters with letters, numbers and symbols. Avoid using your name.
                </FieldDescription>
              </Field>
              {error && (
                <p className="text-sm text-red-500 text-center font-medium">{error}</p>
              )}
              <Field>
                <Button
                  type="submit"
                  className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-semibold"
                >
                  {loading ? "Creating..." : "Create Account"}
                </Button>
                <FieldDescription className="text-center text-slate-600">
                  Already have an account?{" "}
                  <Link href="/login" className="text-teal-600 font-medium hover:underline">
                    Sign in here
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-2 text-center text-slate-500 text-sm">
        By continuing, you agree to our <a href="#" className="text-teal-600 hover:underline">Terms of Service</a> and <a href="#" className="text-teal-600 hover:underline">Privacy Policy</a>.
      </FieldDescription>
    </div>
  );
}
