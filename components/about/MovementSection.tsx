"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollAnimation } from "@/lib/hooks/useScrollAnimation";
import Link from "next/link";

export function MovementSection() {
  const { ref, isInView } = useScrollAnimation({ threshold: 0.3 });

  return (
    <section
      ref={ref}
      className="py-32 px-6 relative overflow-hidden bg-linear-to-br from-pumpkin-500/10 via-jasper-500/10 to-pumpkin-500/10"
    >
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-jasper-500 rounded-full filter blur-3xl animate-pulse" />
        <div
          className="absolute bottom-1/3 right-1/3 w-96 h-96 bg-pumpkin-500 rounded-full filter blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          {/* ... Sparkles, H2, and P tags ... */}
          <motion.div
            initial={{ scale: 0 }}
            animate={isInView ? { scale: 1 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="inline-flex items-center justify-center mb-8"
          >
            <Sparkles className="w-12 h-12 text-pumpkin-500" />
          </motion.div>

          <h2 className="text-5xl md:text-6xl font-light mb-8 text-foreground">
            Join the Movement
          </h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-xl md:text-2xl text-muted-foreground mb-12 leading-relaxed font-light max-w-3xl mx-auto"
          >
            {/* ... "This is more than a product launch..." ... */}
            This is more than a product launch. It's a{" "}
            <em className="text-jasper-500">revolution in learning</em>.
            <br />
            <br />
            We're building a world where students aren't afraid to speak,
            <br />
            where learning isn't about performing, but about{" "}
            <span className="text-pumpkin-500 font-normal">understanding</span>.
            <br />
            where AI becomes a companion, not a judge.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="bg-card backdrop-blur-sm p-12 rounded-3xl border shadow-xl mb-12"
          >
            <p className="text-2xl md:text-3xl font-light text-foreground mb-8 italic">
              "The future of education isn't about replacing humans—
              <br />
              <span className="text-pumpkin-500 font-normal not-italic">
                it's about making learning human again.
              </span>
              "
            </p>

            {/* --- CORRECTED BUTTON --- */}
            <Button
              asChild // 1. `asChild` is on the Button.
              className="group bg-linear-to-r from-pumpkin-500 to-jasper-500 hover:from-jasper-500 hover:to-pumpkin-500 text-white-smoke-900 text-lg px-8 py-6 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300"
            >
              <Link
                href="https://forms.gle/QdJ9yWVHiPZziEvh8"
                target="_blank"
                rel="noopener noreferrer"
              >
                {/* 3. The content is now the child of <Link>, not a fragment. */}
                Join the Waitlist
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>

            <p className="text-muted-foreground text-sm mt-4">
              Join the waitlist to get early access to our platform.
            </p>
          </motion.div>

          {/* ... (Unchanged final Veenoe text) ... */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 1, delay: 1 }}
            className="mt-16"
          >
            <p className="text-4xl md:text-5xl font-light text-foreground mb-4">
              Veenoe
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}