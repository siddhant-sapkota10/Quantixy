"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { Dropdown } from "@/components/dropdown";
import { useSupabaseAuth } from "@/lib/auth";
import {
  DIFFICULTIES,
  type Difficulty,
  TOPICS,
  type Topic,
  formatTopicLabel
} from "@/lib/topics";

const topicOptions = TOPICS.map((topic) => ({
  label: formatTopicLabel(topic),
  value: topic
}));

const difficultyOptions = DIFFICULTIES.map((difficulty) => ({
  label: difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
  value: difficulty
}));

type PlaySetupProps = {
  mode?: "pvp" | "ai";
};

type MatchMode = "quick" | "create-room" | "join-room";

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
      ? "Play vs AI"
      : matchMode === "quick"
      ? "Start Quick Match"
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
      ? "Joining..."
      : matchMode === "create-room"
      ? "Creating..."
      : "Joining...";

  return (
    <section className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-glow backdrop-blur sm:p-7 md:p-10">
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

      <div className="mt-6 space-y-4 sm:mt-8 sm:space-y-5">
        {mode === "pvp" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-800 bg-slate-950/70 p-1 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => setMatchMode("quick")}
              disabled={startPending}
              className={`rounded-xl px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:text-sm ${
                matchMode === "quick"
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-900/70"
              } ${startPending ? "cursor-not-allowed opacity-55 saturate-50" : "active:scale-[0.975]"}`}
            >
              Quick Match
            </button>
            <button
              type="button"
              onClick={() => setMatchMode("create-room")}
              disabled={startPending}
              className={`rounded-xl px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:text-sm ${
                matchMode === "create-room"
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-900/70"
              } ${startPending ? "cursor-not-allowed opacity-55 saturate-50" : "active:scale-[0.975]"}`}
            >
              Create Room
            </button>
            <button
              type="button"
              onClick={() => setMatchMode("join-room")}
              disabled={startPending}
              className={`rounded-xl px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:text-sm ${
                matchMode === "join-room"
                  ? "bg-sky-500/20 text-sky-200"
                  : "text-slate-300 hover:bg-slate-900/70"
              } ${startPending ? "cursor-not-allowed opacity-55 saturate-50" : "active:scale-[0.975]"}`}
            >
              Join Room
            </button>
            </div>
            <p className="text-center text-xs text-slate-400">
              {matchMode === "quick"
                ? "Fast queue with random opponents."
                : matchMode === "create-room"
                ? "Create a private room and invite a friend."
                : "Enter a 6-character room code to join a private room."}
            </p>
          </div>
        ) : null}

        {mode === "pvp" && matchMode === "join-room" ? (
          <label className="block space-y-2 text-left">
            <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
              Room Code
            </span>
            <input
              aria-label="Room code"
              value={normalizedRoomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              placeholder="ABC123"
              className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-center text-base font-semibold uppercase tracking-[0.35em] text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35 sm:text-lg"
            />
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Codes are uppercase and 6 characters.</span>
              <span>{normalizedRoomCode.length}/6</span>
            </div>
            {normalizedRoomCode.length > 0 && normalizedRoomCode.length < 6 ? (
              <p className="text-xs text-amber-300">Enter the full room code to continue.</p>
            ) : null}
          </label>
        ) : (
          <>
            <label className="block space-y-2 text-left">
              <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                Select Topic
              </span>
              <Dropdown
                aria-label="Select a math topic"
                value={selectedTopic}
                onChange={(event) => setSelectedTopic(event.target.value as Topic)}
                options={topicOptions}
              />
            </label>

            <label className="block space-y-2 text-left">
              <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                Select Difficulty
              </span>
              <Dropdown
                aria-label="Select a difficulty"
                value={selectedDifficulty}
                onChange={(event) => setSelectedDifficulty(event.target.value as Difficulty)}
                options={difficultyOptions}
              />
            </label>
          </>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          <Button
            className="w-full py-3 text-base font-bold shadow-lg shadow-sky-500/20 sm:py-4 sm:text-lg"
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
