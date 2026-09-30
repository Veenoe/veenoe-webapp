"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

type Hero17Props = { headline: string };

export default function Hero17({ headline }: Hero17Props) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative isolate flex min-h-svh flex-col overflow-hidden bg-[#dfe9ec] text-[#17322b]">
      {/* The registry image is decorative; the gradient holds text contrast if it fails to load. */}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,#e8f0f3_0%,#f1f5ef_57%,#9abb74_100%)]" />
      <motion.img
        src="https://assets.watermelon.sh/hero-17-bg.avif"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover object-center"
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/30 to-transparent" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" className="text-2xl font-semibold tracking-tight focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#175c49]">
          Veenoe<span className="text-teal-700">.</span>
        </Link>
        <nav aria-label="Account" className="flex items-center gap-1 sm:gap-3">
          <ThemeToggle />
          <SignInButton mode="modal">
            <Button variant="ghost" className="min-h-11 px-3 text-[#17322b] hover:bg-white/50 hover:text-[#17322b]">Log in</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button className="min-h-11 bg-linear-to-b from-teal-600 to-teal-700 px-4 text-white hover:from-teal-700 hover:to-teal-800 sm:px-5">Sign up</Button>
          </SignUpButton>
        </nav>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5 pb-24 pt-[clamp(1rem,4vh,3rem)] text-center sm:px-8">
        <motion.span
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="rounded-md border border-white/50 bg-white/55 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#285b50] shadow-sm backdrop-blur-sm"
        >
          Learn differently
        </motion.span>
        <motion.h1
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
          className="mt-5 max-w-5xl text-[clamp(2.75rem,5.7vw,5.4rem)] font-medium leading-[1.05] tracking-[-0.055em] text-balance"
        >
          {headline}
        </motion.h1>
        <motion.p
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.14, ease: "easeOut" }}
          className="mt-5 max-w-lg text-sm leading-relaxed text-[#344d45] text-pretty sm:text-base"
        >
          Spend 10 minutes a day with Veenoe. and discover how you learn best.
        </motion.p>
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          className="mt-7"
        >
          <Button asChild size="lg" className="min-h-12 bg-linear-to-b from-teal-600 to-teal-700 px-7 text-white shadow-md hover:from-teal-700 hover:to-teal-800">
            <Link href="/viva">Get started <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
