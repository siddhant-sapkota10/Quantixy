"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/button";
import { PageContent } from "@/components/page-content";
import { useSupabaseAuth } from "@/lib/auth";

type CoinPack = {
  id: "coins_500" | "coins_1200" | "coins_2500" | "coins_6000";
  coins: number;
  label: string;
  bonus?: string;
  highlight?: boolean;
};

const COIN_PACKS: CoinPack[] = [
  { id: "coins_500", coins: 500, label: "Starter Stack" },
  { id: "coins_1200", coins: 1200, label: "Value Stack", bonus: "+20% bonus", highlight: true },
  { id: "coins_2500", coins: 2500, label: "Power Stack", bonus: "+25% bonus" },
  { id: "coins_6000", coins: 6000, label: "Mega Stack", bonus: "+30% bonus" },
];

export function CoinTopupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, loading } = useSupabaseAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sessionId = useMemo(() => searchParams?.get("session_id") ?? "", [searchParams]);

  const handleBuy = async (pack: CoinPack) => {
    if (!session?.access_token || busy) return;
    setBusy(pack.id);
    setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemType: "coins",
          itemId: pack.id,
        }),
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Unable to start checkout.");
      }
      window.location.href = payload.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start checkout.");
      setBusy(null);
    }
  };

  const handleRefreshWallet = async () => {
    // Optional: if user lands here with session_id, they can force-confirm (credits coins instantly, idempotent-ish).
    if (!session?.access_token || !sessionId) return;
    setError(null);
    try {
      const response = await fetch("/api/stripe/confirm", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });
      const payload = (await response.json()) as { status?: string; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to confirm purchase.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to confirm purchase.");
    }
  };

  if (!loading && !user) {
    return (
      <PageContent size="wide" variant="plain" className="w-full min-w-0 space-y-5">
        <div className="q-card-strong rounded-3xl p-6 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-200">Buy Coins</p>
          <h1 className="mt-3 text-3xl font-black text-white">Sign in to purchase coins</h1>
          <p className="mt-2 text-sm text-slate-300">Coins are account-based so they stay safe.</p>
          <Button className="mt-5 w-full sm:w-auto" onClick={() => router.push("/")}>
            Back to Home
          </Button>
        </div>
      </PageContent>
    );
  }

  return (
    <PageContent size="wide" variant="plain" className="w-full min-w-0 space-y-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="relative overflow-hidden rounded-[1.35rem] border border-[var(--qx-border-soft)] bg-[var(--qx-panel)] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:rounded-3xl sm:p-4 lg:p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-95"
          style={{
            background:
              "radial-gradient(circle at 15% 10%, rgba(56,189,248,0.14), transparent 34%), radial-gradient(circle at 88% 12%, rgba(245,158,11,0.10), transparent 30%), linear-gradient(135deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98) 58%, rgba(8,13,30,0.96))",
          }}
        />

        <div className="relative space-y-4 sm:space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/12 bg-slate-900/88 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-6 sm:py-6">
            <div className="min-w-0">
              <span className="inline-flex rounded-full border border-amber-300/28 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-amber-100">
                Coins
              </span>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-5xl">Buy coins</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200/88 sm:text-base">
                Coins are used to buy cosmetics in the shop. Checkout is handled by Stripe.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[14rem]">
              <Button variant="secondary" className="h-12 w-full" onClick={() => router.push("/shop")}>
                Back to shop
              </Button>
              {sessionId ? (
                <Button className="h-12 w-full" onClick={() => void handleRefreshWallet()}>
                  Confirm purchase
                </Button>
              ) : null}
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COIN_PACKS.map((pack) => {
              const isBusy = busy === pack.id;
              return (
                <motion.div
                  key={pack.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className={[
                    "relative overflow-hidden rounded-3xl border bg-slate-950/70 p-4 shadow-[0_18px_55px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)]",
                    pack.highlight ? "border-amber-300/35" : "border-white/10",
                  ].join(" ")}
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-80"
                    style={{
                      background: pack.highlight
                        ? "radial-gradient(circle at 50% 20%, rgba(250,204,21,0.18), transparent 60%)"
                        : "radial-gradient(circle at 50% 20%, rgba(56,189,248,0.14), transparent 60%)",
                    }}
                  />
                  <div className="relative space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black uppercase tracking-[0.22em] text-slate-300/85">{pack.label}</p>
                        <p className="mt-2 text-4xl font-black tabular-nums text-white">{pack.coins}</p>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/85">coins</p>
                      </div>
                      {pack.bonus ? (
                        <span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">
                          {pack.bonus}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      className="h-12 w-full"
                      disabled={!session?.access_token || Boolean(busy)}
                      loading={isBusy}
                      loadingText="Redirecting..."
                      onClick={() => void handleBuy(pack)}
                    >
                      Buy with Stripe
                    </Button>
                    <p className="text-xs text-slate-300/70">
                      Price is configured in Stripe. If this errors, add the matching env var for this pack.
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </PageContent>
  );
}

