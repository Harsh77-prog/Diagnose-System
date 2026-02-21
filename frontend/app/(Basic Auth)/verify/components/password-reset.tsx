"use client";

import { useState } from "react";
import {
  Check,
  AlertCircle,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  Lock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axios from "axios";
import { Spinner } from "@/components/ui/spinner";

type ResetState = "active" | "expired" | "invalid";

interface PasswordResetScreenProps {
  state: ResetState;
  token: string;
}
const errorMessages = {
  mismatch: {
    title: "Passwords do not match!",
    message: "Both fields must contain the same password.",
  },
  length: {
    title: "Password too short!",
    message: "Password must be at least 3 characters long.",
  },
  unexpected: {
    title: "Unexpected error occurred!",
    message: "Something went wrong. Please try again.",
  },
};

export default function PasswordResetScreen({
  state,
  token,
}: PasswordResetScreenProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [sucess, setSucess] = useState(false);
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");

  const [errorType, setErrorType] = useState<
    "mismatch" | "length" | "unexpected" | null
  >(null);
  // "mismatch" | "length" | "unexpected" | null

  const getStateContent = () => {
    switch (state) {
      case "active":
        return {
          icon: Check,
          title: "Reset Your Password",
          description:
            "Create a new password for your account. Choose a strong password you haven't used before.",
          status: "success",
          statusText: "Active Link",
          showForm: true,
          primaryAction: "Reset Password",
          primaryHref: "#",
        };
      case "expired":
        return {
          icon: Clock,
          title: "Password Reset Link Expired",
          description:
            "Your password reset link has expired. For security, links are only valid for 1 hour.",
          status: "warning",
          statusText: "Expired Link",
          showForm: false,
          details: [
            "Link was valid for 1 hour",
            "Current time has passed the expiration",
            "Request a new password reset email",
          ],

          secondaryAction: "Back to Login",
          secondaryHref: "#",
        };
      case "invalid":
        return {
          icon: XCircle,
          title: "Invalid Reset Link",
          description:
            "This password reset link is invalid, malformed, or has already been used.",
          status: "error",
          statusText: "Invalid Link",
          showForm: false,
          details: [
            "Link may have been corrupted",
            "Link may have already been used",
            "Please request a new password reset email",
          ],
        };
    }
  };

  const content = getStateContent();
  const statusColors = {
    success:
      " dark:bg-blue-950 border-neutral-200 shadow-none dark:border-blue-800",
    warning:
      "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
    error: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
  };

  const validatePassword = async () => {
    if (password.length < 8) {
      setErrorType("length");
      return;
    }

    if (password !== confirmPassword) {
      setErrorType("mismatch");
      return;
    }

    try {
      setIsSubmitted(true);
      await axios.post("/api/auth/reset", JSON.stringify({ token, password }));
      setSucess(true);
      setErrorType(null);
    } catch (err) {
      setErrorType("unexpected");
      setTimeout(() => setErrorType(null), 2000);
    } finally {
      setIsSubmitted(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <Card
        className={`border-2 p-8 ${statusColors[content.status as keyof typeof statusColors]}`}
      >
        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-foreground mb-3">
          {content.title}
        </h1>

        {/* Description */}
        <p className="text-center text-muted-foreground mb-8">
          {content.description}
        </p>

        {/* Form - Only show for active state */}
        {content.showForm ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await validatePassword();
            }}
            className="space-y-6"
          >
            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                New Password
              </Label>
              <div className="relative">
                <Input
                  onChange={(e) => {
                    setPassword(e.target.value);
                  }}
                  id="password"
                  value={password}
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your new password"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                At least 8 characters, with uppercase, lowercase, and numbers
              </p>
            </div>

            {/* Confirm Password Field */}
            <div className="space-y-2">
              <Label htmlFor="confirm" className="text-sm font-medium">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                  }}
                  id="confirm"
                  value={confirmPassword}
                  type={showConfirm ? "text" : "password"}
                  placeholder="Confirm your new password"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-10 font-semibold"
              disabled={isSubmitted}
            >
              {!sucess ? (
                <>
                  {isSubmitted ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Lock className="w-4 h-4 mr-2" />
                  )}
                  {isSubmitted ? "Resetting Password" : "Reset Password"}
                </>
              ) : (
                "Password Reset Complete!"
              )}
            </Button>
          </form>
        ) : (
          <>
            {/* Details List for inactive states */}
            <div className="space-y-3 mb-8 bg-background/50 rounded-lg p-4">
              {content.details?.map((detail: string, index: number) => (
                <div key={index} className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      content.status === "warning"
                        ? "bg-amber-200 dark:bg-amber-800"
                        : "bg-red-200 dark:bg-red-800"
                    }`}
                  >
                    {content.status === "warning" && (
                      <Clock className="w-3 h-3 text-amber-700 dark:text-amber-300" />
                    )}
                    {content.status === "error" && (
                      <XCircle className="w-3 h-3 text-red-700 dark:text-red-300" />
                    )}
                  </div>
                  <span className="text-sm text-foreground">{detail}</span>
                </div>
              ))}
            </div>

            {/* Actions for inactive states */}
            <div className="space-y-3">
              {content.primaryAction && (
                <Button className="w-full h-10 font-semibold">
                  {content.primaryAction}
                </Button>
              )}
              {content.secondaryAction && (
                <Button variant="outline" className="w-full h-10 font-semibold">
                  {content.secondaryAction}
                </Button>
              )}
            </div>
          </>
        )}

        {/* Success Message */}
        {sucess && state === "active" && (
          <div className="mt-6 p-4 bg-green-100 dark:bg-green-900 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                  Password reset successful!
                </p>
                <p className="text-xs text-green-800 dark:text-green-200 mt-1">
                  You can now sign in with your new password.
                </p>
              </div>
            </div>
          </div>
        )}

        {errorType && (
          <div className="mt-6 p-4 bg-red-200 dark:bg-red-500 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-3">
              <X className="w-5 h-5 text-red-500 dark:text-red-300 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-600 dark:text-white">
                  {errorMessages[errorType].title}
                </p>

                <p className="text-xs text-red-600 dark:text-red-100 mt-1">
                  {errorMessages[errorType].message}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
