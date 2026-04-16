"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/button";
import { useSupabaseAuth } from "@/lib/auth";
import {
  DIFFICULTIES,
  type Difficulty,
  TOPICS,
  type Topic
} from "@/lib/topics";

// ── Topic display config ───────────────────────────────────────────────────────

const TOPIC_CONFIG = {
  arithmetic: {
    label: "Arithmetic",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v14M5 12h14M5 19h14" />
      </svg>
    ),
    border: "border-sky-500/50",
    bg: "bg-sky-500/10",
    text: "text-sky-300",
    ring: "ring-sky-500/40",
  },
  "mental-math": {
    label: "Mental Math",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    border: "border-violet-500/50",
    bg: "bg-violet-500/10",
    text: "text-violet-300",
    ring: "ring-violet-500/40",
  },
  algebra: {
    label: "Algebra",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3l12 18M18 3L6 21" />
      </svg>
    ),
    border: "border-indigo-500/50",
    bg: "bg-indigo-500/10",
    text: "text-indigo-300",
    ring: "ring-indigo-500/40",
  },
  percentages: {
    label: "Percentages",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="5" x2="5" y2="19" />
        <circle cx="6.5" cy="6.5" r="2.25" />
        <circle cx="17.5" cy="17.5" r="2.25" />
      </svg>
    ),
    border: "border-cyan-500/50",
    bg: "bg-cyan-500/10",
    text: "text-cyan-300",
    ring: "ring-cyan-500/40",
  },
  fractions: {
    label: "Fractions",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="12" x2="19" y2="12" />
        <circle cx="12" cy="7" r="1.75" fill="currentColor" stroke="none" />
        <circle cx="12" cy="17" r="1.75" fill="currentColor" stroke="none" />
      </svg>
    ),
    border: "border-teal-500/50",
    bg: "bg-teal-500/10",
    text: "text-teal-300",
    ring: "ring-teal-500/40",
  },
  powers: {
    label: "Powers",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19l14-14M15 5h4v4" />
      </svg>
    ),
    border: "border-amber-500/50",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    ring: "ring-amber-500/40",
  },
  mixed: {
    label: "Mixed",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
      </svg>
    ),
    border: "border-rose-500/50",
    bg: "bg-rose-500/10",
    text: "text-rose-300",
    ring: "ring-rose-500/40",
  },
} satisfies Record<Topic, { label: string; icon: React.ReactNode; border: string; bg: string; text: string; ring: string }>;

// ── Difficulty display config ──────────────────────────────────────────────────

const DIFFICULTY_CONFIG = {
  easy: {
    label: "Easy",
    description: "Warm up your brain",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
      </svg>
    ),
    border: "border-emerald-500/50",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    glow: "shadow-lg shadow-emerald-500/20",
    ring: "ring-emerald-500/40",
  },
  medium: {
    label: "Medium",
    description: "Steady challenge",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
    border: "border-amber-500/50",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    glow: "shadow-lg shadow-amber-500/20",
    ring: "ring-amber-500/40",
  },
  hard: {
    label: "Hard",
    description: "For the elite",
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    border: "border-rose-500/50",
    bg: "bg-rose-500/10",
    text: "text-rose-300",
    glow: "shadow-lg shadow-rose-500/20",
    ring: "ring-rose-500/40",
  },
} satisfies Record<Difficulty, { label: string; description: string; icon: React.ReactNode; border: string; bg: string; text: string; glow: string; ring: string }>;

// ── Component ─────────────────────────────────────────────────────────────────

type PlaySetupProps = {
  mode?: "pvp" | "ai";
};

type MatchMode = "quick" | "create-room" | "join-room";

const CARD_TRANSITION = { type: "spring", stiffness: 420, damping: 28, mass: 0.6 } as const;

