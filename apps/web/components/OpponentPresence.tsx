"use client";

import { AnimatePresence, motion } from "framer-motion";

export type OpponentActivity = "idle" | "thinking" | "typing";

type Props = {
  /** Raw real-time activity (typing/thinking/idle from socket). */
  activity: OpponentActivity;
  /** True when the server confirmed opponent answered this question. */
  opponentAnswered: boolean;
  /** True when the local player has also answered this question. */
  youAnswered: boolean;
  /** Only render presence during live gameplay. */
  isActive: boolean;
};

/**
 * Compact live-presence strip that sits below the opponent's PlayerPanel card.
 *
 * Display priority (highest → lowest):
 *  1. answered + you haven't  →  "Waiting for you"   (amber, pressure cue)
 *  2. answered + you have     →  "Answered"           (neutral, brief flash)
 *  3. typing                  →  "Typing…"            (amber, animated dots)
 *  4. thinking                →  subtle pulsing dots  (gray, low-key alive signal)
 *  5. idle / not active       →  nothing
 */
export function OpponentPresence({
  activity,
  opponentAnswered,
  youAnswered,
  isActive,
}: Props) {
  if (!isActive) return null;

  // Derive the display key so AnimatePresence can animate between states
  const displayKey = opponentAnswered
    ? youAnswered
      ? "both-answered"
      : "waiting-for-you"
    : activity === "typing"
    ? "typing"
    : "thinking";

  return (
    <div className="pointer-events-none flex min-h-[1.75rem] items-center justify-center">
      <AnimatePresence mode="wait">
        {displayKey === "waiting-for-you" && (
          <PresencePill key="waiting-for-you" variant="waiting">
            <span className="mr-1.5 opacity-80">⏳</span>
            Waiting for you
          </PresencePill>
        )}

        {displayKey === "both-answered" && (
          <PresencePill key="both-answered" variant="answered">
            <span className="mr-1.5">✓</span>
            Answered
          </PresencePill>
        )}

        {displayKey === "typing" && (
          <PresencePill key="typing" variant="typing">
            <span className="mr-1.5">✏</span>
            Typing
            <TypingDots />
          </PresencePill>
        )}

        {displayKey === "thinking" && (
          <PresencePill key="thinking" variant="thinking">
            <ThinkingDots />
          </PresencePill>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const variantStyles: Record<string, string> = {
  waiting:
    "border-amber-400/40 bg-amber-950/70 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.12)]",
  answered: "border-emerald-500/30 bg-emerald-950/60 text-emerald-300",
  typing:   "border-amber-400/25 bg-slate-900/70 text-amber-300",
  thinking: "border-slate-700/50 bg-slate-900/40 text-slate-500",
};

function PresencePill({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: keyof typeof variantStyles;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.88, y: 3 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -2 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={`flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${variantStyles[variant]}`}
    >
      {children}
    </motion.div>
  );
}

/** Three pulsing dots shown while opponent is actively typing. */
function TypingDots() {
  return (
    <span className="ml-1 flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1 w-1 rounded-full bg-amber-300"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{
            duration: 0.9,
            repeat: Infinity,
            delay: i * 0.18,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

/** Very subtle three-dot pulse — low-key "opponent is alive" signal. */
function ThinkingDots() {
  return (
    <span className="flex items-center gap-[4px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-[5px] w-[5px] rounded-full bg-slate-600"
          animate={{ opacity: [0.25, 0.65, 0.25] }}
          transition={{
            duration: 1.6,
            repeat: Infinity,
            delay: i * 0.28,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}
