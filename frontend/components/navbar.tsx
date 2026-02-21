"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

const LINKS = [
  { label: "Home", href: "/" },
  { label: "Philosophy", href: "/Philosophy" },
  { label: "About us", href: "/about" },
];

export function Navbar() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  return (
    <header className="fixed top-0 left-0 w-full z-50">
      <nav className="py-2 flex items-center justify-between px-4 md:px-8 bg-white/90 backdrop-blur-sm border">
        {/* Logo */}
        <Link href={"/"}>
          <div className="text-md items-center gap-2 flex md:text-lg font-semibold">
            <Image src={"/globe.svg"} alt="TNP" width={30} height={30} />
            MedCoreAI
          </div>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-4">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium hover:underline"
            >
              {l.label}
            </Link>
          ))}
          <Button
            className="shadow-none rounded-md"
            variant={"outline"}
            onClick={() => router.push("/login")}
          >
            Sign in
          </Button>
          <Button className=" " onClick={() => router.push("/signup")}>
            Get Started
          </Button>
        </div>

        {/* Mobile menu (Popover) */}
        <div className="md:hidden">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                aria-label="Toggle Menu"
                className="relative flex h-8 w-8 items-center justify-center"
              >
                <div className="relative size-4">
                  {/* top bar */}
                  <span
                    className={`bg-foreground absolute left-0 block h-0.5 w-4 transition-all duration-200 ${
                      open ? "top-[0.4rem] -rotate-45" : "top-1 rotate-0"
                    }`}
                  />
                  {/* bottom bar */}
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
              sideOffset={8}
              className="w-screen h-[calc(100vh-56px)] mt-2 bg-white/90 backdrop-blur-md rounded-none shadow-lg p-6 border-0"
            >
              <div className="flex flex-col gap-6">
                {LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="text-2xl font-medium"
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </Link>
                ))}

                <div className="flex flex-col justify-between gap-2">
                  <Button
                    className="shadow-none rounded-md w-full"
                    variant={"outline"}
                  >
                    Sign in
                  </Button>
                  <Button
                    className="w-full"
                    onClick={() => router.push("/signup")}
                  >
                    Get Started
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
    </header>
  );
}
