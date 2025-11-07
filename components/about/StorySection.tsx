"use client";

import { motion } from "framer-motion";
import { useScrollAnimation } from "@/lib/hooks/useScrollAnimation";

export function StorySection() {
  const { ref, isInView } = useScrollAnimation({ threshold: 0.2 });

  return (
    <section ref={ref} className="py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-5xl md:text-6xl font-light mb-12 text-foreground">
            Our Story
          </h2>

          <div className="space-y-8 text-lg md:text-xl text-white-smoke-100 leading-relaxed">
            <p className="font-light">
              <span className="text-pumpkin-500 font-normal text-2xl">
                Veenoe
              </span>{" "}
              was born from a simple question:{" "}
              <em>What if learning could feel like a conversation, not an examination?</em>
            </p>

            <p className="font-light">
              The name itself carries this vision.{" "}
              <strong className="text-jasper-500">Veena</strong>, the classical Indian
              instrument, represents the harmony of sound, rhythm, and expression—the
              voice of knowledge through melody.{" "}
              <strong className="text-pumpkin-500">Noesis</strong>, from Greek
              philosophy, means understanding through intellectual insight.
            </p>

            <div className="bg-linear-to-r from-pumpkin-500/10 to-jasper-500/10 p-8 md:p-12 rounded-2xl my-12 border border-pumpkin-500/20 dark:from-pumpkin-500/20 dark:to-jasper-500/20">
              <p className="text-2xl md:text-3xl font-light text-center text-foreground/90 italic">
                "Veenoe is the confluence of sound and understanding,
                <br />
                <span className="text-pumpkin-500">of expression and cognition,</span>
                <br />
                of <span className="font-normal">art and intelligence</span>."
              </p>
            </div>

            <p className="font-light">
              In the hands of <em>Saraswati</em>, the goddess of knowledge, the
              Veena is not just an instrument—it's the voice of wisdom itself.
              Similarly, <span className="text-jasper-500">Veenoe</span> is not
              just software. It's a medium through which knowledge finds its voice,
              and learning becomes human again.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}