import { HeroSection } from "@/components/about/HeroSection";
import { StartVivaForm } from "@/components/viva/StartVivaForm";

export default function Home() {
  return (
    <main>
      {/* Keep the existing Hero Section */}
      <HeroSection />

      {/* Add the new StartVivaForm component, centered */}
      <section className="pb-32 px-4 flex justify-center">
        <StartVivaForm />
      </section>
    </main>
  );
}