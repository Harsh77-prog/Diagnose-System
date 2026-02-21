"use client";

import { Check, AlertCircle, XCircle, Clock, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type VerifyState = "active" | "expired" | "invalid";

interface VerifyAccountScreenProps {
  state: VerifyState;
}

export default function VerifyAccountScreen({
  state,
}: VerifyAccountScreenProps) {
  const getStateContent = () => {
    switch (state) {
      case "active":
        return {
          icon: Check,
          title: "Email Verified Successfully!",
          description:
            "Your email address has been verified. Your account is now fully active and ready to use.",
          status: "success",
          statusText: "Active Link",
          details: [
            "Your email is confirmed",
            "All features are unlocked",
            "You can now sign in anytime",
          ],
          primaryAction: "Go to Dashboard",
          primaryHref: "#",
        };
      case "expired":
        return {
          icon: Clock,
          title: "Verification Link Expired",
          description:
            "Your email verification link has expired. Links are valid for 24 hours.",
          status: "warning",
          statusText: "Expired Link",
          details: [
            "Link was valid for 24 hours",
            "Current time has passed the expiration",
            "Request a new verification email",
          ],
          primaryAction: "Send New Link",
          primaryHref: "#",
          secondaryAction: "Back to Login",
          secondaryHref: "#",
        };
      case "invalid":
        return {
          icon: XCircle,
          title: "Invalid Verification Link",
          description:
            "This verification link is invalid, malformed, or has already been used.",
          status: "error",
          statusText: "Invalid Link",
          details: [
            "Link may have been corrupted",
            "Link may have already been used",
            "Please request a new verification email",
          ],
          primaryAction: "Request New Link",
          primaryHref: "#",
          secondaryAction: "Contact Support",
          secondaryHref: "#",
        };
    }
  };

  const content = getStateContent();
  const Icon = content.icon;
  const statusColors = {
    success:
      "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
    warning:
      "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
    error: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
  };

  const iconColors = {
    success: "text-green-600 dark:text-green-400",
    warning: "text-amber-600 dark:text-amber-400",
    error: "text-red-600 dark:text-red-400",
  };

  const badgeColors = {
    success:
      "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200",
    warning:
      "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200",
    error: "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200",
  };

  return (
    <div className="w-full max-w-md">
      <Card
        className={`border-2 p-8 ${statusColors[content.status as keyof typeof statusColors]}`}
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center ${
                content.status === "success"
                  ? "bg-green-100 dark:bg-green-900"
                  : content.status === "warning"
                    ? "bg-amber-100 dark:bg-amber-900"
                    : "bg-red-100 dark:bg-red-900"
              }`}
            >
              <Icon
                className={`w-8 h-8 ${iconColors[content.status as keyof typeof iconColors]}`}
              />
            </div>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex justify-center mb-6">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${badgeColors[content.status as keyof typeof badgeColors]}`}
          >
            {content.statusText}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-foreground mb-3">
          {content.title}
        </h1>

        {/* Description */}
        <p className="text-center text-muted-foreground mb-8">
          {content.description}
        </p>

        {/* Details List */}
        <div className="space-y-3 mb-8 bg-background/50 rounded-lg p-4">
          {content.details.map((detail, index) => (
            <div key={index} className="flex items-start gap-3">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  content.status === "success"
                    ? "bg-green-200 dark:bg-green-800"
                    : content.status === "warning"
                      ? "bg-amber-200 dark:bg-amber-800"
                      : "bg-red-200 dark:bg-red-800"
                }`}
              >
                {content.status === "success" && (
                  <Check className="w-3 h-3 text-green-700 dark:text-green-300" />
                )}
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

        {/* Actions */}
        <div className="space-y-3">
          <Button
            className="w-full h-10 font-semibold"
            variant={content.status === "success" ? "default" : "outline"}
          >
            {content.primaryAction}
          </Button>
          {content.secondaryAction && (
            <Button variant="outline" className="w-full h-10 font-semibold">
              {content.secondaryAction}
            </Button>
          )}
        </div>

        {/* Info Footer */}
        {state === "active" && (
          <div className="mt-8 pt-6 border-t border-current/10 text-center">
            <p className="text-xs text-muted-foreground mb-3">
              Need help getting started?
            </p>
            <Button variant="ghost" size="sm" className="text-xs">
              <Home className="w-3 h-3 mr-1" />
              View Documentation
            </Button>
          </div>
        )}
      </Card>

      {/* Email Info */}
      <div className="mt-6 text-center text-sm text-muted-foreground">
        <p>
          Verification email sent to:{" "}
          <span className="font-medium text-foreground">user@example.com</span>
        </p>
      </div>
    </div>
  );
}
