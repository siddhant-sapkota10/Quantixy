"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { PlayerPanel } from "@/components/player-panel";
import { SoundToggle } from "@/components/sound-toggle";
import { soundManager } from "@/lib/sounds";
import { formatTopicLabel, getSafeDifficulty, getSafeTopic } from "@/lib/topics";
import { getAvatar } from "@/lib/avatars";
import { useGameAnimations } from "@/hooks/useGameAnimations";
import { FloatingLabel } from "@/components/animations/FloatingLabel";
import { CountdownDisplay } from "@/components/animations/CountdownDisplay";
import { GameOverOverlay } from "@/components/animations/GameOverOverlay";
import { generateQuestion, getAiProfile } from "@/lib/ai-game-engine";
import { getSupabaseClient } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AiGameStatus = "countdown" | "playing" | "finished";

type ScoreState = { you: number; opponent: number };
type FeedbackState = {
  youStreak: number;
  opponentStreak: number;
  youPulseKey: number;
  opponentPulseKey: number;
};

const initialScores: ScoreState = { you: 0, opponent: 0 };
const initialFeedback: FeedbackState = {
  youStreak: 0,
  opponentStreak: 0,
  youPulseKey: 0,
  opponentPulseKey: 0,
};

// ---------------------------------------------------------------------------
// MathBot avatar (fox)
// ---------------------------------------------------------------------------
const BOT_AVATAR = "🤖";
const BOT_NAME = "MathBot";
const GAME_DURATION_S = 60;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AiGameClientProps = {
  initialTopic?: string;
  initialDifficulty?: string;
};

