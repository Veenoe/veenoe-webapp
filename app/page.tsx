// We can import our new component.
// Adjust the path if your components folder is elsewhere.
import { HeroSection } from "@/components/about/HeroSection";

export default function Home() {
  return (
    // The <main> tag is semantic. The HeroSection component
    // handles its own full-screen layout, so this is all we need.
    <main className="h-full">
      <HeroSection />
    </main>
  );
}