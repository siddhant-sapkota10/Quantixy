"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { RankBadge } from "@/components/rank-badge";
import { DEFAULT_AVATAR_ID, normalizeAvatarId } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { formatEquippedTitle } from "./lobby-utils";
import { PrimaryGradientButton } from "@/components/dashboard/dashboard-ui";

function getAvatarCardSrc(id: string) {
  return `/assets/avatarCards/${normalizeAvatarId(id)}.png`;
}

export type LobbyBattleActions = {
  onPlayOnline: () => void;
  onPracticeAi: () => void;
  onDailyReward: () => void;
  playBusy: boolean;
  practiceBusy: boolean;
  anyBusy: boolean;
};

type LobbyHeroSectionProps = {
  displayName: string;
  avatarId: string | null;
  rating?: number;
  titleId?: string | null;
  coins?: number;
  xp?: number;
  streak?: number;
  isGuest: boolean;
  guestHint?: string;
  battle?: LobbyBattleActions | null;
};

export function LobbyHeroSection({
  displayName,
  avatarId,
  rating,
  titleId,
  coins,
  xp,
  streak,
  isGuest,
  guestHint,
  battle,
}: LobbyHeroSectionProps) {
  const reduceMotion = useReducedMotion();
  const resolvedAvatar = normalizeAvatarId(avatarId ?? DEFAULT_AVATAR_ID);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.35rem] border border-[var(--qx-border-soft)] bg-[var(--qx-panel)] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl sm:rounded-3xl sm:p-7 md:p-8",
        "ring-1 ring-cyan-400/10"
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_20%_0%,rgba(34,211,238,0.12),transparent_55%),radial-gradient(ellipse_60%_50%_at_90%_20%,rgba(168,85,247,0.1),transparent_55%)]"
      />

      <div className="relative grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="space-y-3 lg:col-span-4">
          <span className="inline-flex rounded-full border border-cyan-400/35 bg-cyan-500/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.26em] text-cyan-100">
            Multiplayer Math Arena
          </span>
          <h1 className="text-3xl font-black tracking-tight text-[var(--qx-text-primary)] sm:text-4xl md:text-5xl">
            Quantixy
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-[var(--qx-text-secondary)] sm:text-base">
            Real-time multiplayer math battles
          </p>
        </div>

        <div className="flex flex-col items-center text-center lg:col-span-4">
          <motion.div
            className="relative"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div
              className="relative mx-auto h-32 w-32 rounded-full p-1 shadow-[0_0_48px_rgba(34,211,238,0.2),0_0_32px_rgba(168,85,247,0.15)] sm:h-36 sm:w-36"
              style={{
                background: "linear-gradient(135deg, rgba(34,211,238,0.75), rgba(168,85,247,0.65))",
              }}
            >
              <div className="relative h-full w-full overflow-hidden rounded-full border border-[var(--qx-border-soft)] bg-[#050b18]">
                <Image
                  src={getAvatarCardSrc(resolvedAvatar)}
                  alt=""
                  fill
                  sizes="144px"
                  className="object-cover object-top"
                  priority={false}
                />
              </div>
            </div>
          </motion.div>
          <p className="mt-4 text-xl font-black tracking-tight text-[var(--qx-text-primary)] sm:text-2xl">{displayName}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {typeof rating === "number" ? (
              <>
                <RankBadge rating={rating} size="md" />
                <span className="rounded-full border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-3 py-1 text-xs font-bold tabular-nums text-[var(--qx-text-primary)]">
                  {rating} <span className="text-[var(--qx-text-muted)]">rating</span>
                </span>
              </>
            ) : (
              <span className="rounded-full border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-3 py-1 text-xs font-semibold text-[var(--qx-text-secondary)]">
                {isGuest ? "Guest session" : "Play matches to earn a rating"}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-bold text-cyan-200/95">{formatEquippedTitle(titleId)}</p>
          {guestHint ? <p className="mt-3 max-w-md text-sm text-amber-100/90">{guestHint}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:col-span-4 lg:grid-cols-1 lg:content-start">
          {typeof coins === "number" ? (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-400/18 bg-amber-500/[0.07] px-4 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-500/10 text-amber-200">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v10M8 10h8M8 14h5" />
                </svg>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-200/75">Coins</p>
                <p className="text-2xl font-black tabular-nums text-white">{coins}</p>
              </div>
            </div>
          ) : null}
          {typeof xp === "number" ? (
            <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/18 bg-cyan-500/[0.07] px-4 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-500/10 text-cyan-200">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7l2-7z" />
                </svg>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200/75">XP</p>
                <p className="text-2xl font-black tabular-nums text-white">{xp}</p>
              </div>
            </div>
          ) : null}
          {typeof streak === "number" && streak > 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-purple-400/22 bg-purple-500/[0.07] px-4 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-purple-300/25 bg-purple-500/10 text-purple-200">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-200/75">Streak</p>
                <p className="text-2xl font-black tabular-nums text-white">{streak}d</p>
              </div>
            </div>
          ) : (
            <div className="hidden rounded-2xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-4 py-3 text-left text-sm text-[var(--qx-text-secondary)] lg:block">
              Win matches and claim dailies to grow your streak.
            </div>
          )}
        </div>
      </div>

      {battle ? (
        <div className="relative mt-8 grid gap-3 border-t border-[var(--qx-border-soft)] pt-8 sm:gap-4 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <PrimaryGradientButton
              onClick={battle.onPlayOnline}
              disabled={battle.anyBusy}
              className="disabled:pointer-events-none"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-950/20 bg-slate-950/15">
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black sm:text-xl">Play Online</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900/80">Find a real-time opponent</p>
                </div>
                {battle.playBusy ? (
                  <div className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                ) : (
                  <svg className="h-6 w-6 shrink-0 text-slate-900/55" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                )}
              </div>
            </PrimaryGradientButton>
          </div>
          <button
            type="button"
            onClick={battle.onPracticeAi}
            disabled={battle.anyBusy}
            className="flex min-h-[5.5rem] flex-col justify-center rounded-2xl border border-[var(--qx-border-soft)] bg-[var(--qx-card)] px-4 py-3 text-left transition hover:border-cyan-400/25 hover:bg-[var(--qx-card-hover)] disabled:opacity-60 lg:col-span-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="M12 3a9 9 0 109 9M12 3v4M12 3L8 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-black text-white">Practice vs AI</p>
                <p className="text-[11px] text-[var(--qx-text-muted)]">Warm up, no pressure</p>
              </div>
            </div>
            {battle.practiceBusy ? <p className="mt-2 text-xs text-cyan-200/80">Opening…</p> : null}
          </button>
          <button
            type="button"
            onClick={battle.onDailyReward}
            disabled={battle.anyBusy}
            className="flex min-h-[5.5rem] flex-col justify-center rounded-2xl border border-purple-400/25 bg-[var(--qx-card)] px-4 py-3 text-left shadow-[0_0_24px_rgba(168,85,247,0.08)] transition hover:border-purple-400/40 hover:bg-[var(--qx-card-hover)] disabled:opacity-60 lg:col-span-3"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/25 bg-purple-500/12 text-purple-200">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-black text-white">Daily Reward</p>
                <p className="text-[11px] text-[var(--qx-text-muted)]">Streak &amp; bonuses</p>
              </div>
            </div>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function LobbyGuestHero() {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1.35rem] border border-[var(--qx-border-soft)] bg-[var(--qx-panel)] px-5 py-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:rounded-3xl sm:px-8 sm:py-10"
      )}
    >
      <span className="inline-flex rounded-full border border-cyan-400/35 bg-cyan-500/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-cyan-100">
        Multiplayer Math Arena
      </span>
      <h1 className="mt-4 text-3xl font-black tracking-tight text-[var(--qx-text-primary)] sm:text-5xl">Quantixy</h1>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--qx-text-secondary)] sm:text-lg">
        Real-time multiplayer math battles
      </p>
    </div>
  );
}
