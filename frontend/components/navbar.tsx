"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Stethoscope, Menu } from "lucide-react";

const LINKS = [
  { label: "Home", href: "/" },
  { label: "Diagnose", href: "/diagnose" },
  { label: "Philosophy", href: "/Philosophy" },
  { label: "About us", href: "/about" },
];

export function Navbar() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  const handleSignIn = () => {
    setOpen(false);
    router.push("/login");
  };

  const handleSignUp = () => {
    setOpen(false);
    router.push("/signup");
  };

  const handleSignOut = () => {
    setOpen(false);
    signOut({ callbackUrl: "/" });
  };

  return (
    <header className="fixed top-0 left-0 w-full z-50">
      <nav className="py-3 flex items-center justify-between px-4 md:px-10 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-sm shadow-slate-200/20">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex size-9 items-center justify-center rounded-lg bg-teal-500 text-white shadow-sm group-hover:bg-teal-600 transition-colors">
            <Stethoscope className="size-5" />
          </div>
          <span className="text-base md:text-lg font-semibold text-slate-800 tracking-tight">
            MedCoreAI
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors"
            >
              {l.label}
            </Link>
          ))}
          {status === "loading" ? (
            <span className="text-sm text-slate-400">...</span>
          ) : session ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500 truncate max-w-36">
                {session.user?.email || session.user?.name}
              </span>
              <Button
                className="rounded-lg border-slate-200 text-slate-600 hover:bg-slate-50"
                variant="outline"
                size="sm"
                onClick={() => handleSignOut()}
              >
                Sign out
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                className="rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50"
                variant="outline"
                onClick={handleSignIn}
              >
                Sign in
              </Button>
              <Button
                className="rounded-lg bg-teal-500 hover:bg-teal-600 text-white shadow-sm"
                onClick={handleSignUp}
              >
                Get Started
              </Button>
            </div>
          )}
        </div>

        {/* Mobile menu (Popover) */}
        <div className="md:hidden">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                aria-label="Toggle Menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              >
                <Menu className="size-5" />
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-[calc(100vw-2rem)] max-w-sm rounded-xl border-slate-200 bg-white shadow-xl p-6"
            >
              <div className="flex flex-col gap-4">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="text-lg font-medium text-slate-700 py-2 hover:text-teal-600 transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </Link>
                ))}

                <div className="flex flex-col gap-2 pt-4 border-t border-slate-100">
                  {session ? (
                    <>
                      <p className="text-sm text-slate-500 truncate pb-2">
                        {session.user?.email || session.user?.name}
                      </p>
                      <Button
                        className="rounded-lg w-full"
                        variant="destructive"
                        onClick={handleSignOut}
                      >
                        Sign out
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        className="rounded-lg w-full border-slate-200"
                        variant="outline"
                        onClick={handleSignIn}
                      >
                        Sign in
                      </Button>
                      <Button
                        className="w-full rounded-lg bg-teal-500 hover:bg-teal-600"
                        onClick={handleSignUp}
                      >
                        Get Started
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
    </header>
  );
}
