import { Button } from "@/components/ui/button";
import Link from "next/link";

export function HeroSection() {
    return (
        <section className="relative flex min-h-screen w-full flex-col items-center justify-center gap-6 overflow-hidden p-4 text-center">
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

            {/* Coming Soon Badge */}
            <div className="rounded-full bg-light-orange-600 px-4 py-1.5 text-sm font-medium text-orange-600 dark:bg-pumpkin-900 dark:text-pumpkin-200">
                <p className="text-lg md:text-xl font-medium tracking-wide">
                    Coming Soon
                </p>
            </div>

            {/* Main Paragraph */}
            <p className="mt-2 max-w-2xl text-xl leading-relaxed text-muted-foreground">
                In a world where learning has become mechanical, where students
                memorize but don&apos;t understand, where education tests recall but not
                insight—
                <span className="font-medium text-pumpkin-500 dark:text-pumpkin-400">
                    {/* We add a non-breaking space for clean wrapping */}
                    &nbsp;we reimagine the journey of knowledge.
                </span>
            </p>

            {/* CTA Button */}
            <Link href="/about">
            <Button
                size="lg"
                className="mt-4 rounded-full bg-linear-to-r from-pumpkin-500 to-light-orange-600 px-8 font-semibold text-white-smoke-900 shadow-lg transition-all hover:shadow-md hover:opacity-90"
            >
                Know More About Us
            </Button>
            </Link>
        </section>
    );
}