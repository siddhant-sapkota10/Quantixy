import { HomeHero } from "@/components/home-hero";
import { PageShell } from "@/components/page-shell";

export default function HomePage() {
  return (
    <PageShell className="flex items-center justify-center">
      <HomeHero />
    </PageShell>
  );
}
