"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/button";

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
    panelBorder: "border-emerald-500/20",
    winnerCard: "border-emerald-400/50 bg-emerald-950/20 shadow-[0_0_36px_rgba(52,211,153,0.18)]",
    loserCard: "border-slate-700/30 bg-slate-900/30 opacity-70",
  },
  loss: {
    word: "DEFEATED",
    wordClass: "text-rose-300",
    glow: { textShadow: "0 0 56px rgba(248,113,113,0.5), 0 0 120px rgba(248,113,113,0.15)" },
    panelBorder: "border-rose-500/15",
    winnerCard: "border-rose-400/40 bg-rose-950/15 shadow-[0_0_28px_rgba(248,113,113,0.16)]",
    loserCard: "border-slate-700/30 bg-slate-900/30 opacity-70",
  },
  draw: {
    word: "DRAW",
    wordClass: "text-amber-300",
    glow: { textShadow: "0 0 56px rgba(251,191,36,0.5), 0 0 120px rgba(251,191,36,0.15)" },
    panelBorder: "border-amber-500/15",
    winnerCard: "border-amber-400/35 bg-amber-950/10",
    loserCard: "border-amber-400/35 bg-amber-950/10",
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
  avatar: string;
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
  avatar,
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
      className={`relative flex flex-1 flex-col items-center gap-1.5 rounded-2xl border p-3 text-center sm:gap-2 sm:p-4 ${cardClass}`}
    >
      {/* Winner badge */}
      {isWinner && !isDraw && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-400/60 bg-amber-950 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-amber-300">
          WINNER
        </div>
      )}

      <p className="text-3xl leading-none sm:text-4xl">{avatar}</p>
      <p className="max-w-[7rem] truncate text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {name}
      </p>
      <p className={`text-4xl font-black leading-none sm:text-5xl ${scoreClass}`}>{score}</p>

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
    <div className="flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]">
      <span>{icon}</span>
      <span className="text-slate-400">{label}</span>
      <span className="text-white">{value}</span>
    </div>
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
      className={`relative overflow-hidden rounded-[1.75rem] border p-5 sm:p-7 ${cfg.panelBorder}`}
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
        <div className="flex w-full items-stretch gap-3 sm:gap-4">
          <AvatarCard
            avatar={yourAvatar}
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
          <div className="flex flex-col items-center justify-center gap-1 px-1">
            <span className="text-xs font-black uppercase tracking-[0.35em] text-slate-600">vs</span>
          </div>

          <AvatarCard
            avatar={opponentAvatar}
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

        {/* ── Action buttons ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.55 }}
          className="flex w-full flex-col gap-3"
        >
          <Button
            className={`w-full py-3 text-base font-black tracking-wide sm:py-4 sm:text-lg ${
              result === "win"
                ? "shadow-[0_0_28px_rgba(52,211,153,0.22)]"
                : result === "draw"
                ? "shadow-[0_0_28px_rgba(251,191,36,0.18)]"
                : ""
            }`}
            onClick={onRematch}
            disabled={rematchRequested}
          >
            {rematchRequested ? "Waiting for opponent…" : "Rematch ↺"}
          </Button>
          <Button variant="secondary" className="w-full" onClick={onChangeTopic}>
            Change Topic
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
