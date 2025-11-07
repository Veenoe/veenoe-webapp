"use client";

import { motion } from "framer-motion";
import { useScrollAnimation } from "@/lib/hooks/useScrollAnimation";

export function FightSection() {
  const { ref, isInView } = useScrollAnimation({ threshold: 0.3 });

  return (
    // This dark section uses our --background color, which will be dark in dark mode
    // and white in light mode, but the text is set to white.
    // So we'll force a dark context.
    <section
      ref={ref}
      className="py-32 px-6 relative overflow-hidden bg-linear-to-br from-gray-900 via-jasper-900 to-gray-900"
    >
      {/* Background blurs using our theme colors */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-pumpkin-500 rounded-full filter blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-jasper-500 rounded-full filter blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          {/* We use our pure white color */}
          <h2 className="text-5xl md:text-6xl font-light mb-12 text-white">
            Our Fight
          </h2>

          <div className="space-y-8 text-lg md:text-xl text-gray-200 leading-relaxed">
            <motion.p
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="font-light"
            >
              We fight against an education system that treats students like machines—
              <br />
              <span className="text-pumpkin-400">
                programmed to output answers, not cultivate understanding.
              </span>
            </motion.p>

            <motion.p
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="font-light"
            >
              We fight against tests that measure memory, not mastery—
              <br />
              <span className="text-pumpkin-400">
                where the "right answer" matters more than the right thinking.
              </span>
            </motion.p>

            <motion.p
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="font-light"
            >
              We fight against the fear of speaking up, the silence in classrooms—
              <br />
              <span className="text-pumpkin-400">
                where asking questions is discouraged and curiosity is stifled.
              </span>
            </motion.p>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="bg-white-smoke-900/10 backdrop-blur-lg p-8 md:p-12 rounded-2xl border border-white-smoke-900/20 my-12"
            >
              <p className="text-2xl md:text-3xl font-light text-white italic text-center leading-relaxed">
                "Education should ignite minds,
                <br />
                not just fill them.
                <br />
                <span className="text-pumpkin-400 font-normal not-italic">
                  Veenoe is that spark.
                </span>
                "
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}