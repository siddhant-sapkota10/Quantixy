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
type StrikeState = { you: number; opponent: number };
type FeedbackState = {
  youStreak: number;
  opponentStreak: number;
  youPulseKey: number;
  opponentPulseKey: number;
};

const initialScores: ScoreState = { you: 0, opponent: 0 };
const initialStrikes: StrikeState = { you: 0, opponent: 0 };
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
const FINAL_PHASE_SECONDS = 10;
const CLUTCH_SECONDS = 3;
const CLOSE_SCORE_DELTA = 2;

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
  const [strikes, setStrikes] = useState<StrikeState>(initialStrikes);
  const [eliminated, setEliminated] = useState({ you: false, opponent: false });
  const [secondsLeft, setSecondsLeft] = useState(GAME_DURATION_S);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [isFinalPhase, setIsFinalPhase] = useState(false);
  const [scoreImpactKey, setScoreImpactKey] = useState({ you: 0, opponent: 0 });
  const [clutchMoment, setClutchMoment] = useState<{ key: number; side: "you" | "opponent" | null }>({
    key: 0,
    side: null
  });
  const [gameResult, setGameResult] = useState<{
    result: "win" | "loss" | "draw";
  } | null>(null);

  // Stable refs so callbacks never close over stale state
  const statusRef = useRef<AiGameStatus>("countdown");
  const scoresRef = useRef<ScoreState>(initialScores);
  const strikesRef = useRef<StrikeState>(initialStrikes);
  const eliminatedRef = useRef({ you: false, opponent: false });
  const feedbackRef = useRef<FeedbackState>(initialFeedback);
  const currentAnswerRef = useRef(""); // correct answer for the current question
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownStepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownLaunchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const secondsRef = useRef(GAME_DURATION_S);
  const finalPhaseTriggeredRef = useRef(false);
  const finalSecondTickRef = useRef<number | null>(null);
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
  useEffect(() => { strikesRef.current = strikes; }, [strikes]);
  useEffect(() => { eliminatedRef.current = eliminated; }, [eliminated]);

  const playFinalSecondCue = (secondsLeft: number) => {
    if (secondsLeft <= 0 || secondsLeft > FINAL_PHASE_SECONDS) {
      return;
    }
    if (finalSecondTickRef.current === secondsLeft) {
      return;
    }
    finalSecondTickRef.current = secondsLeft;
    soundManager.play(secondsLeft <= CLUTCH_SECONDS ? "fast" : "tick");
  };

  const triggerEndgameScoreImpact = (side: "you" | "opponent") => {
    const secondsLeft = secondsRef.current;
    const nextYou = side === "you" ? scoresRef.current.you + 1 : scoresRef.current.you;
    const nextOpponent = side === "opponent" ? scoresRef.current.opponent + 1 : scoresRef.current.opponent;
    const boost = Math.abs(nextYou - nextOpponent) <= CLOSE_SCORE_DELTA ? 2 : 1;

    if (secondsLeft <= FINAL_PHASE_SECONDS) {
      setScoreImpactKey((previous) => ({
        ...previous,
        [side]: previous[side] + boost
      }));
    }
    if (secondsLeft <= CLUTCH_SECONDS) {
      setClutchMoment((previous) => ({ side, key: previous.key + 1 }));
      soundManager.play("fast");
    }
  };

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

  const finishGame = useCallback((forcedResult?: "win" | "loss" | "draw") => {
    clearTimers();
    isRunningRef.current = false;

    const s = scoresRef.current;
    const result = forcedResult ?? (s.you > s.opponent ? "win" : s.you < s.opponent ? "loss" : "draw");
    setGameResult({ result });
    setStatus("finished");
    statusRef.current = "finished";
    soundManager.play(result === "loss" ? "lose" : "win");
  }, [clearTimers]);

  // ---------------------------------------------------------------------------
  // Generate next question + schedule AI attempts
  // ---------------------------------------------------------------------------
  const scheduleNextQuestion = useCallback(() => {
    if (statusRef.current !== "playing") return;
    if (eliminatedRef.current.you || eliminatedRef.current.opponent) return;

    const { question, answer: correctAnswer } = generateQuestion(topic, difficulty);
    currentAnswerRef.current = correctAnswer;
    setCurrentQuestion(question);
    setAnswer("");

    const scheduleAiAttempt = () => {
      if (statusRef.current !== "playing") return;
      if (eliminatedRef.current.opponent) return;

      const profile = getAiProfile(difficulty);
      const delay = profile.minMs + Math.random() * (profile.maxMs - profile.minMs);
      const willScore = Math.random() < profile.accuracy;

      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);

      aiTimeoutRef.current = setTimeout(() => {
        if (statusRef.current !== "playing") return;
        if (eliminatedRef.current.opponent) return;

        if (willScore) {
          triggerScoreGlow("opponent");
          triggerEndgameScoreImpact("opponent");
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

          scheduleNextQuestion();
          return;
        }

        setFeedback((f) => ({ ...f, opponentStreak: 0 }));
        setStrikes((previous) => {
          const next = { ...previous, opponent: previous.opponent + 1 };
          if (next.opponent >= 3) {
            setEliminated((current) => ({ ...current, opponent: true }));
          } else {
            scheduleAiAttempt();
          }
          return next;
        });
      }, delay);
    };

    scheduleAiAttempt();
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
    setStrikes(initialStrikes);
    strikesRef.current = initialStrikes;
    setEliminated({ you: false, opponent: false });
    eliminatedRef.current = { you: false, opponent: false };
    setFeedback(initialFeedback);
    feedbackRef.current = initialFeedback;
    setCurrentQuestion("");
    setAnswer("");
    setGameResult(null);
    setIsFinalPhase(false);
    setScoreImpactKey({ you: 0, opponent: 0 });
    setClutchMoment({ key: 0, side: null });
    finalPhaseTriggeredRef.current = false;
    finalSecondTickRef.current = null;
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
            playFinalSecondCue(secondsRef.current);
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

  useEffect(() => {
    if (status !== "playing") {
      return;
    }

    if (eliminated.you) {
      finishGame("loss");
      return;
    }

    if (eliminated.opponent) {
      finishGame("win");
    }
  }, [eliminated.opponent, eliminated.you, finishGame, status]);

  useEffect(() => {
    if (status !== "playing") {
      setIsFinalPhase(false);
      finalPhaseTriggeredRef.current = false;
      finalSecondTickRef.current = null;
      return;
    }

    if (!finalPhaseTriggeredRef.current && secondsLeft <= FINAL_PHASE_SECONDS) {
      finalPhaseTriggeredRef.current = true;
      setIsFinalPhase(true);
      soundManager.play("tick");
    }
  }, [secondsLeft, status]);

  // ---------------------------------------------------------------------------
  // Player submits an answer
  // ---------------------------------------------------------------------------
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || status !== "playing" || eliminatedRef.current.you) return;

    const correct = trimmed.toLowerCase() === currentAnswerRef.current.toLowerCase();

    if (correct) {
      // Cancel AI timeout — player answered first
      if (aiTimeoutRef.current) { clearTimeout(aiTimeoutRef.current); aiTimeoutRef.current = null; }

      triggerScoreGlow("you");
      triggerEndgameScoreImpact("you");
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
      setStrikes((previous) => {
        const next = { ...previous, you: previous.you + 1 };
        if (next.you >= 3) {
          setEliminated((current) => ({ ...current, you: true }));
        }
        return next;
      });
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
  const showFinalPhase = isPlaying && isFinalPhase;
  const isFinalSeconds = isPlaying && secondsLeft <= CLUTCH_SECONDS;
  const isCloseScore = Math.abs(scores.you - scores.opponent) <= CLOSE_SCORE_DELTA;
  const resultIsClose = isFinished && isCloseScore;
  const youEliminated = eliminated.you;
  const opponentEliminated = eliminated.opponent;

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
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] rounded-[2rem]"
        animate={{
          opacity: showFinalPhase ? (isFinalSeconds ? 0.4 : 0.26) : 0,
          scale: showFinalPhase ? [1, 1.01, 1] : 1
        }}
        transition={{
          opacity: { duration: 0.22, ease: "easeOut" },
          scale: {
            duration: isFinalSeconds ? 0.55 : 1.1,
            repeat: showFinalPhase ? Number.POSITIVE_INFINITY : 0,
            repeatType: "mirror",
            ease: "easeInOut"
          }
        }}
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(248,113,113,0.08) 0%, rgba(15,23,42,0.35) 64%, rgba(2,6,23,0.48) 100%)"
        }}
      />
      <AnimatePresence>
        {clutchMoment.key > 0 && clutchMoment.side ? (
          <motion.div
            key={`ai-clutch-${clutchMoment.key}`}
            className="pointer-events-none absolute inset-0 z-[2] rounded-[2rem]"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: [0, 0.38, 0], scale: [0.98, 1.01, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.34, ease: "easeOut" }}
            style={{
              background:
                clutchMoment.side === "you"
                  ? "radial-gradient(ellipse at 24% 50%, rgba(56,189,248,0.34) 0%, transparent 65%)"
                  : "radial-gradient(ellipse at 76% 50%, rgba(251,113,133,0.34) 0%, transparent 65%)"
            }}
          />
        ) : null}
      </AnimatePresence>

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

      <div className="relative z-10 flex flex-col gap-5 sm:gap-6 md:gap-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-sky-300">
            <span>Topic: {topicLabel}</span>
            <span>Difficulty: {difficultyLabel}</span>
            <span className={showFinalPhase ? "text-rose-300" : undefined}>Time: {timerLabel}</span>
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
        <div className="grid gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4 md:grid-cols-[1fr_auto_1fr] md:items-end md:gap-4 md:p-6">
          {/* You */}
          <div className="relative flex flex-col gap-2 sm:gap-3">
            <PlayerPanel
              label={yourName}
              score={scores.you}
              strikes={strikes.you}
              eliminated={youEliminated}
              avatar={yourAvatar}
              streakLabel={isPlaying ? yourStreakLabel : null}
              streakLevel={isPlaying ? yourStreakLevel : null}
              highlighted={isPlaying && !!yourStreakLabel}
              pulseKey={feedback.youPulseKey}
              scoreGlowKey={animState.youScoreGlowKey}
            />
            <AnimatePresence>
              {scoreImpactKey.you > 0 ? (
                <motion.div
                  key={`ai-score-you-${scoreImpactKey.you}`}
                  className="pointer-events-none absolute inset-0 z-10 rounded-3xl"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: [0, isCloseScore ? 0.46 : 0.32, 0], scale: [0.98, 1.01, 1] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: isCloseScore ? 0.34 : 0.28, ease: "easeOut" }}
                  style={{
                    background:
                      "radial-gradient(ellipse at 24% 34%, rgba(56,189,248,0.46) 0%, rgba(56,189,248,0.12) 34%, transparent 68%)"
                  }}
                />
              ) : null}
            </AnimatePresence>
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
              strikes={strikes.opponent}
              eliminated={opponentEliminated}
              avatar={BOT_AVATAR}
              streakLabel={isPlaying ? opponentStreakLabel : null}
              streakLevel={isPlaying ? opponentStreakLevel : null}
              highlighted={isPlaying && !!opponentStreakLabel}
              pulseKey={feedback.opponentPulseKey}
              scoreGlowKey={animState.opponentScoreGlowKey}
            />
            <AnimatePresence>
              {scoreImpactKey.opponent > 0 ? (
                <motion.div
                  key={`ai-score-opp-${scoreImpactKey.opponent}`}
                  className="pointer-events-none absolute inset-0 z-10 rounded-3xl"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: [0, isCloseScore ? 0.46 : 0.32, 0], scale: [0.98, 1.01, 1] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: isCloseScore ? 0.34 : 0.28, ease: "easeOut" }}
                  style={{
                    background:
                      "radial-gradient(ellipse at 76% 34%, rgba(251,113,133,0.46) 0%, rgba(251,113,133,0.12) 34%, transparent 68%)"
                  }}
                />
              ) : null}
            </AnimatePresence>
            <FloatingLabel items={opponentFloatingItems} />
          </div>
        </div>

        {/* Question card / countdown / game-over panel */}
        {!isFinished ? (
          <>
            <div className="relative rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-4 text-center sm:p-6">
              {isPlaying && (
                <motion.div
                  className={`absolute right-3 top-3 rounded-full border px-2 py-1 text-sm font-black tracking-[0.15em] sm:right-5 sm:top-5 sm:px-4 sm:py-2 sm:text-lg sm:tracking-[0.2em] ${
                    showFinalPhase
                      ? "border-rose-400/70 bg-rose-950/70 text-rose-100 shadow-[0_0_18px_rgba(248,113,113,0.35)]"
                      : "border-slate-700 bg-slate-950/80 text-sky-200"
                  }`}
                  animate={
                    showFinalPhase
                      ? {
                          scale: isFinalSeconds ? [1, 1.08, 1] : [1, 1.04, 1],
                          opacity: [1, 0.92, 1]
                        }
                      : { scale: 1, opacity: 1 }
                  }
                  transition={{
                    duration: isFinalSeconds ? 0.5 : 0.9,
                    repeat: showFinalPhase ? Number.POSITIVE_INFINITY : 0,
                    ease: "easeInOut"
                  }}
                >
                  {timerLabel}
                </motion.div>
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
                    placeholder={youEliminated ? "Eliminated" : "Type your answer and press Enter"}
                    autoComplete="off"
                    disabled={youEliminated}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-4 text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <Button className="w-full" type="submit" disabled={!answer.trim() || youEliminated}>
                  Submit Answer
                </Button>
                <p className="text-center text-xs uppercase tracking-[0.2em] text-slate-400">
                  Strikes: {strikes.you}/3
                </p>
                {youEliminated ? (
                  <p className="text-center text-xs uppercase tracking-[0.2em] text-rose-300">
                    Eliminated
                  </p>
                ) : null}
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
              } ${resultIsClose ? "shadow-[0_0_30px_rgba(248,113,113,0.18)]" : ""}`}
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
              {resultIsClose ? (
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                  Photo Finish
                </p>
              ) : null}
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
