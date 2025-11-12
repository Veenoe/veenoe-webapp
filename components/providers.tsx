"use client";

import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner"

// Create the query client instance
// We set default staleTime to 1 minute for enterprise-grade caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
    },
  },
});

/**
 * Wraps the entire application with necessary context providers.
 * We will add TanStack Query (for server state) here.
 * Zustand (for client state) does not require a provider.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}