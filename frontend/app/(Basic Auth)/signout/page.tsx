"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { signOut } from "next-auth/react";
import Link from "next/link";

export default function SignoutPage() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>Sign out</CardTitle>
            <CardDescription>
              Are you sure you want to sign out of your account?
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button
              variant="destructive"
              onClick={() => signOut({ redirect: true, callbackUrl: "/" })}
            >
              Sign out
            </Button>
            <Link href="/" className="text-center text-sm text-muted-foreground hover:underline">
              Cancel and go home
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
