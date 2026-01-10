import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { HeroSection } from "@/components/about/HeroSection";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/viva");
  }

  return (
    // The <main> tag is semantic. The HeroSection component
    // handles its own full-screen layout, so this is all we need.
    <main className="h-full">
      <HeroSection />
    </main>
  );
}