export function AiGameClient({ initialTopic, initialDifficulty }: AiGameClientProps) {
  const router = useRouter();
  const topic = getSafeTopic(initialTopic);
  const difficulty = getSafeDifficulty(initialDifficulty);
  const topicLabel = formatTopicLabel(topic);
  const difficultyLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  // Auth / player info
  const [yourName, setYourName] = useState("You");
  const [yourAvatar, setYourAvatar] = useState("🦊");

  // Game state
  const [status, setStatus] = useState<AiGameStatus>("countdown");
  const [scores, setScores] = useState<ScoreState>(initialScores);
  const [secondsLeft, setSecondsLeft] = useState(GAME_DURATION_S);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [gameResult, setGameResult] = useState<{
    result: "win" | "loss" | "draw";
  } | null>(null);

  // Stable refs so callbacks never close over stale state
  const statusRef = useRef<AiGameStatus>("countdown");
  const scoresRef = useRef<ScoreState>(initialScores);
  const feedbackRef = useRef<FeedbackState>(initialFeedback);
  const currentAnswerRef = useRef(""); // correct answer for the current question
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownStepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownLaunchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const secondsRef = useRef(GAME_DURATION_S);
  // Incremented on every cleanup — any in-flight countdown from a prior run checks this
  // and exits early. Prevents React Strict Mode's double-invoke from spawning two intervals.
  const countdownGenRef = useRef(0);
  // Increment to restart the whole game
  const [gameKey, setGameKey] = useState(0);

  const {
    animState,
    triggerScoreGlow,
    triggerStreakBroken,
  } = useGameAnimations();

  // Keep refs in sync
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { scoresRef.current = scores; }, [scores]);
  useEffect(() => { feedbackRef.current = feedback; }, [feedback]);

  // ---------------------------------------------------------------------------
  // Load player profile once
  // ---------------------------------------------------------------------------
  useEffect(() => {
    soundManager.init();
    setMuted(soundManager.isMuted());

    const loadProfile = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push("/"); return; }

        type PlayerRow = { display_name: string | null; username: string | null; avatar_id: string | null };
        const { data } = await supabase
          .from("players")
          .select("display_name, username, avatar_id")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        const row = data as PlayerRow | null;
        const name = row?.display_name ?? row?.username;
        if (name) setYourName(name);
        if (row?.avatar_id) setYourAvatar(getAvatar(row.avatar_id).emoji);
      } catch {
        // non-fatal; defaults stay
      }
    };

    void loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // End game
  // ---------------------------------------------------------------------------
  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (aiTimeoutRef.current) { clearTimeout(aiTimeoutRef.current); aiTimeoutRef.current = null; }
    if (countdownStepTimeoutRef.current) { clearTimeout(countdownStepTimeoutRef.current); countdownStepTimeoutRef.current = null; }
    if (countdownLaunchTimeoutRef.current) { clearTimeout(countdownLaunchTimeoutRef.current); countdownLaunchTimeoutRef.current = null; }
  }, []);

  const finishGame = useCallback(() => {
    clearTimers();
    isRunningRef.current = false;

    const s = scoresRef.current;
    const result = s.you > s.opponent ? "win" : s.you < s.opponent ? "loss" : "draw";
    setGameResult({ result });
    setStatus("finished");
    statusRef.current = "finished";
    soundManager.play(result === "loss" ? "lose" : "win");
  }, [clearTimers]);

  // ---------------------------------------------------------------------------
  // Generate next question + schedule AI
  // ---------------------------------------------------------------------------
  const scheduleNextQuestion = useCallback(() => {
    if (statusRef.current !== "playing") return;

    const { question, answer: correctAnswer } = generateQuestion(topic, difficulty);
    currentAnswerRef.current = correctAnswer;
    setCurrentQuestion(question);
    setAnswer("");

    // Schedule AI response
    const profile = getAiProfile(difficulty);
    const delay = profile.minMs + Math.random() * (profile.maxMs - profile.minMs);
    const willScore = Math.random() < profile.accuracy;

    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);

    aiTimeoutRef.current = setTimeout(() => {
      if (statusRef.current !== "playing") return;

      if (willScore) {
        // AI scores a point
        triggerScoreGlow("opponent");
        const prev = feedbackRef.current;
        const newStreak = prev.opponentStreak + 1;

        setScores((s) => ({ ...s, opponent: s.opponent + 1 }));
        setFeedback((f) => ({
          ...f,
          opponentStreak: newStreak,
          opponentPulseKey: f.opponentPulseKey + 1,
        }));

        if (newStreak >= 3 && newStreak > prev.opponentStreak) {
          soundManager.play("streak");
        } else {
          soundManager.play("correct");
        }

        // Advance to next question
        scheduleNextQuestion();
      }
      // If AI misses: question stays until player answers or game ends
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, difficulty]);

  // ---------------------------------------------------------------------------
  // Start countdown then game
  // ---------------------------------------------------------------------------
  const startCountdown = useCallback(() => {
    const generation = countdownGenRef.current;
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    setStatus("countdown");
    statusRef.current = "countdown";
    setCountdownValue(null);
    setScores(initialScores);
    scoresRef.current = initialScores;
    setFeedback(initialFeedback);
    feedbackRef.current = initialFeedback;
    setCurrentQuestion("");
    setAnswer("");
    setGameResult(null);
    secondsRef.current = GAME_DURATION_S;
    setSecondsLeft(GAME_DURATION_S);
    clearTimers();

    const steps: Array<{ value: string; sound: "tick" | "go" }> = [
      { value: "3", sound: "tick" },
      { value: "2", sound: "tick" },
      { value: "1", sound: "tick" },
      { value: "GO", sound: "go" },
    ];

    let idx = 0;
    const tick = () => {
      if (generation !== countdownGenRef.current) return;
      const step = steps[idx];
      if (!step) return;
      setCountdownValue(step.value);
      soundManager.play(step.sound);
      idx++;
      if (idx < steps.length) {
        countdownStepTimeoutRef.current = setTimeout(tick, 1000);
      } else {
        // Launch game after GO
        countdownLaunchTimeoutRef.current = setTimeout(() => {
          if (generation !== countdownGenRef.current) return;
          setStatus("playing");
          statusRef.current = "playing";
          setCountdownValue(null);

          // Start 60-second timer
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          timerRef.current = setInterval(() => {
            if (generation !== countdownGenRef.current) {
              if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
              return;
            }
            secondsRef.current -= 1;
            setSecondsLeft(secondsRef.current);
            if (secondsRef.current <= 0) {
              finishGame();
            }
          }, 1000);

          scheduleNextQuestion();
        }, 700);
      }
    };

    countdownStepTimeoutRef.current = setTimeout(tick, 400);
  }, [clearTimers, finishGame, scheduleNextQuestion]);

  // Kick off on first render (and on rematch via gameKey)
  useEffect(() => {
    countdownGenRef.current += 1;
    startCountdown();
    return () => {
      countdownGenRef.current += 1;
      isRunningRef.current = false;
      clearTimers();
    };
  // gameKey is the only dep we want — startCountdown is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey]);

  // ---------------------------------------------------------------------------
  // Player submits an answer
  // ---------------------------------------------------------------------------
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || status !== "playing") return;

    const correct = trimmed.toLowerCase() === currentAnswerRef.current.toLowerCase();

    if (correct) {
      // Cancel AI timeout — player answered first
      if (aiTimeoutRef.current) { clearTimeout(aiTimeoutRef.current); aiTimeoutRef.current = null; }

      triggerScoreGlow("you");
      const prev = feedbackRef.current;
      const newStreak = prev.youStreak + 1;

      setScores((s) => ({ ...s, you: s.you + 1 }));
      setFeedback((f) => ({
        ...f,
        youStreak: newStreak,
        youPulseKey: f.youPulseKey + 1,
      }));

      if (newStreak >= 3 && newStreak > prev.youStreak) {
        soundManager.play("streak");
      } else {
        soundManager.play("correct");
      }

      scheduleNextQuestion();
    } else {
      soundManager.play("wrong");
      if (feedbackRef.current.youStreak >= 2) triggerStreakBroken();
      setFeedback((f) => ({ ...f, youStreak: 0 }));
      setAnswer("");
    }
  };

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const timerLabel = `00:${String(Math.max(0, secondsLeft)).padStart(2, "0")}`;
  const isPlaying = status === "playing";
  const isFinished = status === "finished";
  const isCountdown = status === "countdown";

  const getStreakLabel = (streak: number) => {
    if (streak >= 5) return "UNSTOPPABLE";
    if (streak >= 3) return "ON FIRE";
    return null;
  };
  const yourStreakLabel = getStreakLabel(feedback.youStreak);
  const opponentStreakLabel = getStreakLabel(feedback.opponentStreak);
  const yourStreakLevel = feedback.youStreak >= 5 ? "unstoppable" : feedback.youStreak >= 3 ? "fire" : null;
  const opponentStreakLevel = feedback.opponentStreak >= 5 ? "unstoppable" : feedback.opponentStreak >= 3 ? "fire" : null;

  const youFloatingItems = animState.powerUpReadyLabels
    .filter((l) => l.who === "you")
    .map((l) => ({ id: l.id, text: l.type === "freeze" ? "FREEZE READY ❄️" : "SHIELD READY 🛡️", color: "#bae6fd" }));

  const opponentFloatingItems = animState.powerUpReadyLabels
    .filter((l) => l.who === "opponent")
    .map((l) => ({ id: l.id, text: l.type === "freeze" ? "FREEZE READY ❄️" : "SHIELD READY 🛡️", color: "#bae6fd" }));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <section className="relative w-full max-w-4xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-glow backdrop-blur sm:p-6 md:p-10">
      <GameOverOverlay result={isFinished ? (gameResult?.result ?? null) : null} />

      {/* Streak-broken popup */}
      <AnimatePresence>
        {animState.streakBrokenVisible && (
          <motion.div
            key="streak-broken"
            className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-rose-500/30 bg-rose-950/90 px-4 py-2 text-sm font-bold text-rose-300"
            initial={{ opacity: 0, y: -10, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.94 }}
            transition={{ duration: 0.22 }}
          >
            Streak Broken 💔
          </motion.div>
        )}
      </AnimatePresence>

      <SoundToggle
        muted={muted}
        onToggle={() => {
          const next = !muted;
          soundManager.setMuted(next);
          setMuted(next);
        }}
      />

      <div className="flex flex-col gap-5 sm:gap-6 md:gap-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-sky-300">
            <span>Topic: {topicLabel}</span>
            <span>Difficulty: {difficultyLabel}</span>
            <span>Time: {timerLabel}</span>
            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-violet-300">
              vs AI
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">
            {isCountdown ? "Match Starting" : isPlaying ? "In Game" : "Game Over"}
          </h1>
          <p className="text-sm text-slate-300 sm:text-base">
            {isCountdown
              ? "Get ready. The round starts in a moment."
              : isPlaying
              ? "Answer quickly and keep the score moving."
              : "This round is complete."}
          </p>
        </div>

        {/* Player panels */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 rounded-3xl border border-slate-800 bg-slate-900/70 p-3 sm:gap-4 sm:p-4 md:p-6">
          {/* You */}
          <div className="relative flex flex-col gap-2 sm:gap-3">
            <PlayerPanel
              label={yourName}
              score={scores.you}
              avatar={yourAvatar}
              streakLabel={isPlaying ? yourStreakLabel : null}
              streakLevel={isPlaying ? yourStreakLevel : null}
              highlighted={isPlaying && !!yourStreakLabel}
              pulseKey={feedback.youPulseKey}
              scoreGlowKey={animState.youScoreGlowKey}
            />
            <FloatingLabel items={youFloatingItems} />
          </div>

          <div className="flex items-center justify-center self-center text-xs font-semibold uppercase tracking-[0.35em] text-slate-500 sm:text-sm">
            vs
          </div>

          {/* MathBot */}
          <div className="relative flex flex-col gap-2 sm:gap-3">
            <PlayerPanel
              label={BOT_NAME}
              score={scores.opponent}
              avatar={BOT_AVATAR}
              streakLabel={isPlaying ? opponentStreakLabel : null}
              streakLevel={isPlaying ? opponentStreakLevel : null}
              highlighted={isPlaying && !!opponentStreakLabel}
              pulseKey={feedback.opponentPulseKey}
              scoreGlowKey={animState.opponentScoreGlowKey}
            />
            <FloatingLabel items={opponentFloatingItems} />
          </div>
        </div>

        {/* Question card / countdown / game-over panel */}
        {!isFinished ? (
          <>
            <div className="relative rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-4 text-center sm:p-6">
              {isPlaying && (
                <div className="absolute right-3 top-3 rounded-full border border-slate-700 bg-slate-950/80 px-2 py-1 text-sm font-black tracking-[0.15em] text-sky-200 sm:right-5 sm:top-5 sm:px-4 sm:py-2 sm:text-lg sm:tracking-[0.2em]">
                  {timerLabel}
                </div>
              )}

              <p className={`text-sm uppercase tracking-[0.3em] text-slate-500 ${isPlaying ? "pr-14 sm:pr-0" : ""}`}>
                {isCountdown ? "Countdown" : "Current Question"}
              </p>

              {isCountdown ? (
                <CountdownDisplay value={countdownValue} />
              ) : (
                <p className="mt-3 text-xl font-black tracking-tight text-white sm:mt-4 sm:text-3xl md:text-5xl">
                  {currentQuestion}
                </p>
              )}
            </div>

            {isPlaying && (
              <form className="space-y-3" onSubmit={handleSubmit}>
                <label className="block space-y-2">
                  <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                    Your Answer
                  </span>
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer and press Enter"
                    autoComplete="off"
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-4 text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35"
                  />
                </label>
                <Button className="w-full" type="submit" disabled={!answer.trim()}>
                  Submit Answer
                </Button>
              </form>
            )}
          </>
        ) : (
          <motion.div
            initial={{ y: 0 }}
            animate={gameResult?.result === "loss" ? { y: [0, 6, 0] } : {}}
            transition={{ duration: 1.3, delay: 0.5, ease: "easeInOut" }}
          >
            <div
              className={`rounded-[1.75rem] border p-4 text-center sm:p-6 ${
                gameResult?.result === "win"
                  ? "border-sky-400/40 bg-sky-500/10"
                  : gameResult?.result === "draw"
                  ? "border-amber-400/40 bg-amber-500/10"
                  : "border-rose-500/30 bg-rose-500/10"
              }`}
            >
              <p
                className={`text-sm uppercase tracking-[0.3em] ${
                  gameResult?.result === "win"
                    ? "text-sky-300"
                    : gameResult?.result === "draw"
                    ? "text-amber-300"
                    : "text-rose-300"
                }`}
              >
                Game Over
              </p>
              <h2
                className={`mt-3 text-2xl font-black tracking-tight sm:mt-4 sm:text-3xl md:text-4xl ${
                  gameResult?.result === "win"
                    ? "text-sky-200"
                    : gameResult?.result === "draw"
                    ? "text-amber-200"
                    : "text-rose-200"
                }`}
              >
                {gameResult?.result === "win"
                  ? "You Win! 🎉"
                  : gameResult?.result === "draw"
                  ? "It's a Draw! 🤝"
                  : "You Lose"}
              </h2>
              <p className="mt-3 text-sm text-slate-300 sm:text-base">
                {gameResult?.result === "win"
                  ? `You beat ${BOT_NAME} — nice work!`
                  : gameResult?.result === "draw"
                  ? `Dead heat against ${BOT_NAME}.`
                  : `${BOT_NAME} won this round. Try again!`}
              </p>
              <p className="mt-4 text-sm uppercase tracking-[0.25em] text-slate-400 sm:mt-6">
                Final Score
              </p>
              <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
                {scores.you} – {scores.opponent}
              </p>
              <p className="mt-2 text-sm text-slate-400">Opponent: {BOT_NAME}</p>

              <div className="mt-6 grid gap-3 sm:mt-8 md:grid-cols-2">
                <Button
                  className="w-full"
                  onClick={() => setGameKey((k) => k + 1)}
                >
                  Play Again
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => router.push("/")}
                >
                  Change Topic
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
