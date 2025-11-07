"use client";

import { motion } from "framer-motion";
import { Mic, BarChart3, MessagesSquare } from "lucide-react";
import { useScrollAnimation } from "@/lib/hooks/useScrollAnimation";

const products = [
  {
    icon: Mic,
    title: "AI Viva Assistant",
    description:
      "Voice-powered AI that conducts intelligent oral examinations, adapting questions based on your responses and understanding your thought process.",
    gradient: "from-pumpkin-500 to-jasper-500",
  },
  {
    icon: BarChart3,
    title: "Learning Intelligence Dashboard",
    description:
      "Deep insights into your learning patterns, conceptual strengths, and areas for growth—personalized analytics that truly understand you.",
    gradient: "from-jasper-500 to-pumpkin-500",
  },
  {
    icon: MessagesSquare,
    title: "Conversational Learning Interface",
    description:
      "Learn by talking, not typing. Express ideas naturally, ask questions spontaneously, and engage in a dialogue that feels human.",
    gradient: "from-pumpkin-500 to-jasper-500",
  },
];

export function BuildingSection() {
  const { ref, isInView } = useScrollAnimation({ threshold: 0.1 });

  return (
    <section ref={ref} className="py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-5xl md:text-6xl font-light mb-8 text-foreground text-center">
            What We're Building
          </h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground text-center mb-20 max-w-3xl mx-auto font-light"
          >
            Products designed not to replace teachers, but to amplify learning—
            <br />
            <em className="text-pumpkin-500">
              giving every student a voice, and every voice the attention it deserves.
            </em>
          </motion.p>

          <div className="space-y-8">
            {products.map((product, index) => (
              <motion.div
                key={product.title}
                initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.8, delay: 0.3 + index * 0.2 }}
                className="group"
              >
                <div className="bg-card rounded-2xl border shadow-lg hover:border-pumpkin-500 hover:shadow-2xl transition-all duration-500 overflow-hidden">
                  <div className="p-8 md:p-12 flex flex-col md:flex-row items-start gap-8">
                    <div
                      className={`shrink-0 w-20 h-20 rounded-2xl bg-linear-to-br ${product.gradient} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}
                    >
                      <product.icon className="w-10 h-10 text-white-smoke-900" />
                    </div>

                    <div className="flex-1">
                      <h3 className="text-2xl md:text-3xl font-normal mb-4 text-foreground">
                        {product.title}
                      </h3>
                      <p className="text-lg text-muted-foreground leading-relaxed font-light">
                        {product.description}
                      </p>
                    </div>
                  </div>

                  <div
                    className={`h-1 bg-linear-to-r ${product.gradient} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left`}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}