export function PlaySetup({ mode = "pvp" }: PlaySetupProps) {
  const router = useRouter();
  const { user, loading } = useSupabaseAuth();
  const [selectedTopic, setSelectedTopic] = useState<Topic>("arithmetic");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("easy");
  const [matchMode, setMatchMode] = useState<MatchMode>("quick");
  const [roomCode, setRoomCode] = useState("");
  const [startPending, setStartPending] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [loading, router, user]);

  const normalizedRoomCode = roomCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

  const handleStart = () => {
    if (startPending) {
      return;
    }

    try {
      setStartPending(true);
      const params = new URLSearchParams();

      if (mode === "ai") {
        params.set("mode", "ai");
        params.set("topic", selectedTopic);
        params.set("difficulty", selectedDifficulty);
        router.push(`/game?${params.toString()}`);
        return;
      }

      if (matchMode === "quick") {
        params.set("topic", selectedTopic);
        params.set("difficulty", selectedDifficulty);
        router.push(`/game?${params.toString()}`);
        return;
      }

      if (matchMode === "create-room") {
        params.set("topic", selectedTopic);
        params.set("difficulty", selectedDifficulty);
        params.set("match", "room-create");
        router.push(`/game?${params.toString()}`);
        return;
      }

      params.set("match", "room-join");
      params.set("roomCode", normalizedRoomCode);
      router.push(`/game?${params.toString()}`);
    } catch {
      setStartPending(false);
    }
  };

  const actionLabel =
    mode === "ai"
      ? "⚡ Play vs AI"
      : matchMode === "quick"
      ? "⚡ Find Match"
      : matchMode === "create-room"
      ? "Create Room"
      : "Join Room";

  const actionDisabled =
    loading ||
    !user ||
    startPending ||
    (mode === "pvp" && matchMode === "join-room" && normalizedRoomCode.length !== 6);

  const actionLoadingText =
    mode === "ai"
      ? "Launching..."
      : matchMode === "quick"
      ? "Searching..."
      : matchMode === "create-room"
      ? "Creating..."
      : "Joining...";

  const showLoadout = !(mode === "pvp" && matchMode === "join-room");

  return (
    <section className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-glow backdrop-blur sm:p-7 md:p-10">
      {/* ── Header ── */}
      <div className="space-y-3 text-center sm:space-y-4">
        <span
          className={`inline-flex rounded-full border px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] ${
            mode === "ai"
              ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
              : "border-sky-400/30 bg-sky-400/10 text-sky-200"
          }`}
        >
          {mode === "ai" ? "vs AI" : "Match Setup"}
        </span>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
          Choose Your Battle
        </h1>
        <p className="text-base text-slate-300 sm:text-lg">
          {mode === "ai"
            ? "Pick a topic and face off against MathBot."
            : "Pick quick matchmaking or set up a private room with a friend."}
        </p>
      </div>

      <div className="mt-6 space-y-6 sm:mt-8">
        {/* ── Match mode tabs (PvP only) ── */}
        {mode === "pvp" ? (
          <div className="space-y-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Mode</p>
            <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-800 bg-slate-950/70 p-1">
              {(["quick", "create-room", "join-room"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMatchMode(m)}
                  disabled={startPending}
                  className={`rounded-xl px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:text-xs ${
                    matchMode === m
                      ? "bg-sky-500/20 text-sky-200"
                      : "text-slate-400 hover:bg-slate-900/70 hover:text-slate-200"
                  } ${startPending ? "cursor-not-allowed opacity-55" : "active:scale-[0.975]"}`}
                >
                  {m === "quick" ? "Quick Match" : m === "create-room" ? "Create Room" : "Join Room"}
                </button>
              ))}
            </div>
            <p className="text-center text-xs text-slate-500">
              {matchMode === "quick"
                ? "Fast queue — matched with a random opponent."
                : matchMode === "create-room"
                ? "Create a private room and share the code with a friend."
                : "Enter a 6-character room code to join a private room."}
            </p>
          </div>
        ) : null}

        {/* ── Join room input ── */}
        {mode === "pvp" && matchMode === "join-room" ? (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Room Code</p>
            <input
              aria-label="Room code"
              value={normalizedRoomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              placeholder="ABC123"
              className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3.5 text-center text-lg font-bold uppercase tracking-[0.35em] text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
            />
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Uppercase letters and numbers only.</span>
              <span>{normalizedRoomCode.length}/6</span>
            </div>
            {normalizedRoomCode.length > 0 && normalizedRoomCode.length < 6 ? (
              <p className="text-xs text-amber-300">Enter the full 6-character code to continue.</p>
            ) : null}
          </div>
        ) : null}

        {/* ── Topic grid ── */}
        {showLoadout ? (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Topic</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {TOPICS.map((topic) => {
                const cfg = TOPIC_CONFIG[topic];
                const isSelected = selectedTopic === topic;

                return (
                  <motion.button
                    key={topic}
                    type="button"
                    onClick={() => setSelectedTopic(topic)}
                    disabled={startPending}
                    whileHover={startPending ? undefined : { scale: 1.04, y: -1 }}
                    whileTap={startPending ? undefined : { scale: 0.97 }}
                    transition={CARD_TRANSITION}
                    className={`relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-colors duration-150 sm:p-3.5 ${
                      isSelected
                        ? `${cfg.border} ${cfg.bg} ${cfg.text}`
                        : "border-slate-700/60 bg-slate-900/50 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                    } ${startPending ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
                  >
                    {cfg.icon}
                    <span className="text-[11px] font-semibold leading-tight tracking-wide">
                      {cfg.label}
                    </span>
                    {isSelected ? (
                      <motion.span
                        layoutId="topic-selection-ring"
                        className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ${cfg.ring}`}
                        transition={CARD_TRANSITION}
                      />
                    ) : null}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Difficulty cards ── */}
        {showLoadout ? (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Difficulty</p>
            <div className="grid grid-cols-3 gap-2.5">
              {DIFFICULTIES.map((difficulty) => {
                const cfg = DIFFICULTY_CONFIG[difficulty];
                const isSelected = selectedDifficulty === difficulty;

                return (
                  <motion.button
                    key={difficulty}
                    type="button"
                    onClick={() => setSelectedDifficulty(difficulty)}
                    disabled={startPending}
                    whileHover={startPending ? undefined : { scale: 1.04, y: -1 }}
                    whileTap={startPending ? undefined : { scale: 0.97 }}
                    transition={CARD_TRANSITION}
                    className={`relative flex flex-col items-center gap-3 rounded-2xl border p-4 text-center transition-colors duration-150 sm:p-5 ${
                      isSelected
                        ? `${cfg.border} ${cfg.bg} ${cfg.glow}`
                        : "border-slate-700/60 bg-slate-900/50 hover:border-slate-600"
                    } ${startPending ? "cursor-not-allowed opacity-55" : "cursor-pointer"}`}
                  >
                    <span className={isSelected ? cfg.text : "text-slate-500"}>
                      {cfg.icon}
                    </span>
                    <div>
                      <p className={`text-sm font-bold ${isSelected ? cfg.text : "text-slate-300"}`}>
                        {cfg.label}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-tight text-slate-500">
                        {cfg.description}
                      </p>
                    </div>
                    {isSelected ? (
                      <motion.span
                        layoutId="difficulty-selection-ring"
                        className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ${cfg.ring}`}
                        transition={CARD_TRANSITION}
                      />
                    ) : null}
                  </motion.button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── CTA ── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <Button
            className="w-full py-4 text-lg font-black shadow-lg shadow-sky-500/20"
            onClick={handleStart}
            disabled={actionDisabled}
            loading={startPending}
            loadingText={actionLoadingText}
          >
            {actionLabel}
          </Button>
          <Button
            variant="secondary"
            className="w-full py-3 font-semibold sm:py-4"
            onClick={() => router.push("/")}
            disabled={startPending}
          >
            Back
          </Button>
        </div>
      </div>
    </section>
  );
}
