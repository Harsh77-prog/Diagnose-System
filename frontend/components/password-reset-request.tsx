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
import axios from "axios";
import { Spinner } from "./ui/spinner";

const errorMessages = {
  title: "Unexpected error occurred!",
  message: "Something went wrong. Please try again.",
};

export function ForgotPasword({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [loading, setLoading] = useState(false);

  const [success, setSuccess] = useState<boolean>(false);

  const [error, setError] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(false);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;

    try {
      await axios.post(
        "/api/auth/reset/requestLink",
        JSON.stringify({ email }),
      );
      setSuccess(true);
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
      setTimeout(() => setError(false), 2000);
      setTimeout(() => setSuccess(false), 2000);
      if (success) setTimeout(() => setEmail(""), 2000);
    }
  }
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success && (
        <div className="mt-6 p-4 bg-green-100 dark:bg-green-900 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                Password reset link sent successful!
              </p>
              <p className="text-xs text-green-800 dark:text-green-200 mt-1">
                You can now check your mail for password reset link .
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 bg-red-200 dark:bg-red-500 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-sm font-semibold text-red-600 dark:text-white">
                {errorMessages.title}
              </p>

              <p className="text-xs text-red-600 dark:text-red-100 mt-1">
                {errorMessages.message}
              </p>
            </div>
          </div>
        </div>
      )}
      <Card className="w-full min-w-72">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Forgot password?</CardTitle>
          <CardDescription>
            Enter your details below to request an account password reset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                  value={email}
                  id="email"
                  name="email"
                  type="email"
                  placeholder="m@example.com"
                  required
                />
              </Field>
              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}
              <Field>
                <Button type="submit">
                  {loading ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Submitting
                    </>
                  ) : (
                    "Submit"
                  )}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
