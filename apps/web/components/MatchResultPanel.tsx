"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/button";
import { computeLevel, type MatchRewardsClaimResponse } from "@/lib/match-rewards";

// ── Confetti — deterministic, no Math.random() ────────────────────────────

const CONFETTI_COLORS = [
  "#38bdf8", "#34d399", "#fbbf24", "#f472b6",
  "#a78bfa", "#ffffff", "#86efac", "#fcd34d",
];

const CONFETTI_PIECES = Array.from({ length: 24 }, (_, i) => ({
  id: i,
  left: `${3 + i * 4.06}%`,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: (i % 6) * 0.1,
  duration: 1.55 + (i % 5) * 0.3,
  width: 5 + (i % 3) * 3,
  height: 7 + (i % 4) * 3,
  xDrift: ((i % 7) - 3) * 16,
}));

function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden rounded-t-[1.75rem]"
      style={{ height: 200, zIndex: 0 }}
    >
      {CONFETTI_PIECES.map((p) => (
        <motion.span
          key={p.id}
          className="absolute block"
          style={{
            left: p.left,
            top: -12,
            width: p.width,
            height: p.height,
            background: p.color,
            borderRadius: 2,
          }}
          initial={{ y: 0, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: 240, x: p.xDrift, opacity: [1, 1, 0], rotate: 270 }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeIn",
            times: [0, 0.65, 1],
          }}
        />
      ))}
    </div>
  );
}

// ── Per-result visual config ───────────────────────────────────────────────

const RESULT_CONFIG = {
  win: {
    word: "VICTORY",
    wordClass: "text-emerald-300",
    glow: { textShadow: "0 0 56px rgba(52,211,153,0.6), 0 0 120px rgba(52,211,153,0.2)" },
    panelBorder: "",
    winnerCard: "",
    loserCard: "opacity-60",
  },
  loss: {
    word: "DEFEATED",
    wordClass: "text-rose-300",
    glow: { textShadow: "0 0 56px rgba(248,113,113,0.5), 0 0 120px rgba(248,113,113,0.15)" },
    panelBorder: "",
    winnerCard: "",
    loserCard: "opacity-60",
  },
  draw: {
    word: "DRAW",
    wordClass: "text-amber-300",
    glow: { textShadow: "0 0 56px rgba(251,191,36,0.5), 0 0 120px rgba(251,191,36,0.15)" },
    panelBorder: "",
    winnerCard: "",
    loserCard: "",
  },
} as const;

function getTagline(result: "win" | "loss" | "draw", margin: number): string {
  if (result === "draw") return "Perfectly matched — who blinks first?";
  if (result === "win") {
    if (margin >= 4) return "Dominant. They never stood a chance.";
    if (margin >= 2) return "Well earned. You outplayed them clean.";
    return "A close fight — but you came out on top.";
  }
  if (margin >= 4) return "They were on fire. Come back stronger.";
  if (margin >= 2) return "They pulled ahead. Take them down next time.";
  return "So close — one answer was all it needed.";
}

// ── Avatar card ────────────────────────────────────────────────────────────

type AvatarCardProps = {
  name: string;
  score: number;
  ratingChange?: number;
  newRating?: number;
  isWinner: boolean;
  isDraw: boolean;
  side: "you" | "opponent";
  animDelay: number;
  result: "win" | "loss" | "draw";
};

