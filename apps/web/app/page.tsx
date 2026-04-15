import { HomeHero } from "@/components/home-hero";
import { PageShell } from "@/components/page-shell";

export default function HomePage() {
  return (
    <PageShell className="flex items-start justify-center sm:items-center">
      <HomeHero />
    </PageShell>
  );
}
