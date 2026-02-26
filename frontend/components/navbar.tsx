"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const PUBLIC_LINKS = [
  { label: "Home", href: "/" },
  { label: "About us", href: "/about" },
];

const AUTH_LINKS = [...PUBLIC_LINKS, { label: "Dashboard", href: "/chat" }];

function UserProfileBar({
  name,
  email,
  mobile = false,
}: {
  name: string;
  email: string;
  mobile?: boolean;
}) {
  const initials = name.trim().charAt(0).toUpperCase() || "U";

  return (
    <div
      className={`flex items-center gap-3 rounded-md border p-2 ${mobile ? "w-full" : ""}`}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">
        {initials}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{email}</p>
      </div>
      <Button
        className="ml-auto"
        variant="outline"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        Sign out
      </Button>
    </div>
  );
}

function UserProfileMenu({ name, email }: { name: string; email: string }) {
  const initials = name.trim().charAt(0).toUpperCase() || "U";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-2 py-1.5 hover:bg-neutral-50"
          aria-label="Open profile menu"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
            {initials}
          </span>
          <ChevronDown className="h-4 w-4 text-neutral-600" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="mb-3 flex items-center gap-3 rounded-md border p-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
        </div>
        <Button className="w-full" variant="outline" onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function Navbar() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const links = isAuthenticated ? AUTH_LINKS : PUBLIC_LINKS;
  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "No email";

  return (
    <header className="fixed top-0 left-0 z-50 w-full border-b border-black/10 bg-white">
      <nav className="flex h-16 w-full items-center justify-between px-2 md:px-4">
        <Link href={"/"}>
          <div className="flex items-center gap-2 text-base font-semibold tracking-tight md:text-lg">
            <div className="rounded-xl border border-black/10 bg-gradient-to-b from-white to-neutral-100 p-1.5 shadow-sm">
              <Image src={"/globe.svg"} alt="MedCoreAI" width={22} height={22} />
            </div>
            <span>MedCoreAI</span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-4">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                pathname === l.href
                  ? "bg-black text-white"
                  : "text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              {l.label}
            </Link>
          ))}

          {isAuthenticated ? (
            <UserProfileMenu name={userName} email={userEmail} />
          ) : (
            <>
              <Button
                className="rounded-full px-5 shadow-none"
                variant={"outline"}
                onClick={() => router.push("/login")}
              >
                Sign in
              </Button>
              <Button className="rounded-full px-5" onClick={() => router.push("/signup")}>Get Started</Button>
            </>
          )}
        </div>

        <div className="md:hidden">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                aria-label="Toggle Menu"
                className="relative flex h-8 w-8 items-center justify-center"
              >
                <div className="relative size-4">
                  <span
                    className={`bg-foreground absolute left-0 block h-0.5 w-4 transition-all duration-200 ${
                      open ? "top-[0.4rem] -rotate-45" : "top-1 rotate-0"
                    }`}
                  />
                  <span
                    className={`bg-foreground absolute left-0 block h-0.5 w-4 transition-all duration-200 ${
                      open ? "top-[0.4rem] rotate-45" : "top-2.5 rotate-0"
                    }`}
                  />
                </div>
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="end"
              sideOffset={0}
              className="mt-0 h-[calc(100vh-64px)] w-screen rounded-none border-0 bg-white p-6 shadow-lg"
            >
              <div className="flex flex-col gap-6">
                {links.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`text-2xl font-medium ${pathname === l.href ? "text-black" : "text-neutral-700"}`}
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </Link>
                ))}

                {isAuthenticated ? (
                  <UserProfileBar name={userName} email={userEmail} mobile />
                ) : (
                  <div className="flex flex-col justify-between gap-2">
                    <Button
                      className="shadow-none rounded-md w-full"
                      variant={"outline"}
                      onClick={() => {
                        setOpen(false);
                        router.push("/login");
                      }}
                    >
                      Sign in
                    </Button>
                    <Button
                      className="w-full"
                      onClick={() => {
                        setOpen(false);
                        router.push("/signup");
                      }}
                    >
                      Get Started
                    </Button>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
    </header>
  );
}
