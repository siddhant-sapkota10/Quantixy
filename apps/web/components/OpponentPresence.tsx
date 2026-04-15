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
    <div className="pointer-events-none flex min-h-[2rem] items-center justify-center py-0.5">
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
            <span className="ml-1.5">Thinking</span>
          </PresencePill>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const variantStyles: Record<string, string> = {
  waiting:
    "border-amber-400/50 bg-amber-950/80 text-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.18)]",
  answered: "border-emerald-500/40 bg-emerald-950/70 text-emerald-300",
  typing:   "border-amber-400/40 bg-slate-900/80 text-amber-300",
  thinking: "border-slate-600/60 bg-slate-800/60 text-slate-400",
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

/** Pulsing dots — visible "opponent is alive and working" signal. */
function ThinkingDots() {
  return (
    <span className="flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-slate-400"
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            delay: i * 0.25,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}
