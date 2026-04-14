import { PageShell } from "@/components/page-shell";
import { PlaySetup } from "@/components/play-setup";

export default function PlayPage() {
  return (
    <PageShell className="flex items-center justify-center">
      <PlaySetup />
    </PageShell>
  );
}
