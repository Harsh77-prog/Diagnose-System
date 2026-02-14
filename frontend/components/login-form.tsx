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
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";

export function LoginForm({
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
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false, // 👈 critical
      });

      if (!result) {
        setError("Something went wrong");
        return;
      }

      if (result.error) {
        // 👇 THIS prevents redirect to /api/auth/error
        setError("Invalid email or password");
        return;
      }

      // ✅ success → redirect to Diagnose
      window.location.href = "/diagnose";
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
          <CardTitle className="text-2xl text-slate-800">Welcome back</CardTitle>
          <CardDescription className="text-slate-600">
            Sign in with email or Google to access your medical guidance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  className="rounded-xl border-slate-200 hover:bg-slate-50"
                  onClick={() =>
                    signIn("google", {
                      callbackUrl: "/diagnose",
                    })
                  }
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  Login with Google
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-slate-100 *:data-[slot=field-separator-content]:text-slate-500">
                Or continue with email
              </FieldSeparator>
              <Field>
                <FieldLabel htmlFor="email" className="text-slate-700">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  className="rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white"
                />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password" className="text-slate-700">Password</FieldLabel>
                  <a
                    href="#"
                    className="ml-auto text-sm text-teal-600 hover:underline"
                  >
                    Forgot password?
                  </a>
                </div>
                <Input id="password" name="password" type="password" required className="rounded-xl border-slate-200 bg-slate-50/50 focus:bg-white" />
              </Field>
              {error && (
                <p className="text-sm text-red-500 text-center font-medium">{error}</p>
              )}
              <Field>
                <Button type="submit" className="rounded-xl bg-teal-500 hover:bg-teal-600 text-white font-semibold">
                  Login
                </Button>
                <FieldDescription className="text-center text-slate-600">
                  Don&apos;t have an account? <Link href="/signup" className="text-teal-600 font-medium hover:underline">Sign up</Link>
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
