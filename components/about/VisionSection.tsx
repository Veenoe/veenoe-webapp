"use client";

import { motion } from "framer-motion";
import { Waves } from "lucide-react";
import { useScrollAnimation } from "@/lib/hooks/useScrollAnimation";

export function VisionSection() {
  const { ref, isInView } = useScrollAnimation({ threshold: 0.2 });

  return (
    <section ref={ref} className="py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-5xl md:text-6xl font-light mb-12 text-foreground text-center">
            Our Vision
          </h2>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-linear-to-r from-pumpkin-500/10 to-jasper-500/10 p-12 md:p-16 rounded-3xl mb-16 border border-pumpkin-500/30 dark:from-pumpkin-500/20 dark:to-jasper-500/20"
          >
            <div className="flex justify-center mb-8">
              <Waves className="w-16 h-16 text-pumpkin-500" />
            </div>

            <p className="text-3xl md:text-4xl font-light text-center text-foreground mb-4">
              AI that listens.
            </p>
            <p className="text-3xl md:text-4xl font-light text-center text-foreground">
              Education that understands.
            </p>
          </motion.div>

          <div className="space-y-8 text-lg md:text-xl text-muted-foreground leading-relaxed">
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="font-light"
            >
              Traditional AI in education <em>judges</em>. It marks you right or
              wrong, passes or fails you.
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="font-light"
            >
              <span className="text-jasper-500 font-normal text-2xl">
                Veenoe's AI listens.
              </span>{" "}
              It doesn't just grade—it engages. It asks follow-up questions. It
              adapts to how <em>you</em> think, not how the textbook says you
              should think.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="grid md:grid-cols-2 gap-8 my-12"
            >
              <div className="bg-card p-8 rounded-2xl border shadow-sm">
                <h3 className="text-2xl font-normal mb-4 text-foreground">
                  Traditional AI
                </h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start">
                    <span className="text-destructive mr-3 text-xl">×</span>
                    <span>Grades answers mechanically</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-destructive mr-3 text-xl">×</span>
                    <span>One-size-fits-all assessments</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-destructive mr-3 text-xl">×</span>
                    <span>No context or understanding</span>
                  </li>
                </ul>
              </div>

              <div className="bg-card p-8 rounded-2xl border border-pumpkin-500 shadow-lg">
                <h3 className="text-2xl font-normal mb-4 text-foreground">
                  Veenoe AI
                </h3>
                <ul className="space-y-3 text-muted-foreground">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-3 text-xl">✓</span>
                    <span>Understands conversational context</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-3 text-xl">✓</span>
                    <span>Asks adaptive follow-up questions</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-3 text-xl">✓</span>
                    <span>Measures insight, not just memory</span>
                  </li>
                </ul>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}