function AvatarCard({
  name,
  score,
  ratingChange,
  newRating,
  isWinner,
  isDraw,
  side,
  animDelay,
  result,
}: AvatarCardProps) {
  const cfg = RESULT_CONFIG[result];
  const cardClass = isWinner || isDraw ? cfg.winnerCard : cfg.loserCard;
  const scoreClass = isWinner || isDraw ? "text-white" : "text-slate-500";

  return (
    <motion.div
      initial={{ opacity: 0, x: side === "you" ? -24 : 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.38, delay: animDelay, ease: "easeOut" }}
      className={`relative flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border p-3 text-center sm:gap-2 sm:p-4 ${cardClass}`}
    >
      {/* Winner badge */}
      {isWinner && !isDraw && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-400/60 bg-amber-950 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-300">
          WINNER
        </div>
      )}

      <p className="max-w-full truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {name}
      </p>
      <p className={`text-3xl font-black leading-none sm:text-5xl ${scoreClass}`}>{score}</p>

      {typeof ratingChange === "number" && (
        <p
          className={`text-sm font-bold ${
            ratingChange > 0
              ? "text-emerald-300"
              : ratingChange < 0
              ? "text-rose-400"
              : "text-slate-400"
          }`}
        >
          {ratingChange > 0 ? "+" : ""}{ratingChange} rating
        </p>
      )}
      {typeof newRating === "number" && (
        <p className="text-[11px] text-slate-500">★ {newRating}</p>
      )}
    </motion.div>
  );
}

// ── Stat pill ──────────────────────────────────────────────────────────────

function StatPill({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]">
      <span>{icon}</span>
      <span className="text-slate-400">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

// ── Reward breakdown pill ──────────────────────────────────────────────────

function RewardPill({ label, xp, coins }: { label: string; xp?: number; coins?: number }) {
  if (!xp && !coins) return null;
  return (
    <div className="flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/60 px-2.5 py-1 text-[10px] font-semibold">
      <span className="text-slate-400">{label}</span>
      {!!xp && <span className="text-cyan-300">+{xp} XP</span>}
      {!!coins && <span className="text-amber-300">+{coins}c</span>}
    </div>
  );
}

// ── Animated XP bar ────────────────────────────────────────────────────────

function XpProgressBar({
  xpBefore,
  xpAfter,
  levelBefore,
  levelAfter,
  leveledUp,
  animDelay,
}: {
  xpBefore: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  animDelay: number;
}) {
  const { xpIntoLevel: xpBefore_into, xpNeeded: xpNeeded_before } = computeLevel(xpBefore);
  const { xpIntoLevel: xpAfter_into, xpNeeded: xpNeeded_after } = computeLevel(xpAfter);

  const fromFraction = xpBefore_into / xpNeeded_before;
  const toFraction = leveledUp ? 1 : xpAfter_into / xpNeeded_after;
  const finalFraction = xpAfter_into / xpNeeded_after;

  const [barWidth, setBarWidth] = useState(fromFraction * 100);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setBarWidth(toFraction * 100);
      if (leveledUp) {
        setTimeout(() => {
          setShowLevelUp(true);
          setTimeout(() => {
            setBarWidth(finalFraction * 100);
          }, 600);
        }, 700);
      }
    }, animDelay * 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const displayLevel = showLevelUp ? levelAfter : levelBefore;

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em]">
        <span className="text-slate-400">Level</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={displayLevel}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className={showLevelUp ? "text-amber-300" : "text-cyan-300"}
          >
            {displayLevel}
            {showLevelUp && levelAfter > levelBefore ? " ▲" : ""}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <motion.div
          className={`h-full rounded-full ${showLevelUp && leveledUp ? "bg-amber-400" : "bg-cyan-400"}`}
          initial={{ width: `${fromFraction * 100}%` }}
          animate={{ width: `${barWidth}%` }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ boxShadow: "0 0 10px rgba(34,211,238,0.35)" }}
        />
      </div>
      <div className="flex items-center justify-between text-[9px] text-slate-500">
        <span>{xpAfter_into} XP</span>
        <span>{xpNeeded_after} XP needed</span>
      </div>
    </div>
  );
}

// ── Animated coin counter ──────────────────────────────────────────────────

function AnimatedNumber({ from, to, delay }: { from: number; to: number; delay: number }) {
  const [value, setValue] = useState(from);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const duration = 900;

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      startRef.current = null;
      const step = (timestamp: number) => {
        if (!startRef.current) startRef.current = timestamp;
        const elapsed = timestamp - startRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(from + (to - from) * eased));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(step);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    }, delay * 1000);

    return () => {
      clearTimeout(startTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [from, to, delay]);

  return <>{value.toLocaleString()}</>;
}

// ── Rewards section ────────────────────────────────────────────────────────

