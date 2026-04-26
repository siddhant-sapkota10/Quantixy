"use client";

import { Button } from "@/components/button";
import type { DailyLobbySnapshot } from "./lobby-utils";

const shell =
  "rounded-[1.35rem] border p-5 shadow-[0_18px_48px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md sm:rounded-3xl sm:p-6";

type RecommendedObjectiveCardProps = {
  daily: DailyLobbySnapshot | null;
  coins: number | undefined;
  loading: boolean;
  onPracticeAi: () => void;
  onViewReward: () => void;
  onClaimReward: () => void;
  onOpenShop: () => void;
  onOpenLoadout: () => void;
  shopBusy: boolean;
  loadoutBusy: boolean;
  practiceBusy: boolean;
};

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total <= 0 ? 0 : Math.min(100, (current / total) * 100);
  return (
    <div className="mt-4">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em] text-[var(--qx-text-muted)]">
        <span>Progress</span>
        <span className="tabular-nums text-[var(--qx-text-secondary)]">
          {current}/{total}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full border border-[var(--qx-border-soft)] bg-[#050b18]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#8b5cf6)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RecommendedObjectiveCard({
  daily,
  coins,
  loading,
  onPracticeAi,
  onViewReward,
  onClaimReward,
  onOpenShop,
  onOpenLoadout,
  shopBusy,
  loadoutBusy,
  practiceBusy,
}: RecommendedObjectiveCardProps) {
  if (loading) {
    return (
      <div className={`min-h-[12rem] animate-pulse ${shell} border-[var(--qx-border-soft)] bg-[var(--qx-card)]`} aria-hidden />
    );
  }

  const hasCoins = typeof coins === "number" && coins >= 350;

  if (daily?.canClaim) {
    return (
      <div
        className={`${shell} border-emerald-400/28 bg-gradient-to-br from-emerald-500/[0.12] via-[var(--qx-card)] to-cyan-500/[0.08]`}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-200">Reward ready</p>
        <h3 className="mt-2 text-lg font-black text-[var(--qx-text-primary)] sm:text-xl">Claim your daily reward</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--qx-text-secondary)]">Your streak is safe — grab today&apos;s loot.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={onClaimReward}>
            Claim Daily Reward
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onOpenShop} loading={shopBusy} loadingText="Opening…">
            Open Shop
          </Button>
        </div>
      </div>
    );
  }

  if (daily && !daily.claimedToday && !daily.hasCompletedMatchToday) {
    return (
      <div
        className={`${shell} border-amber-400/25 bg-gradient-to-br from-amber-500/[0.1] via-[var(--qx-card)] to-cyan-500/[0.06]`}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200">Daily objective</p>
        <h3 className="mt-2 text-lg font-black text-[var(--qx-text-primary)] sm:text-xl">Complete 1 match</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--qx-text-secondary)]">
          Finish any match today to unlock your daily reward claim.
        </p>
        <ProgressBar current={daily.hasCompletedMatchToday ? 1 : 0} total={1} />
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--qx-text-muted)]">Recommended next</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={onPracticeAi} loading={practiceBusy} loadingText="Opening…">
            Practice vs AI
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onViewReward}>
            View reward track
          </Button>
        </div>
      </div>
    );
  }

  if (hasCoins) {
    return (
      <div
        className={`${shell} border-purple-400/25 bg-gradient-to-br from-purple-500/[0.1] via-[var(--qx-card)] to-amber-500/[0.06]`}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-purple-200">Spend your coins</p>
        <h3 className="mt-2 text-lg font-black text-[var(--qx-text-primary)] sm:text-xl">Unlock cosmetics</h3>
        <p className="mt-2 text-sm leading-relaxed text-[var(--qx-text-secondary)]">
          Visit the Shop to buy items, then equip them in Loadout.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={onOpenShop} loading={shopBusy} loadingText="Opening…">
            Open Shop
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onOpenLoadout} loading={loadoutBusy} loadingText="Opening…">
            Loadout
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shell} border-[var(--qx-border-soft)] bg-[var(--qx-card)]`}>
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-200">Recommended</p>
      <h3 className="mt-2 text-lg font-black text-[var(--qx-text-primary)] sm:text-xl">Jump into the arena</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--qx-text-secondary)]">
        Test yourself vs AI, then queue online when you&apos;re warmed up.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" onClick={onPracticeAi} loading={practiceBusy} loadingText="Opening…">
          Practice vs AI
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onViewReward}>
          Daily Reward
        </Button>
      </div>
    </div>
  );
}
