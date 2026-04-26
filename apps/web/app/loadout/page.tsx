import { LoadoutClient } from "@/components/loadout-client";
import { PageShell } from "@/components/page-shell";

export default function LoadoutPage() {
  return (
    <PageShell className="flex items-start justify-center">
      <LoadoutClient />
    </PageShell>
  );
}
