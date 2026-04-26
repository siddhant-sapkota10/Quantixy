"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { useSupabaseAuth } from "@/lib/auth";
import { soundManager } from "@/lib/sounds";
import { cn } from "@/lib/utils";

type DailyRewardTrackItem = {
  day: number;
  coins: number;
  xp: number;
  premium_reward?: string | null;
  premiumReward?: string | null;
  label: string;
};

type DailyRewardStatus = {
  today: string;
  currentStreak: number;
  longestStreak: number;
  cycleCount: number;
  currentDay: number;
  hasCompletedMatchToday: boolean;
  claimedToday: boolean;
  canClaim: boolean;
  coins: number;
  xp: number;
  track: DailyRewardTrackItem[];
};

type ClaimResponse = {
  claimed: boolean;
  reward: {
    day: number;
    coins: number;
    xp: number;
    premiumReward?: string | null;
    label: string;
  };
  wallet: {
    coins: number;
    xp: number;
  };
  status: DailyRewardStatus;
};

function normalizeTrackItem(item: DailyRewardTrackItem) {
  return {
    ...item,
    premiumReward: item.premiumReward ?? item.premium_reward ?? null,
  };
}

export function DailyRewardsPopup() {
  const router = useRouter();
  const pathname = usePathname();
  const { session, user, loading } = useSupabaseAuth();
  const [status, setStatus] = useState<DailyRewardStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimResponse["reward"] | null>(null);

  const hiddenOnRoute = pathname?.startsWith("/game") || pathname?.startsWith("/auth/callback");
  const dismissKey = useMemo(() => {
    const today = status?.today;
    return today ? `qx:daily-rewards:dismissed:${today}` : null;
  }, [status?.today]);

  const wasDismissedForToday = () => {
    if (typeof window === "undefined" || !dismissKey) return false;
    try {
      return window.localStorage.getItem(dismissKey) === "1";
    } catch {
      return false;
    }
  };

  const dismissForToday = () => {
    if (typeof window === "undefined" || !dismissKey) return;
    try {
      window.localStorage.setItem(dismissKey, "1");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (loading || !session?.access_token || !user || hiddenOnRoute) {
      return;
    }

    let cancelled = false;
    const accessToken = session.access_token;

    async function loadStatus() {
      try {
        const response = await fetch("/api/daily-rewards/status", {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as DailyRewardStatus;
        if (cancelled) return;
        setStatus(data);
        // Don't nag on every page load. Only auto-open when a reward is actually claimable,
        // and the user hasn't dismissed it for today.
        const shouldAutoOpen = Boolean(!data.claimedToday && data.canClaim && !wasDismissedForToday());
        setOpen(shouldAutoOpen);
      } catch {
        // Non-critical; rewards should never block login or navigation.
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [hiddenOnRoute, loading, session?.access_token, user, dismissKey]);

  useEffect(() => {
    const openRewards = () => {
      if (!hiddenOnRoute) {
        setOpen(true);
      }
    };
    window.addEventListener("quantixy:open-daily-rewards", openRewards);
    return () => window.removeEventListener("quantixy:open-daily-rewards", openRewards);
  }, [hiddenOnRoute]);

  const track = useMemo(() => (status?.track ?? []).map(normalizeTrackItem), [status?.track]);
  const currentReward = track.find((item) => item.day === status?.currentDay) ?? track[0] ?? null;

  if (!session || hiddenOnRoute) {
    return null;
  }

  const handleClaim = async () => {
    if (!session?.access_token || busy) {
      return;
    }

    try {
      setBusy(true);
      setError(null);
      const response = await fetch("/api/daily-rewards/claim", {
        method: "POST",
        headers: {
          authorization: `Bearer ${session.access_token}`,
        },
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data?.error ?? "Unable to claim today's reward.");
        soundManager.play("wrong");
        return;
      }

      const claim = data as ClaimResponse;
      setStatus(claim.status);
      setClaimResult(claim.reward);
      soundManager.play("streak", { volume: 0.45 });
      window.setTimeout(() => {
        setOpen(false);
        setClaimResult(null);
      }, 1800);
    } catch {
      setError("Unable to claim today's reward.");
      soundManager.play("wrong");
    } finally {
      setBusy(false);
    }
  };

  const handlePlayMatch = () => {
    setOpen(false);
    router.push("/play");
  };

  return (
    <AnimatePresence>
      {open && status ? (
        <div className="fixed inset-0 z-[2147483000] isolate flex items-end justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] sm:items-center sm:px-6 sm:pb-6">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 bg-slate-950"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.92 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(5,10,25,0.35),rgba(0,0,0,0.72)),radial-gradient(ellipse_at_50%_18%,rgba(56,189,248,0.12),transparent_48%),radial-gradient(ellipse_at_82%_80%,rgba(250,204,21,0.08),transparent_42%)]"
          />
          <motion.div
            className="relative z-10 max-h-[min(92dvh,820px)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-[1.35rem] border border-[var(--qx-border-soft)] bg-[var(--qx-panel)] p-4 text-[var(--qx-text-primary)] shadow-[0_28px_90px_rgba(0,0,0,0.75),0_0_40px_rgba(34,211,238,0.06)] backdrop-blur-xl sm:rounded-3xl sm:p-6 lg:max-w-5xl lg:p-8"
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
          >
            <button
              type="button"
              onClick={() => {
                dismissForToday();
                setOpen(false);
              }}
              className="absolute right-4 top-4 z-20 rounded-full border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-slate-200 transition hover:bg-slate-800"
            >
              Later
            </button>

            <div className="pr-20 lg:pr-32">
              <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-200">Daily Rewards</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Day {status.currentDay} streak
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200/90 sm:text-base lg:text-lg">
                Complete one match each day, then claim your reward. Miss a day and the streak restarts.
              </p>
            </div>

            <div className="mt-4 grid gap-3 rounded-3xl border border-white/12 bg-slate-950/85 p-3 sm:grid-cols-3 lg:mt-6 lg:p-4">
              <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-300/90">Current</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-sky-100 lg:text-3xl">{status.currentStreak}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-300/90">Best</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-amber-100 lg:text-3xl">{status.longestStreak}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-300/90">Wallet</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-emerald-100 lg:text-3xl">{status.coins}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:mt-6 lg:grid-cols-7 lg:gap-3">
              {track.map((item) => {
                const active = item.day === status.currentDay;
                const done = item.day < status.currentDay || (active && status.claimedToday);
                const locked = item.day > status.currentDay;
                const premium = Boolean(item.premiumReward);
                return (
                  <div
                    key={item.day}
                    className={cn(
                      "relative min-h-[7.25rem] rounded-2xl border p-3 text-left transition lg:min-h-[9rem] lg:p-4",
                      active
                        ? "border-amber-300/75 bg-slate-900/95 shadow-[0_0_32px_rgba(250,204,21,0.22),inset_0_1px_0_rgba(255,255,255,0.06)]"
                        : "border-white/11 bg-slate-950/88",
                      premium && "bg-gradient-to-br from-amber-500/20 via-slate-950/95 to-sky-500/16",
                      locked && "opacity-[0.78]"
                    )}
                  >
                    {active ? (
                      <motion.div
                        aria-hidden="true"
                        className="absolute inset-0 rounded-2xl ring-1 ring-amber-200/45"
                        animate={{ opacity: [0.45, 1, 0.45] }}
                        transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                      />
                    ) : null}
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-300/85">Day {item.day}</p>
                    <p className={cn("mt-2 font-black text-white lg:mt-3", premium ? "text-lg lg:text-xl" : "text-xl lg:text-2xl")}>
                      {premium ? "Premium" : `+${item.coins}`}
                    </p>
                    <p className="mt-1 min-h-[2rem] text-xs font-semibold leading-tight text-slate-200/88 lg:text-sm">
                      {premium ? "Clutch Pack" : "coins"}
                    </p>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400/85 lg:mt-3">+{item.xp} XP</p>
                    <span className={cn(
                      "absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em]",
                      done
                        ? "border-emerald-300/30 bg-emerald-500/10 text-emerald-200"
                        : active && status.canClaim
                          ? "border-amber-300/40 bg-amber-500/10 text-amber-100"
                          : locked
                            ? "border-white/10 bg-white/[0.04] text-slate-400"
                            : "border-cyan-300/24 bg-cyan-500/10 text-cyan-100"
                    )}>
                      {done ? "Done" : active && status.canClaim ? "Claim" : locked ? "Locked" : "Current"}
                    </span>
                  </div>
                );
              })}
            </div>

            {claimResult ? (
              <motion.div
                className="mt-4 rounded-3xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-center"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: [0.94, 1.04, 1] }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <p className="text-sm font-black uppercase tracking-[0.24em] text-emerald-200">Claimed</p>
                <p className="mt-1 text-2xl font-black">+{claimResult.coins} coins</p>
                {claimResult.premiumReward ? <p className="mt-1 text-sm text-amber-100">Premium unlocked: Clutch Pack</p> : null}
              </motion.div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:mt-7">
              <Button
                className={cn(
                  "h-12 flex-1",
                  !status.canClaim &&
                    "cursor-not-allowed border-white/14 bg-slate-900/95 text-slate-200/80 opacity-100 shadow-none saturate-75 hover:bg-slate-900/95 hover:brightness-100"
                )}
                onClick={handleClaim}
                disabled={!status.canClaim || busy}
                loading={busy}
                loadingText="Claiming..."
              >
                {status.claimedToday
                  ? "Claimed Today"
                  : status.hasCompletedMatchToday
                    ? `Claim ${currentReward ? `+${currentReward.coins}` : "Reward"}`
                    : "Complete 1 Match First"}
              </Button>
              {!status.hasCompletedMatchToday ? (
                <Button type="button" variant="secondary" className="h-12 flex-1" onClick={handlePlayMatch}>
                  Play Match
                </Button>
              ) : null}
            </div>

            {error ? (
              <p className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                {error}
              </p>
            ) : null}
            {!status.canClaim && !status.claimedToday ? (
              <p className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-500/12 px-4 py-3 text-sm font-medium leading-relaxed text-amber-50">
                Complete 1 match today to claim this reward.
              </p>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
