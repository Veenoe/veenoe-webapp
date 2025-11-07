import { StorySection } from "@/components/about/StorySection";
import { MissionSection } from "@/components/about/MissionSection";
import { FightSection } from "@/components/about/FightSection";
import { VisionSection } from "@/components/about/VisionSection";
import { BuildingSection } from "@/components/about/BuildingSection";
import { MovementSection } from "@/components/about/MovementSection";

export default function AboutPage() {
  return (
    <main>
      <StorySection />
      <MissionSection />
      <FightSection />
      <VisionSection />
      <BuildingSection />
      <MovementSection />
    </main>
  );
}