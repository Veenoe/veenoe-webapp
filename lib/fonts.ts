/**
 * Font Configuration
 * Centralized font definitions for the application.
 * Following Next.js 15+ best practices for font optimization.
 */

import { Geist, Geist_Mono } from "next/font/google";

export const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

export const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});
