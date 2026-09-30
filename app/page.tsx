import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Hero17 from "@/components/ui/hero-17";
import { getHeroHeadline } from "@/lib/hero-headlines";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/viva");
  }

  return <main><Hero17 headline={getHeroHeadline()} /></main>;
}