function RewardsSection({
  rewards,
  isGuest,
}: {
  rewards: MatchRewardsClaimResponse;
  isGuest: boolean;
}) {
  const { breakdown, xpAwarded, coinsAwarded, levelBefore, levelAfter, leveledUp, wallet } = rewards;
  const xpBefore = wallet.xp - xpAwarded;
  const coinsBefore = wallet.coins - coinsAwarded;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.6 }}
      className="w-full rounded-2xl border border-slate-700/50 bg-slate-900/50 p-4"
    >
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
          {breakdown.isAiMatch ? "Practice Rewards (75%)" : "Match Rewards"}
        </p>
        {leveledUp && (
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 360, damping: 18, delay: 1.2 }}
            className="rounded-full border border-amber-400/60 bg-amber-950 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-300"
            style={{ boxShadow: "0 0 18px rgba(251,191,36,0.35)" }}
          >
            LEVEL UP
          </motion.span>
        )}
      </div>

      {/* XP + Coins earned row */}
      <div className="mb-3 flex items-center gap-4">
        <div className="flex items-baseline gap-1">
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.75 }}
            className="text-2xl font-black text-cyan-300"
          >
            +{xpAwarded}
          </motion.span>
          <span className="text-[11px] font-semibold text-slate-400">XP</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-black text-amber-300">
            +<AnimatedNumber from={0} to={coinsAwarded} delay={0.85} />
          </span>
          <span className="text-[11px] font-semibold text-slate-400">coins</span>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] text-slate-500">Total coins</p>
          <p className="text-sm font-black text-amber-200">
            <AnimatedNumber from={coinsBefore} to={wallet.coins} delay={0.95} />
          </p>
        </div>
      </div>

      {/* XP progress bar */}
      {!isGuest && (
        <XpProgressBar
          xpBefore={xpBefore}
          xpAfter={wallet.xp}
          levelBefore={levelBefore}
          levelAfter={levelAfter}
          leveledUp={leveledUp}
          animDelay={0.9}
        />
      )}

      {/* Breakdown pills */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <RewardPill label="Base" xp={breakdown.baseXp} coins={breakdown.baseCoins} />
        <RewardPill
          label={breakdown.isAiMatch ? "Result (×0.75)" : "Result"}
          xp={breakdown.resultXp}
          coins={breakdown.resultCoins}
        />
        {breakdown.correctAnswerXp > 0 && (
          <RewardPill label="Correct" xp={breakdown.correctAnswerXp} coins={breakdown.correctAnswerCoins || undefined} />
        )}
        {breakdown.streakXp > 0 && <RewardPill label="Streak" xp={breakdown.streakXp} />}
        {breakdown.koCoins > 0 && <RewardPill label="KO bonus" coins={breakdown.koCoins} />}
        {breakdown.comebackXp > 0 && <RewardPill label="Comeback" xp={breakdown.comebackXp} />}
      </div>

      {/* Guest sign-up prompt */}
      {isGuest && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="mt-3 text-center text-[10px] text-slate-500"
        >
          Sign up to save your XP and level up permanently.
        </motion.p>
      )}
    </motion.div>
  );
}

// ── MatchResultPanel ───────────────────────────────────────────────────────

export type MatchResultPanelProps = {
  result: "win" | "loss" | "draw";
  scores: { you: number; opponent: number };
  yourName: string;
  opponentName: string;
  yourAvatar: string;
  opponentAvatar: string;
  ratingChange?: { you: number; opponent: number };
  newRatings?: { you: number; opponent: number };
  peakStreak: number;
  opponentPeakStreak: number;
  rematchRequested: boolean;
  statusText?: string;
  primaryActionLabel?: string;
  secondaryActionLabel?: string;
  primaryActionDisabled?: boolean;
  matchRewards?: MatchRewardsClaimResponse | null;
  isGuest?: boolean;
  onRematch: () => void;
  onChangeTopic: () => void;
};

