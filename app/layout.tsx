import type { Metadata } from "next";
import { geistSans, geistMono } from "@/lib/fonts";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ClerkProvider,
  SignInButton,
  SignUpButton,
  SignedOut,
} from '@clerk/nextjs';
import QueryProvider from "@/components/providers/query-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Veenoe",
  description: "Where Knowledge Speaks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          suppressHydrationWarning
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                  <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 border-b px-4">
                    <div className="flex items-center gap-2 px-4">
                      <div className="flex-1">
                        {/* Breadcrumb or Title could go here */}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <ThemeToggle />
                      <SignedOut>
                        <SignInButton mode="modal">
                          <Button variant="ghost">Log In</Button>
                        </SignInButton>
                        <SignUpButton mode="modal">
                          <Button>Sign Up</Button>
                        </SignUpButton>
                      </SignedOut>
                    </div>
                  </header>
                  <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                    {children}
                  </div>
                </SidebarInset>
              </SidebarProvider>
            </QueryProvider>
          </ThemeProvider>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
