"use client";

import { useEffect, useState } from "react";
import { useSupabaseAuth } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

type Wallet = { coins: number; xp: number };

export function DashboardWallet() {
  const { user, loading } = useSupabaseAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!user) {
      setWallet(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setFetching(true);
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.from("player_wallets").select("coins, xp").eq("user_id", user.id).maybeSingle();
        if (cancelled) return;
        const row = data as { coins: number | null; xp: number | null } | null;
        setWallet({ coins: row?.coins ?? 0, xp: row?.xp ?? 0 });
      } catch {
        if (!cancelled) setWallet(null);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-3 py-2">
        <span className="h-4 w-16 animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="rounded-xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-2.5 py-1.5 sm:px-3 sm:py-2">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--qx-text-muted)]">Coins</p>
        <p className="text-sm font-black tabular-nums text-[var(--qx-text-primary)] sm:text-base">
          {fetching && !wallet ? "—" : wallet?.coins ?? "—"}
        </p>
      </div>
      <div className="hidden rounded-xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-2.5 py-1.5 sm:block sm:px-3 sm:py-2">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--qx-text-muted)]">XP</p>
        <p className="text-sm font-black tabular-nums text-[var(--qx-text-primary)] sm:text-base">
          {fetching && !wallet ? "—" : wallet?.xp ?? "—"}
        </p>
      </div>
    </div>
  );
}