export function MatchResultPanel({
  result,
  scores,
  yourName,
  opponentName,
  yourAvatar,
  opponentAvatar,
  ratingChange,
  newRatings,
  peakStreak,
  opponentPeakStreak,
  rematchRequested,
  statusText,
  primaryActionLabel,
  secondaryActionLabel,
  primaryActionDisabled,
  matchRewards,
  isGuest = false,
  onRematch,
  onChangeTopic,
}: MatchResultPanelProps) {
  const cfg = RESULT_CONFIG[result];
  const margin = Math.abs(scores.you - scores.opponent);
  const tagline = getTagline(result, margin);
  const isDraw = result === "draw";

  // Which card gets the "winner" treatment
  const youAreWinner = result === "win";
  const opponentIsWinner = result === "loss";

  const showStats = peakStreak > 1 || opponentPeakStreak > 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-[1.75rem] p-4 sm:p-6 lg:p-7"
    >
      {/* Win confetti overlay */}
      {result === "win" && <Confetti />}

      {/* Content (sits above confetti z-index-wise) */}
      <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-7">

        {/* ── Result headline ── */}
        <div className="flex flex-col items-center gap-2 text-center">
          <motion.h2
            initial={{ scale: 0.55, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 340, damping: 22, delay: 0.05 }}
            className={`text-5xl font-black tracking-tight sm:text-6xl md:text-7xl ${cfg.wordClass}`}
            style={cfg.glow}
          >
            {cfg.word}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="max-w-xs text-sm text-slate-400 sm:text-base"
          >
            {tagline}
          </motion.p>
        </div>

        {/* ── Avatar score row ── */}
        <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-stretch sm:gap-4">
          <AvatarCard
            name={yourName}
            score={scores.you}
            ratingChange={ratingChange?.you}
            newRating={newRatings?.you}
            isWinner={youAreWinner}
            isDraw={isDraw}
            side="you"
            animDelay={0.28}
            result={result}
          />

          {/* VS divider */}
          <div className="flex flex-col items-center justify-center gap-1 px-1 py-1">
            <span className="text-xs font-black uppercase tracking-[0.35em] text-slate-600">vs</span>
          </div>

          <AvatarCard
            name={opponentName}
            score={scores.opponent}
            ratingChange={ratingChange?.opponent}
            newRating={newRatings?.opponent}
            isWinner={opponentIsWinner}
            isDraw={isDraw}
            side="opponent"
            animDelay={0.32}
            result={result}
          />
        </div>

        {/* ── Match stats ── */}
        {showStats && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
            className="flex flex-wrap items-center justify-center gap-2"
          >
            {peakStreak > 1 && (
              <StatPill
                icon={peakStreak >= 5 ? "⚡" : "🔥"}
                label="Your streak"
                value={`×${peakStreak}`}
              />
            )}
            {opponentPeakStreak > 1 && (
              <StatPill
                icon={opponentPeakStreak >= 5 ? "⚡" : "🔥"}
                label="Opp. streak"
                value={`×${opponentPeakStreak}`}
              />
            )}
          </motion.div>
        )}

        {/* ── Rewards section ── */}
        {matchRewards && (
          <RewardsSection rewards={matchRewards} isGuest={isGuest} />
        )}

        {/* ── Action buttons ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.55 }}
          className="grid w-full gap-3 sm:grid-cols-2"
        >
          {statusText ? (
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:col-span-2">
              {statusText}
            </p>
          ) : null}
          <Button
            className={`w-full py-3 text-base font-black tracking-wide sm:py-4 sm:text-lg ${
              result === "win"
                ? "shadow-[0_0_28px_rgba(52,211,153,0.22)]"
                : result === "draw"
                ? "shadow-[0_0_28px_rgba(251,191,36,0.18)]"
                : ""
            }`}
            onClick={onRematch}
            disabled={primaryActionDisabled ?? rematchRequested}
          >
            {primaryActionLabel ?? (rematchRequested ? "Waiting for opponent…" : "Rematch ↺")}
          </Button>
          <Button variant="secondary" className="w-full" onClick={onChangeTopic}>
            {secondaryActionLabel ?? "Change Topic"}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
