import { CoinShopClient } from "@/components/coin-shop-client";
import { PageShell } from "@/components/page-shell";

export default function ShopPage() {
  return (
    <PageShell className="flex items-start justify-center">
      <CoinShopClient />
    </PageShell>
  );
}
