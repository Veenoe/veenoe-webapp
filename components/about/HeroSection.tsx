import { Button } from "@/components/ui/button";
import Link from "next/link";

export function HeroSection() {
    return (
        <section className="relative flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden p-4 text-center">
            {/* This is a modern way to create the background glow.
        It's a blurred, colored div placed behind the content.
      */}
            <div
                aria-hidden="true"
                className="absolute top-0 left-1/2 -z-10 -translate-x-1/2 -translate-y-1/3"
            >
                <div className="h-160 w-160 rounded-full bg-light-orange-300 opacity-20 blur-[120px] dark:bg-pumpkin-500 dark:opacity-10" />
            </div>

            {/* Main Brand Name */}
            <h1 className="text-8xl font-light tracking-tighter text-foreground md:text-9xl">
                Veenoe
            </h1>

            {/* Try Now Badge - Interactive */}
            <Link href="/viva" className="group relative inline-block">
                <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-pumpkin-400/40 blur-xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-100 dark:bg-pumpkin-500/30"
                />

                <span className="relative flex items-center justify-center">
                    <span
                        aria-hidden="true"
                        className="absolute -left-2 top-1 h-2 w-2 animate-pulse rounded-full bg-yellow-300 shadow-[0_0_12px_rgba(253,224,71,0.9)]"
                    />
                    <span
                        aria-hidden="true"
                        className="absolute -right-1 top-0 h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-duration:1.8s]"
                    />
                    <span
                        aria-hidden="true"
                        className="absolute bottom-1 right-5 h-1.5 w-1.5 animate-ping rounded-full bg-orange-200 [animation-duration:2.4s]"
                    />

                    <span className="relative overflow-hidden rounded-full border border-white/30 bg-gradient-to-r from-light-orange-500 via-pumpkin-500 to-light-orange-600 px-5 py-2 text-white shadow-[0_12px_30px_rgba(249,115,22,0.28)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:scale-105 group-hover:shadow-[0_18px_40px_rgba(249,115,22,0.38)] dark:border-pumpkin-300/20">
                        <span
                            aria-hidden="true"
                            className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-1000 group-hover:translate-x-full"
                        />
                        <span className="relative flex items-center gap-2 text-lg font-semibold tracking-wide md:text-xl">
                            <span className="inline-flex h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.95)]" />
                            Try Now
                            <span className="transition-transform duration-300 group-hover:translate-x-1">
                                &rarr;
                            </span>
                        </span>
                    </span>
                </span>
            </Link>

            {/* Main Paragraph */}
            <p className="mt-2 max-w-2xl text-xl leading-relaxed text-muted-foreground">
                In a world where learning has become mechanical, where students
                memorize but don&apos;t understand, where education tests recall but not
                insight -
                <span className="font-medium text-pumpkin-500 dark:text-pumpkin-400">
                    &nbsp;we reimagine the journey of knowledge.
                </span>
            </p>

            {/* CTA Button Group - Aligned Side by Side */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                {/* Secondary Action: Subtle Styling */}
                <Link href="/about">
                    <Button
                        size="lg"
                        className="rounded-full bg-linear-to-r from-pumpkin-500 to-light-orange-600 px-8 font-semibold text-white-smoke-900 shadow-lg transition-all hover:shadow-md hover:opacity-90"
                    >
                        Know More About Us
                    </Button>
                </Link>

                {/* Primary Action: Beta Version (With Animation) */}
                <Link href="/viva">
                    <Button
                        size="lg"
                        className="group relative overflow-hidden rounded-full bg-linear-to-r from-pumpkin-500 to-light-orange-600 px-8 font-bold text-white shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-[0_0_20px_rgba(249,115,22,0.6)] hover:ring-2 hover:ring-pumpkin-400 hover:ring-offset-2 dark:text-white-smoke-900 dark:hover:ring-offset-slate-900"
                    >
                        {/* Optional: Subtle Shine Effect overlay */}
                        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />

                        <span className="relative flex items-center gap-2">
                            Explore Veenoe
                            {/* Simple arrow or icon adds to the CTA feel */}
                            <span className="transition-transform duration-300 group-hover:translate-x-1">
                                &rarr;
                            </span>
                        </span>
                    </Button>
                </Link>
            </div>
        </section>
    );
}