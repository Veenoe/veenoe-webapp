/**
 * Home Page - Landing Page with Try Beta CTA
 * Entry point for the viva examination system
 */

"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Mic, Brain, Clock, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-pumpkin/5">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          {/* Logo/Icon */}
          <div className="flex justify-center">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-pumpkin to-jasper shadow-lg">
              <GraduationCap className="h-16 w-16 text-white" />
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-pumpkin via-jasper to-pumpkin bg-clip-text text-transparent">
              AI-Powered Viva Examination
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              Experience the future of oral examinations with real-time AI conversations
            </p>
          </div>

          {/* CTA Button */}
          <div className="pt-4">
            <Link href="/viva">
              <Button
                size="lg"
                className="bg-gradient-to-r from-pumpkin to-jasper hover:from-pumpkin-600 hover:to-jasper-600 text-white text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <Sparkles className="mr-2 h-5 w-5" />
                Try Beta Version
              </Button>
            </Link>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-6 pt-12">
            <Card className="border-border bg-card/50 backdrop-blur hover:shadow-lg transition-shadow">
              <CardContent className="pt-6 space-y-2">
                <div className="flex justify-center">
                  <div className="p-3 rounded-lg bg-pumpkin/10">
                    <Mic className="h-6 w-6 text-pumpkin" />
                  </div>
                </div>
                <h3 className="font-semibold text-lg">Voice Interaction</h3>
                <p className="text-sm text-muted-foreground">
                  Natural voice conversations with AI examiner
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/50 backdrop-blur hover:shadow-lg transition-shadow">
              <CardContent className="pt-6 space-y-2">
                <div className="flex justify-center">
                  <div className="p-3 rounded-lg bg-jasper/10">
                    <Brain className="h-6 w-6 text-jasper" />
                  </div>
                </div>
                <h3 className="font-semibold text-lg">Advanced Reasoning</h3>
                <p className="text-sm text-muted-foreground">
                  AI with thinking capabilities for better evaluation
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/50 backdrop-blur hover:shadow-lg transition-shadow">
              <CardContent className="pt-6 space-y-2">
                <div className="flex justify-center">
                  <div className="p-3 rounded-lg bg-pumpkin/10">
                    <Clock className="h-6 w-6 text-pumpkin" />
                  </div>
                </div>
                <h3 className="font-semibold text-lg">10-Minute Sessions</h3>
                <p className="text-sm text-muted-foreground">
                  Focused, time-bound examination experience
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Info Text */}
          <p className="text-sm text-muted-foreground pt-8">
            Powered by Google Gemini Live API • Real-time Audio Streaming • Adaptive Questioning
          </p>
        </div>
      </div>
    </div>
  );
}