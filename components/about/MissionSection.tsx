"use client";

import { motion } from "framer-motion";
import { MessageCircle, Brain, Sparkles } from "lucide-react";
import { useScrollAnimation } from "@/lib/hooks/useScrollAnimation";

const missionPoints = [
  {
    icon: MessageCircle,
    title: "Talk to Learn",
    description: "AI voice viva tests that listen, probe, and understand—not just grade.",
    gradient: "from-pumpkin-500 to-jasper-500", // Using our colors
  },
  {
    icon: Brain,
    title: "Understand How You Learn",
    description: "Personalized insights that reveal your learning patterns, strengths, and growth areas.",
    gradient: "from-jasper-500 to-pumpkin-500", // Using our colors
  },
  {
    icon: Sparkles,
    title: "Update the way you learn",
    description: "Learn to express, articulate, and think—not just memorize and repeat.",
    gradient: "from-pumpkin-500 to-jasper-500", // Using our colors
  },
];

export function MissionSection() {
  const { ref, isInView } = useScrollAnimation({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-32 px-6 bg-accent/60">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-5xl md:text-6xl font-light mb-8 text-foreground text-center">
            Our Mission
          </h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-3xl md:text-4xl font-light text-center mb-20 bg-clip-text text-transparent bg-linear-to-r from-pumpkin-500 to-jasper-500"
          >
            To make learning human again.
          </motion.p>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {missionPoints.map((point, index) => (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.3 + index * 0.2 }}
                className="group"
              >
                <div className="bg-card p-8 rounded-2xl border hover:border-pumpkin-500 hover:shadow-2xl transition-all duration-500 h-full">
                  <div
                    className={`w-16 h-16 rounded-xl bg-linear-to-br ${point.gradient} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <point.icon className="w-8 h-8 text-white-smoke-900" />
                  </div>

                  <h3 className="text-2xl font-normal mb-4 text-foreground">
                    {point.title}
                  </h3>

                  <p className="text-muted-foreground leading-relaxed font-light">
                    {point.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}