import { PageShell } from "@/components/page-shell";
import { CoinTopupClient } from "@/components/coin-topup-client";

export default function CoinsPage() {
  return (
    <PageShell className="flex items-start justify-center">
      <CoinTopupClient />
    </PageShell>
  );
}

