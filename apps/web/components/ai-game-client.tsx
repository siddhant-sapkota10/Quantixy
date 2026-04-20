"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { SoundToggle } from "@/components/sound-toggle";
import { soundManager } from "@/lib/sounds";
import { formatTopicLabel, getSafeDifficulty, getSafeTopic } from "@/lib/topics";
import { AVATARS, getAvatar, type AvatarId } from "@/lib/avatars";
import { useGameAnimations } from "@/hooks/useGameAnimations";
import { FloatingLabel } from "@/components/animations/FloatingLabel";
import { CountdownDisplay } from "@/components/animations/CountdownDisplay";
import { GameOverOverlay } from "@/components/animations/GameOverOverlay";
import { generateQuestion, getAiProfile } from "@/lib/ai-game-engine";
import { getSupabaseClient } from "@/lib/supabase";
import { QuestionContent } from "@/components/question-content";
import type { DuelQuestion } from "@/lib/question-model";
import { WorkingScratchpad } from "@/components/working-scratchpad";
import { MatchChampionCard } from "@/components/match-champion-card";
import { normalizeUltimateType } from "@/lib/ultimate-vfx";
import { EMOTES, getEmoteById } from "@/lib/emotes";
import { EmoteBar } from "@/components/EmoteBar";
import { EmoteDisplay, type EmoteDisplayItem } from "@/components/EmoteDisplay";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  isCorrectAnswer: isSharedCorrectAnswer,
  getMatchDurationSeconds: getSharedMatchDurationSeconds
} = require("../../../packages/shared/question-engine");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AiGameStatus = "countdown" | "playing" | "finished";

type ScoreState = { you: number; opponent: number };
type BotUltimateId = "rapid_fire" | "system_corrupt" | "perfect_sequence" | "overpower" | "shield" | "double";
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
// MathBot identity
// ---------------------------------------------------------------------------
const BOT_NAME = "MathBot";
const FINAL_PHASE_SECONDS = 10;
const CLUTCH_SECONDS = 3;
const CLOSE_SCORE_DELTA = 2;
const BOT_ULTIMATE_MAX_CHARGE = 100;
const BOT_ULTIMATE_CORRECT_CHARGE = 18;
const BOT_ULTIMATE_STREAK_BONUS_CHARGE = 6;
const DUEL_MAX_HP = 150;
const DUEL_DISPLAY_MAX_HP = 100;
const DUEL_CORRECT_DAMAGE = 15;
const DUEL_SKIP_DAMAGE = 12;
const AI_EMOTE_COOLDOWN_MS = 1500;
const BOT_ULTIMATE_DURATIONS: Record<BotUltimateId, number> = {
  rapid_fire: 10_000,
  system_corrupt: 10_000,
  shield: 10_000,
  double: 10_000,
  perfect_sequence: 13_000,
  overpower: 13_000
};

function getRandomBotAvatarId() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)]?.id as AvatarId;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type AiGameClientProps = {
  initialTopic?: string;
  initialDifficulty?: string;
  opponentMode?: "practice" | "duel";
};

export function AiGameClient({ initialTopic, initialDifficulty, opponentMode = "practice" }: AiGameClientProps) {
  const router = useRouter();
  const topic = getSafeTopic(initialTopic);
  const difficulty = getSafeDifficulty(initialDifficulty);
  const isDuelMode = opponentMode === "duel";
  const matchDurationSeconds = isDuelMode ? Number(getSharedMatchDurationSeconds(topic, difficulty) ?? 60) : 60;
  const topicLabel = formatTopicLabel(topic);
  const difficultyLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  // Auth / player info
  const [yourName, setYourName] = useState("You");
  const [yourAvatar, setYourAvatar] = useState("🦊");
  const [yourAvatarId, setYourAvatarId] = useState<AvatarId>("flash");
  const [yourUltimateCharge, setYourUltimateCharge] = useState(0);
  const [yourUltimateActiveUntil, setYourUltimateActiveUntil] = useState(0);
  const [yourUltimateUsed, setYourUltimateUsed] = useState(false);
  const [yourArchitectSequence, setYourArchitectSequence] = useState(0);
  const [yourShieldedHit, setYourShieldedHit] = useState(false);
  const [botAvatarId, setBotAvatarId] = useState<AvatarId>(() => getRandomBotAvatarId());
  const [botUltimateCharge, setBotUltimateCharge] = useState(0);
  const [botUltimateActiveUntil, setBotUltimateActiveUntil] = useState(0);
  const [botUltimateUsed, setBotUltimateUsed] = useState(false);
  const [botUltimateActivationKey, setBotUltimateActivationKey] = useState(0);
  const [botArchitectSequence, setBotArchitectSequence] = useState(0);
  const [botShieldedMiss, setBotShieldedMiss] = useState(false);
  const [playerInputLockedUntil, setPlayerInputLockedUntil] = useState(0);

  // Game state
  const [status, setStatus] = useState<AiGameStatus>("countdown");
  const [scores, setScores] = useState<ScoreState>(initialScores);
  const [mistakes, setMistakes] = useState({ you: 0, opponent: 0 });
  const [eliminated, setEliminated] = useState({ you: false, opponent: false });
  const [secondsLeft, setSecondsLeft] = useState(matchDurationSeconds);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [currentQuestionData, setCurrentQuestionData] = useState<DuelQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [hp, setHp] = useState({ you: DUEL_MAX_HP, opponent: DUEL_MAX_HP });
  const [emoteBarOpen, setEmoteBarOpen] = useState(false);
  const [emoteCooldownUntil, setEmoteCooldownUntil] = useState(0);
  const [emoteLabels, setEmoteLabels] = useState<EmoteDisplayItem[]>([]);
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
  const eliminatedRef = useRef({ you: false, opponent: false });
  const feedbackRef = useRef<FeedbackState>(initialFeedback);
  const yourAvatarIdRef = useRef<AvatarId>(yourAvatarId);
  const yourUltimateChargeRef = useRef(0);
  const yourUltimateActiveUntilRef = useRef(0);
  const yourUltimateUsedRef = useRef(false);
  const yourArchitectSequenceRef = useRef(0);
  const yourShieldedHitRef = useRef(false);
  const botAvatarIdRef = useRef<AvatarId>(botAvatarId);
  const botUltimateChargeRef = useRef(0);
  const botUltimateActiveUntilRef = useRef(0);
  const botUltimateUsedRef = useRef(false);
  const botArchitectSequenceRef = useRef(0);
  const botShieldedMissRef = useRef(false);
  const playerInputLockedUntilRef = useRef(0);
  const hpRef = useRef({ you: DUEL_MAX_HP, opponent: DUEL_MAX_HP });
  const emoteLabelIdRef = useRef(0);
  const currentAnswerRef = useRef(""); // correct answer for the current question
  const currentQuestionDataRef = useRef<DuelQuestion | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownStepTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownLaunchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunningRef = useRef(false);
  const secondsRef = useRef(matchDurationSeconds);
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
  useEffect(() => { eliminatedRef.current = eliminated; }, [eliminated]);
  useEffect(() => { yourAvatarIdRef.current = yourAvatarId; }, [yourAvatarId]);
  useEffect(() => { yourUltimateChargeRef.current = yourUltimateCharge; }, [yourUltimateCharge]);
  useEffect(() => { yourUltimateActiveUntilRef.current = yourUltimateActiveUntil; }, [yourUltimateActiveUntil]);
  useEffect(() => { yourUltimateUsedRef.current = yourUltimateUsed; }, [yourUltimateUsed]);
  useEffect(() => { yourArchitectSequenceRef.current = yourArchitectSequence; }, [yourArchitectSequence]);
  useEffect(() => { yourShieldedHitRef.current = yourShieldedHit; }, [yourShieldedHit]);
  useEffect(() => { botAvatarIdRef.current = botAvatarId; }, [botAvatarId]);
  useEffect(() => { botUltimateChargeRef.current = botUltimateCharge; }, [botUltimateCharge]);
  useEffect(() => { botUltimateActiveUntilRef.current = botUltimateActiveUntil; }, [botUltimateActiveUntil]);
  useEffect(() => { botUltimateUsedRef.current = botUltimateUsed; }, [botUltimateUsed]);
  useEffect(() => { botArchitectSequenceRef.current = botArchitectSequence; }, [botArchitectSequence]);
  useEffect(() => { botShieldedMissRef.current = botShieldedMiss; }, [botShieldedMiss]);
  useEffect(() => { playerInputLockedUntilRef.current = playerInputLockedUntil; }, [playerInputLockedUntil]);
  useEffect(() => { hpRef.current = hp; }, [hp]);

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

  const pushEmoteLabel = useCallback((who: "you" | "opponent", emoteId: string) => {
    const emote = getEmoteById(emoteId);
    const id = ++emoteLabelIdRef.current;

    setEmoteLabels((previous) => [
      ...previous,
      {
        id,
        who,
        icon: emote.icon,
        label: emote.label
      }
    ]);

    window.setTimeout(() => {
      setEmoteLabels((previous) => previous.filter((item) => item.id !== id));
    }, 1900);
  }, []);

  const handleSendEmote = useCallback((emoteId: string) => {
    if (!isDuelMode || statusRef.current !== "playing" || emoteCooldownUntil > Date.now()) {
      return;
    }

    pushEmoteLabel("you", emoteId);
    setEmoteCooldownUntil(Date.now() + AI_EMOTE_COOLDOWN_MS);

    window.setTimeout(() => {
      if (statusRef.current !== "playing") return;
      const botEmote = EMOTES[Math.floor(Math.random() * Math.min(EMOTES.length, 4))];
      if (botEmote) {
        pushEmoteLabel("opponent", botEmote.id);
      }
    }, 450 + Math.random() * 450);
  }, [emoteCooldownUntil, isDuelMode, pushEmoteLabel]);

  const activateYourUltimate = useCallback((avatarId = yourAvatarIdRef.current) => {
    if (!isDuelMode || yourUltimateUsedRef.current || statusRef.current !== "playing") {
      return;
    }

    const avatar = getAvatar(avatarId);
    const ultimateType = avatar.ultimateId as BotUltimateId;
    const durationMs = BOT_ULTIMATE_DURATIONS[ultimateType] ?? 10_000;
    const until = Date.now() + durationMs;

    yourUltimateUsedRef.current = true;
    yourUltimateActiveUntilRef.current = until;
    setYourUltimateUsed(true);
    setYourUltimateCharge(BOT_ULTIMATE_MAX_CHARGE);
    setYourUltimateActiveUntil(until);
    soundManager.play("streak");

    if (ultimateType === "shield") {
      yourShieldedHitRef.current = true;
      setYourShieldedHit(true);
    }

    window.setTimeout(() => {
      if (yourUltimateActiveUntilRef.current === until) {
        yourUltimateActiveUntilRef.current = 0;
        setYourUltimateActiveUntil(0);
        setYourArchitectSequence(0);
        yourArchitectSequenceRef.current = 0;
      }
    }, durationMs + 25);
  }, [isDuelMode]);

  const increaseYourUltimateCharge = useCallback((amount: number) => {
    if (!isDuelMode || yourUltimateUsedRef.current || statusRef.current !== "playing") {
      return;
    }

    const nextCharge = Math.min(BOT_ULTIMATE_MAX_CHARGE, yourUltimateChargeRef.current + amount);
    yourUltimateChargeRef.current = nextCharge;
    setYourUltimateCharge(nextCharge);
  }, [isDuelMode]);

  const activateBotUltimate = useCallback((avatarId = botAvatarIdRef.current) => {
    if (botUltimateUsedRef.current || statusRef.current !== "playing") {
      return;
    }

    const avatar = getAvatar(avatarId);
    const ultimateType = avatar.ultimateId as BotUltimateId;
    const durationMs = BOT_ULTIMATE_DURATIONS[ultimateType] ?? 10_000;
    const until = Date.now() + durationMs;

    botUltimateUsedRef.current = true;
    botUltimateActiveUntilRef.current = until;
    setBotUltimateUsed(true);
    setBotUltimateCharge(BOT_ULTIMATE_MAX_CHARGE);
    setBotUltimateActiveUntil(until);
    setBotUltimateActivationKey((value) => value + 1);
    soundManager.play("streak");

    if (ultimateType === "system_corrupt") {
      const lockUntil = Date.now() + 2200;
      playerInputLockedUntilRef.current = lockUntil;
      setPlayerInputLockedUntil(lockUntil);
    }

    if (ultimateType === "shield") {
      botShieldedMissRef.current = true;
      setBotShieldedMiss(true);
    }

    window.setTimeout(() => {
      if (botUltimateActiveUntilRef.current === until) {
        botUltimateActiveUntilRef.current = 0;
        setBotUltimateActiveUntil(0);
        setBotArchitectSequence(0);
        botArchitectSequenceRef.current = 0;
      }
    }, durationMs + 25);
  }, []);

  const increaseBotUltimateCharge = useCallback((amount: number) => {
    if (botUltimateUsedRef.current || statusRef.current !== "playing") {
      return;
    }

    const nextCharge = Math.min(BOT_ULTIMATE_MAX_CHARGE, botUltimateChargeRef.current + amount);
    botUltimateChargeRef.current = nextCharge;
    setBotUltimateCharge(nextCharge);

    if (nextCharge >= BOT_ULTIMATE_MAX_CHARGE) {
      activateBotUltimate();
    }
  }, [activateBotUltimate]);

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

        type PlayerRow = { display_name: string | null; username: string | null; avatar: string | null };
        const { data } = await supabase
          .from("players")
          .select("display_name, username, avatar")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        const row = data as PlayerRow | null;
        const name = row?.display_name ?? row?.username;
        if (name) setYourName(name);
        if (row?.avatar) {
          const avatar = getAvatar(row.avatar);
          setYourAvatar(avatar.emoji);
          setYourAvatarId(avatar.id);
        }
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

  const applyDuelDamage = useCallback((target: "you" | "opponent", amount: number) => {
    if (!isDuelMode || statusRef.current !== "playing") {
      return;
    }

    const previous = hpRef.current;
    const nextValue = Math.max(0, previous[target] - amount);
    const nextHp = { ...previous, [target]: nextValue };
    hpRef.current = nextHp;
    setHp(nextHp);

    if (nextValue <= 0) {
      const forcedResult = target === "you" ? "loss" : "win";
      setEliminated((current) => ({ ...current, [target]: true }));
      eliminatedRef.current = { ...eliminatedRef.current, [target]: true };
      finishGame(forcedResult);
    }
  }, [finishGame, isDuelMode]);

  // ---------------------------------------------------------------------------
  // Independent question progression:
  // - Your correct answer advances ONLY your question.
  // - AI scores advance ONLY AI internally (no player prompt change).
  // ---------------------------------------------------------------------------
  const spawnPlayerQuestion = useCallback(() => {
    if (statusRef.current !== "playing") return;
    if (eliminatedRef.current.you) return;

    const { question, answer: correctAnswer, questionData } = generateQuestion(topic, difficulty);
    currentAnswerRef.current = correctAnswer;
    currentQuestionDataRef.current = questionData;
    setCurrentQuestion(question);
    setCurrentQuestionData(questionData);
    setAnswer("");
  }, [difficulty, topic]);

  const scheduleAiAttempt = useCallback(() => {
    if (statusRef.current !== "playing") return;
    if (eliminatedRef.current.opponent) return;

    const profile = getAiProfile(difficulty);
    const delay = profile.minMs + Math.random() * (profile.maxMs - profile.minMs);

    if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);

    aiTimeoutRef.current = setTimeout(() => {
      if (statusRef.current !== "playing") return;
      if (eliminatedRef.current.opponent) return;

      // AI gets its own independent generated question (not rendered to player).
      generateQuestion(topic, difficulty);
      const willScore = Math.random() < profile.accuracy;

      if (willScore) {
        triggerScoreGlow("opponent");
        triggerEndgameScoreImpact("opponent");
        const prev = feedbackRef.current;
        const newStreak = prev.opponentStreak + 1;
        const botAvatar = getAvatar(botAvatarIdRef.current);
        const botUltimateType = botAvatar.ultimateId as BotUltimateId;
        const botUltimateActive = botUltimateActiveUntilRef.current > Date.now();
        let pointsAwarded = 1;

        if (botUltimateActive) {
          if (botUltimateType === "rapid_fire" || botUltimateType === "double" || botUltimateType === "overpower") {
            pointsAwarded += 1;
          }

          if (botUltimateType === "perfect_sequence") {
            const nextSequence = botArchitectSequenceRef.current + 1;
            if (nextSequence >= 3) {
              pointsAwarded += 2;
              botArchitectSequenceRef.current = 0;
              setBotArchitectSequence(0);
              soundManager.play("fast");
            } else {
              botArchitectSequenceRef.current = nextSequence;
              setBotArchitectSequence(nextSequence);
            }
          }
        }

        setScores((s) => ({ ...s, opponent: s.opponent + pointsAwarded }));
        if (yourShieldedHitRef.current) {
          yourShieldedHitRef.current = false;
          setYourShieldedHit(false);
          soundManager.play("shieldBlock");
        } else {
          applyDuelDamage("you", DUEL_CORRECT_DAMAGE * pointsAwarded);
        }
        setFeedback((f) => ({
          ...f,
          opponentStreak: newStreak,
          opponentPulseKey: f.opponentPulseKey + 1,
        }));
        if (isDuelMode) {
          increaseBotUltimateCharge(
            BOT_ULTIMATE_CORRECT_CHARGE + (newStreak >= 3 ? BOT_ULTIMATE_STREAK_BONUS_CHARGE : 0)
          );
        }

        if (newStreak >= 3 && newStreak > prev.opponentStreak) {
          soundManager.play("streak");
        } else {
          soundManager.play("correct");
        }

        scheduleAiAttempt();
        return;
      }

      if (botShieldedMissRef.current) {
        botShieldedMissRef.current = false;
        setBotShieldedMiss(false);
        scheduleAiAttempt();
        return;
      }

      setBotArchitectSequence(0);
      botArchitectSequenceRef.current = 0;
      setFeedback((f) => ({ ...f, opponentStreak: 0 }));
      // AI "mistakes" only reset streak; we don't show strikes in UI anymore.
      scheduleAiAttempt();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyDuelDamage, difficulty, increaseBotUltimateCharge, isDuelMode, topic, triggerEndgameScoreImpact, triggerScoreGlow]);

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
    setEliminated({ you: false, opponent: false });
    eliminatedRef.current = { you: false, opponent: false };
    setFeedback(initialFeedback);
    feedbackRef.current = initialFeedback;
    setHp({ you: DUEL_MAX_HP, opponent: DUEL_MAX_HP });
    hpRef.current = { you: DUEL_MAX_HP, opponent: DUEL_MAX_HP };
    setEmoteBarOpen(false);
    setEmoteCooldownUntil(0);
    setEmoteLabels([]);
    setYourUltimateCharge(0);
    yourUltimateChargeRef.current = 0;
    setYourUltimateActiveUntil(0);
    yourUltimateActiveUntilRef.current = 0;
    setYourUltimateUsed(false);
    yourUltimateUsedRef.current = false;
    setYourArchitectSequence(0);
    yourArchitectSequenceRef.current = 0;
    setYourShieldedHit(false);
    yourShieldedHitRef.current = false;
    const nextBotAvatarId = getRandomBotAvatarId();
    setBotAvatarId(nextBotAvatarId);
    botAvatarIdRef.current = nextBotAvatarId;
    setBotUltimateCharge(0);
    botUltimateChargeRef.current = 0;
    setBotUltimateActiveUntil(0);
    botUltimateActiveUntilRef.current = 0;
    setBotUltimateUsed(false);
    botUltimateUsedRef.current = false;
    setBotUltimateActivationKey(0);
    setBotArchitectSequence(0);
    botArchitectSequenceRef.current = 0;
    setBotShieldedMiss(false);
    botShieldedMissRef.current = false;
    setPlayerInputLockedUntil(0);
    playerInputLockedUntilRef.current = 0;
    setCurrentQuestion("");
    setCurrentQuestionData(null);
    currentQuestionDataRef.current = null;
    setAnswer("");
    setGameResult(null);
    setIsFinalPhase(false);
    setScoreImpactKey({ you: 0, opponent: 0 });
    setClutchMoment({ key: 0, side: null });
    finalPhaseTriggeredRef.current = false;
    finalSecondTickRef.current = null;
    secondsRef.current = matchDurationSeconds;
    setSecondsLeft(matchDurationSeconds);
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

          spawnPlayerQuestion();
          scheduleAiAttempt();
        }, 700);
      }
    };

    countdownStepTimeoutRef.current = setTimeout(tick, 400);
  }, [clearTimers, finishGame, matchDurationSeconds, scheduleAiAttempt, spawnPlayerQuestion]);

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

  useEffect(() => {
    if (!playerInputLockedUntil) return;
    const ms = playerInputLockedUntil - Date.now();
    if (ms <= 0) {
      setPlayerInputLockedUntil(0);
      return;
    }

    const id = window.setTimeout(() => setPlayerInputLockedUntil(0), ms + 25);
    return () => window.clearTimeout(id);
  }, [playerInputLockedUntil]);

  // ---------------------------------------------------------------------------
  // Player submits an answer
  // ---------------------------------------------------------------------------
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || status !== "playing" || eliminatedRef.current.you) return;
    if (playerInputLockedUntilRef.current > Date.now()) return;

    const correct = currentQuestionDataRef.current
      ? Boolean(isSharedCorrectAnswer(trimmed, currentQuestionDataRef.current))
      : trimmed.toLowerCase() === currentAnswerRef.current.toLowerCase();

    if (correct) {
      triggerScoreGlow("you");
      triggerEndgameScoreImpact("you");
      const prev = feedbackRef.current;
      const newStreak = prev.youStreak + 1;
      const yourAvatar = getAvatar(yourAvatarIdRef.current);
      const yourUltimateType = yourAvatar.ultimateId as BotUltimateId;
      const yourUltimateActive = yourUltimateActiveUntilRef.current > Date.now();
      let pointsAwarded = 1;

      if (yourUltimateActive) {
        if (yourUltimateType === "rapid_fire" || yourUltimateType === "double" || yourUltimateType === "overpower") {
          pointsAwarded += 1;
        }

        if (yourUltimateType === "perfect_sequence") {
          const nextSequence = yourArchitectSequenceRef.current + 1;
          if (nextSequence >= 3) {
            pointsAwarded += 2;
            yourArchitectSequenceRef.current = 0;
            setYourArchitectSequence(0);
            soundManager.play("fast");
          } else {
            yourArchitectSequenceRef.current = nextSequence;
            setYourArchitectSequence(nextSequence);
          }
        }
      }

      setScores((s) => ({ ...s, you: s.you + pointsAwarded }));
      applyDuelDamage("opponent", DUEL_CORRECT_DAMAGE * pointsAwarded);
      setFeedback((f) => ({
        ...f,
        youStreak: newStreak,
        youPulseKey: f.youPulseKey + 1,
      }));
      increaseYourUltimateCharge(
        BOT_ULTIMATE_CORRECT_CHARGE + (newStreak >= 3 ? BOT_ULTIMATE_STREAK_BONUS_CHARGE : 0)
      );

      if (newStreak >= 3 && newStreak > prev.youStreak) {
        soundManager.play("streak");
      } else {
        soundManager.play("correct");
      }

      spawnPlayerQuestion();
    } else {
      soundManager.play("wrong");
      if (feedbackRef.current.youStreak >= 2) triggerStreakBroken();
      setYourArchitectSequence(0);
      yourArchitectSequenceRef.current = 0;
      setFeedback((f) => ({ ...f, youStreak: 0 }));
      setMistakes((previous) => ({ ...previous, you: previous.you + 1 }));
      setAnswer("");
    }
  };

  const handleSkipQuestion = () => {
    if (!isDuelMode || statusRef.current !== "playing" || eliminatedRef.current.you) {
      return;
    }
    if (playerInputLockedUntilRef.current > Date.now()) {
      return;
    }

    soundManager.play("wrong");
    setFeedback((f) => ({ ...f, youStreak: 0 }));
    applyDuelDamage("you", DUEL_SKIP_DAMAGE);
    spawnPlayerQuestion();
  };

  const handleOptionSubmit = (option: string) => {
    if (status !== "playing" || eliminatedRef.current.you) return;
    if (playerInputLockedUntilRef.current > Date.now()) return;

    const correct = currentQuestionDataRef.current
      ? Boolean(isSharedCorrectAnswer(option, currentQuestionDataRef.current))
      : option.toLowerCase() === currentAnswerRef.current.toLowerCase();

    if (correct) {
      triggerScoreGlow("you");
      triggerEndgameScoreImpact("you");
      const prev = feedbackRef.current;
      const newStreak = prev.youStreak + 1;
      const yourAvatar = getAvatar(yourAvatarIdRef.current);
      const yourUltimateType = yourAvatar.ultimateId as BotUltimateId;
      const yourUltimateActive = yourUltimateActiveUntilRef.current > Date.now();
      let pointsAwarded = 1;

      if (yourUltimateActive) {
        if (yourUltimateType === "rapid_fire" || yourUltimateType === "double" || yourUltimateType === "overpower") {
          pointsAwarded += 1;
        }

        if (yourUltimateType === "perfect_sequence") {
          const nextSequence = yourArchitectSequenceRef.current + 1;
          if (nextSequence >= 3) {
            pointsAwarded += 2;
            yourArchitectSequenceRef.current = 0;
            setYourArchitectSequence(0);
            soundManager.play("fast");
          } else {
            yourArchitectSequenceRef.current = nextSequence;
            setYourArchitectSequence(nextSequence);
          }
        }
      }

      setScores((s) => ({ ...s, you: s.you + pointsAwarded }));
      applyDuelDamage("opponent", DUEL_CORRECT_DAMAGE * pointsAwarded);
      setFeedback((f) => ({
        ...f,
        youStreak: newStreak,
        youPulseKey: f.youPulseKey + 1,
      }));
      increaseYourUltimateCharge(
        BOT_ULTIMATE_CORRECT_CHARGE + (newStreak >= 3 ? BOT_ULTIMATE_STREAK_BONUS_CHARGE : 0)
      );
      soundManager.play(newStreak >= 3 && newStreak > prev.youStreak ? "streak" : "correct");
      spawnPlayerQuestion();
      return;
    }

    soundManager.play("wrong");
    if (feedbackRef.current.youStreak >= 2) triggerStreakBroken();
    setYourArchitectSequence(0);
    yourArchitectSequenceRef.current = 0;
    setFeedback((f) => ({ ...f, youStreak: 0 }));
    setMistakes((previous) => ({ ...previous, you: previous.you + 1 }));
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
  const yourAvatarData = getAvatar(yourAvatarId);
  const yourUltimateType = yourAvatarData.ultimateId as BotUltimateId;
  const yourUltimateActive = yourUltimateActiveUntil > Date.now();
  const yourUltimateSecondsLeft = yourUltimateActive
    ? Math.max(0, Math.ceil((yourUltimateActiveUntil - Date.now()) / 1000))
    : 0;
  const canUseYourUltimate =
    isDuelMode &&
    isPlaying &&
    yourUltimateCharge >= BOT_ULTIMATE_MAX_CHARGE &&
    !yourUltimateUsed &&
    !youEliminated;
  const botAvatar = getAvatar(botAvatarId);
  const botUltimateType = botAvatar.ultimateId as BotUltimateId;
  const botUltimateActive = botUltimateActiveUntil > Date.now();
  const botUltimateSecondsLeft = botUltimateActive
    ? Math.max(0, Math.ceil((botUltimateActiveUntil - Date.now()) / 1000))
    : 0;
  const isPlayerInputLocked = playerInputLockedUntil > Date.now();
  const displayHp = {
    you: Math.round((Math.max(0, hp.you) / DUEL_MAX_HP) * DUEL_DISPLAY_MAX_HP),
    opponent: Math.round((Math.max(0, hp.opponent) / DUEL_MAX_HP) * DUEL_DISPLAY_MAX_HP)
  };
  const availableEmotes = EMOTES.filter((emote) => emote.pack === "starter").slice(0, 4);
  const emoteCoolingDown = emoteCooldownUntil > Date.now();
  const youEmoteItems = emoteLabels.filter((item) => item.who === "you");
  const opponentEmoteItems = emoteLabels.filter((item) => item.who === "opponent");

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
  if (isDuelMode && !isFinished) {
    return (
      <section className="fixed inset-0 z-10 bg-slate-950 text-white">
        <GameOverOverlay result={null} />
        <div className="pointer-events-none absolute left-0 right-0 top-16 z-30 flex items-start justify-between gap-3 px-3 sm:px-5">
          <div className="relative h-14 w-[46%] max-w-sm">
            <EmoteDisplay items={youEmoteItems} />
          </div>
          <div className="relative h-14 w-[46%] max-w-sm">
            <EmoteDisplay items={opponentEmoteItems} />
          </div>
        </div>

        <div className="flex h-[100dvh] flex-col overflow-hidden">
          <div className="shrink-0 border-b border-white/10 bg-slate-950/90 px-3 pb-2 pt-2.5 backdrop-blur sm:px-5 sm:pb-2.5 sm:pt-3">
            <div className="relative rounded-[1.55rem] border border-white/10 bg-slate-950/72 p-2 shadow-[0_18px_44px_rgba(2,6,23,0.5)] sm:p-3">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[1.55rem] opacity-70"
                style={{
                  background:
                    "radial-gradient(ellipse at 28% 35%, rgba(56,189,248,0.12) 0%, transparent 56%), radial-gradient(ellipse at 72% 35%, rgba(251,113,133,0.12) 0%, transparent 56%)"
                }}
              />
              <div className="absolute right-2 top-2 z-10 sm:right-3 sm:top-3">
                <SoundToggle
                  muted={muted}
                  onToggle={() => {
                    const next = !muted;
                    soundManager.setMuted(next);
                    setMuted(next);
                  }}
                />
              </div>

              <div className="relative grid items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,1fr)] md:gap-3">
                <MatchChampionCard
                  variant="battle"
                  hp={displayHp.you}
                  maxHp={DUEL_DISPLAY_MAX_HP}
                  model={{
                    side: "you",
                    playerName: yourName,
                    avatarId: yourAvatarId,
                    ultimateType: normalizeUltimateType(yourUltimateType),
                    ultimateName: yourAvatarData.ultimateName,
                    charge: yourUltimateCharge,
                    ready: canUseYourUltimate,
                    used: yourUltimateUsed,
                    implemented: true,
                    overclockUntil: yourUltimateType === "rapid_fire" ? yourUltimateActiveUntil : 0,
                    blackoutUntil: yourUltimateType === "system_corrupt" ? yourUltimateActiveUntil : 0,
                    shadowCorruptUntil: yourUltimateType === "system_corrupt" ? yourUltimateActiveUntil : 0,
                    shadowCorruptStacks: yourUltimateSecondsLeft,
                    architectUntil: yourUltimateType === "perfect_sequence" ? yourUltimateActiveUntil : 0,
                    architectSequenceStreak: yourArchitectSequence,
                    fortressUntil: yourUltimateType === "shield" ? yourUltimateActiveUntil : 0,
                    fortressBlocksRemaining: yourShieldedHit ? 1 : 0,
                    infernoPending: yourUltimateType === "double" && yourUltimateActive,
                    infernoPendingUntil: yourUltimateType === "double" ? yourUltimateActiveUntil : 0,
                    infernoStacks: yourUltimateActive && yourUltimateType === "double" ? Math.min(6, feedback.youStreak) : 0,
                    flashOverclockStacks: yourUltimateActive && yourUltimateType === "rapid_fire" ? Math.min(8, feedback.youStreak) : 0,
                    ultimateQuestionsLeft: yourUltimateSecondsLeft
                  }}
                />

                <div className="flex min-h-[3.1rem] items-center justify-center md:min-h-full">
                  <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/88 px-2.5 py-1.5 text-center sm:px-3 sm:py-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-textSecondary">Duel</p>
                    <div className="mt-1 flex items-baseline justify-center gap-2">
                      <span className="text-xl font-black tabular-nums text-sky-200 sm:text-3xl">{scores.you}</span>
                      <span className="text-[10px] font-black uppercase tracking-[0.34em] text-textSecondary sm:text-xs">VS</span>
                      <span className="text-xl font-black tabular-nums text-rose-200 sm:text-3xl">{scores.opponent}</span>
                    </div>
                    <div className="mt-1 inline-flex rounded-full border border-slate-800 bg-slate-900/85 px-3 py-1 text-[10px] font-black tracking-[0.24em] text-sky-200 sm:mt-1.5 sm:text-xs">
                      {timerLabel}
                    </div>
                  </div>
                </div>

                <MatchChampionCard
                  variant="battle"
                  hp={displayHp.opponent}
                  maxHp={DUEL_DISPLAY_MAX_HP}
                  model={{
                    side: "opponent",
                    playerName: BOT_NAME,
                    avatarId: botAvatarId,
                    ultimateType: normalizeUltimateType(botUltimateType),
                    ultimateName: botAvatar.ultimateName,
                    charge: botUltimateCharge,
                    ready: botUltimateCharge >= BOT_ULTIMATE_MAX_CHARGE && !botUltimateUsed,
                    used: botUltimateUsed,
                    implemented: true,
                    overclockUntil: botUltimateType === "rapid_fire" ? botUltimateActiveUntil : 0,
                    blackoutUntil: botUltimateType === "system_corrupt" ? botUltimateActiveUntil : 0,
                    shadowCorruptUntil: botUltimateType === "system_corrupt" ? botUltimateActiveUntil : 0,
                    shadowCorruptStacks: botUltimateSecondsLeft,
                    architectUntil: botUltimateType === "perfect_sequence" ? botUltimateActiveUntil : 0,
                    architectSequenceStreak: botArchitectSequence,
                    fortressUntil: botUltimateType === "shield" ? botUltimateActiveUntil : 0,
                    fortressBlocksRemaining: botShieldedMiss ? 1 : 0,
                    infernoPending: botUltimateType === "double" && botUltimateActive,
                    infernoPendingUntil: botUltimateType === "double" ? botUltimateActiveUntil : 0,
                    infernoStacks: botUltimateActive && botUltimateType === "double" ? Math.min(6, feedback.opponentStreak) : 0,
                    flashOverclockStacks: botUltimateActive && botUltimateType === "rapid_fire" ? Math.min(8, feedback.opponentStreak) : 0,
                    ultimateQuestionsLeft: botUltimateSecondsLeft
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-stretch justify-start px-3 py-3 sm:px-5 sm:py-4 md:justify-center md:py-10">
            <motion.div animate={animState.questionShakeControls} className="mx-auto w-full max-w-3xl md:max-w-4xl lg:max-w-5xl">
              <div className="relative rounded-[1.5rem] border border-slate-800 bg-slate-900/70 p-3 text-center sm:p-6 md:p-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-textSecondary">
                  {isCountdown ? "Countdown" : "Question"}
                </p>
                <div className="mt-3 flex min-h-[4.5rem] items-center justify-center sm:min-h-[6rem]">
                  {isCountdown ? (
                    <CountdownDisplay value={countdownValue} />
                  ) : (
                    <QuestionContent
                      question={currentQuestionData}
                      fallbackPrompt={currentQuestion}
                      compact
                      promptClassName="text-xl font-black tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl"
                    />
                  )}
                </div>
                <div className="mt-3 min-h-[2.25rem]">
                  {isPlayerInputLocked ? (
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-200">Neural Jam - Inputs Locked</p>
                  ) : canUseYourUltimate ? (
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Ultimate Ready</p>
                  ) : null}
                </div>
              </div>
            </motion.div>
          </div>

          <div className="shrink-0 border-t border-white/10 bg-slate-950/90 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 backdrop-blur sm:px-5">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-2 flex items-center justify-start sm:justify-center">
                <EmoteBar
                  emotes={availableEmotes}
                  open={emoteBarOpen}
                  onToggle={() => setEmoteBarOpen((open) => !open)}
                  onSend={handleSendEmote}
                  coolingDown={emoteCoolingDown}
                  cooldownUntil={emoteCooldownUntil}
                  disabled={!isPlaying}
                />
              </div>

              {isPlaying ? (
                <form className="flex w-full flex-col gap-2" onSubmit={handleSubmit}>
                  <WorkingScratchpad answerInputLocked={isPlayerInputLocked} />
                  {Array.isArray(currentQuestionData?.options) && currentQuestionData.options.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {currentQuestionData.options.map((option, idx) => (
                        <Button
                          key={`${option}-${idx}`}
                          type="button"
                          variant="secondary"
                          className="relative min-h-[2.75rem] w-full justify-start text-left text-sm"
                          disabled={isPlayerInputLocked || youEliminated}
                          onClick={() => handleOptionSubmit(option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : null}

                  {!(Array.isArray(currentQuestionData?.options) && currentQuestionData.options.length > 0) ? (
                    <div className="flex items-stretch gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={answer}
                        onChange={(event) => setAnswer(event.target.value)}
                        placeholder={
                          isPlayerInputLocked
                            ? "Neural jam - inputs unlock shortly..."
                            : youEliminated
                              ? "Eliminated"
                              : currentQuestionData?.inputMode === "text"
                                ? "Type text or symbol answer..."
                                : "Type answer..."
                        }
                        disabled={isPlayerInputLocked || youEliminated}
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="go"
                        className="neon-input h-12 min-w-0 flex-1 rounded-2xl px-4 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <Button className="h-12 w-[7.5rem] shrink-0" type="submit" disabled={!answer.trim() || isPlayerInputLocked || youEliminated}>
                        Submit
                      </Button>
                    </div>
                  ) : null}

                  <Button
                    type="button"
                    variant="secondary"
                    className="h-10 w-fit self-end rounded-xl border-amber-300/35 bg-amber-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-amber-100 hover:border-amber-200/60 hover:bg-amber-400/15"
                    disabled={youEliminated || isPlayerInputLocked}
                    aria-label="Skip question and lose HP"
                    onClick={handleSkipQuestion}
                  >
                    Skip question
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-[2.75rem] w-full border-slate-700/80 bg-slate-950/70 text-left"
                    disabled={!canUseYourUltimate}
                    onClick={() => activateYourUltimate()}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>
                        <span className="block text-[11px] font-black uppercase tracking-[0.18em]">{yourAvatarData.ultimateName}</span>
                        <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                          {yourUltimateUsed ? "Used" : canUseYourUltimate ? "Ready" : `${Math.round(yourUltimateCharge)}% charged`}
                        </span>
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-300">
                        {canUseYourUltimate ? "Use" : yourUltimateUsed ? "Used" : "Charging"}
                      </span>
                    </span>
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="neon-panel-strong relative mx-auto w-full min-w-0 max-w-4xl rounded-2xl p-4 sm:rounded-[2rem] sm:p-6 md:p-10">
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
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-cyan-200">
            <span>Topic: {topicLabel}</span>
            <span>Difficulty: {difficultyLabel}</span>
            <span className={showFinalPhase ? "text-rose-300" : undefined}>Time: {timerLabel}</span>
            <span className="rounded-full border border-purple-300/40 bg-purple-500/12 px-2 py-0.5 text-purple-200">
              {isDuelMode ? "AI Duel" : "Practice"}
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">
            {isCountdown ? "Match Starting" : isPlaying ? (isDuelMode ? "AI Duel" : "Practice Mode") : "Game Over"}
          </h1>
          <p className="text-sm text-textSecondary sm:text-base">
            {isCountdown
              ? "Get ready. The round starts in a moment."
              : isPlaying
              ? isDuelMode
                ? "Fight MathBot with the same PvP-style tools."
                : "No avatars, no HP, no rating. Get the most correct answers in 60 seconds."
              : "This round is complete."}
          </p>
        </div>

        {/* PvP-style champion HUD */}
        {isDuelMode ? (
        <div className="relative rounded-[1.55rem] border border-white/10 bg-slate-950/72 p-2 shadow-[0_18px_44px_rgba(2,6,23,0.5)] sm:p-3">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[1.55rem] opacity-70"
            style={{
              background:
                "radial-gradient(ellipse at 28% 35%, rgba(56,189,248,0.12) 0%, transparent 56%), radial-gradient(ellipse at 72% 35%, rgba(251,113,133,0.12) 0%, transparent 56%)"
            }}
          />

          <div className="relative grid items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_8.5rem_minmax(0,1fr)] md:gap-3">
            <div className="relative">
              <MatchChampionCard
                variant="battle"
                hp={displayHp.you}
                maxHp={DUEL_DISPLAY_MAX_HP}
                model={{
                  side: "you",
                  playerName: yourName,
                  avatarId: yourAvatarId,
                  ultimateType: normalizeUltimateType(yourUltimateType),
                  ultimateName: yourAvatarData.ultimateName,
                  charge: yourUltimateCharge,
                  ready: canUseYourUltimate,
                  used: yourUltimateUsed,
                  implemented: true,
                  overclockUntil: yourUltimateType === "rapid_fire" ? yourUltimateActiveUntil : 0,
                  blackoutUntil: yourUltimateType === "system_corrupt" ? yourUltimateActiveUntil : 0,
                  shadowCorruptUntil: yourUltimateType === "system_corrupt" ? yourUltimateActiveUntil : 0,
                  shadowCorruptStacks: yourUltimateSecondsLeft,
                  architectUntil: yourUltimateType === "perfect_sequence" ? yourUltimateActiveUntil : 0,
                  architectMarks: 0,
                  architectSequenceStreak: yourArchitectSequence,
                  fortressUntil: yourUltimateType === "shield" ? yourUltimateActiveUntil : 0,
                  fortressBlocksRemaining: yourShieldedHit ? 1 : 0,
                  infernoPending: yourUltimateType === "double" && yourUltimateActive,
                  infernoPendingUntil: yourUltimateType === "double" ? yourUltimateActiveUntil : 0,
                  infernoStacks: yourUltimateActive && yourUltimateType === "double" ? Math.min(6, feedback.youStreak) : 0,
                  flashOverclockStacks: yourUltimateActive && yourUltimateType === "rapid_fire" ? Math.min(8, feedback.youStreak) : 0,
                  ultimateQuestionsLeft: yourUltimateSecondsLeft
                }}
              />
              <EmoteDisplay items={youEmoteItems} />
              <FloatingLabel items={youFloatingItems} />
            </div>

            <div className="flex min-h-[3.1rem] items-center justify-center md:min-h-full">
              <div className="w-full rounded-2xl border border-slate-800 bg-slate-950/88 px-2.5 py-1.5 text-center sm:px-3 sm:py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-textSecondary">Duel</p>
                <div className="mt-1 flex items-baseline justify-center gap-2">
                  <span className="text-xl font-black tabular-nums text-sky-200 sm:text-3xl">{scores.you}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.34em] text-textSecondary sm:text-xs">VS</span>
                  <span className="text-xl font-black tabular-nums text-rose-200 sm:text-3xl">{scores.opponent}</span>
                </div>
                <div className="mt-1 inline-flex rounded-full border border-slate-800 bg-slate-900/85 px-3 py-1 text-[10px] font-black tracking-[0.24em] text-sky-200 sm:mt-1.5 sm:text-xs">
                  {timerLabel}
                </div>
              </div>
            </div>

            <div className="relative">
              <MatchChampionCard
                variant="battle"
                hp={displayHp.opponent}
                maxHp={DUEL_DISPLAY_MAX_HP}
                model={{
                  side: "opponent",
                  playerName: BOT_NAME,
                  avatarId: botAvatarId,
                  ultimateType: normalizeUltimateType(botUltimateType),
                  ultimateName: botAvatar.ultimateName,
                  charge: botUltimateCharge,
                  ready: botUltimateCharge >= BOT_ULTIMATE_MAX_CHARGE && !botUltimateUsed,
                  used: botUltimateUsed,
                  implemented: true,
                  overclockUntil: botUltimateType === "rapid_fire" ? botUltimateActiveUntil : 0,
                  blackoutUntil: botUltimateType === "system_corrupt" ? botUltimateActiveUntil : 0,
                  shadowCorruptUntil: botUltimateType === "system_corrupt" ? botUltimateActiveUntil : 0,
                  shadowCorruptStacks: botUltimateSecondsLeft,
                  architectUntil: botUltimateType === "perfect_sequence" ? botUltimateActiveUntil : 0,
                  architectMarks: 0,
                  architectSequenceStreak: botArchitectSequence,
                  fortressUntil: botUltimateType === "shield" ? botUltimateActiveUntil : 0,
                  fortressBlocksRemaining: botShieldedMiss ? 1 : 0,
                  infernoPending: botUltimateType === "double" && botUltimateActive,
                  infernoPendingUntil: botUltimateType === "double" ? botUltimateActiveUntil : 0,
                  infernoStacks: botUltimateActive && botUltimateType === "double" ? Math.min(6, feedback.opponentStreak) : 0,
                  flashOverclockStacks: botUltimateActive && botUltimateType === "rapid_fire" ? Math.min(8, feedback.opponentStreak) : 0,
                  ultimateQuestionsLeft: botUltimateSecondsLeft
                }}
              />
              <EmoteDisplay items={opponentEmoteItems} />
              <FloatingLabel items={opponentFloatingItems} />
            </div>
          </div>
        </div>
        ) : (
          <div className="grid gap-3 rounded-[1.55rem] border border-white/10 bg-slate-950/72 p-4 shadow-[0_18px_44px_rgba(2,6,23,0.42)] sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:p-5">
            <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-sky-200">You</p>
              <p className="mt-2 text-4xl font-black tabular-nums text-white">{scores.you}</p>
            </div>
            <div className="text-center text-[10px] font-black uppercase tracking-[0.34em] text-slate-500">
              60s Score Race
            </div>
            <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-rose-200">{BOT_NAME}</p>
              <p className="mt-2 text-4xl font-black tabular-nums text-white">{scores.opponent}</p>
            </div>
          </div>
        )}

        {/* Question card / countdown / game-over panel */}
        {!isFinished ? (
          <>
            <div className="neon-panel relative rounded-[1.75rem] p-4 text-center sm:p-6">
              {isPlaying && (
                <motion.div
                  className={`absolute right-3 top-3 rounded-full border px-2 py-1 text-sm font-black tracking-[0.15em] sm:right-5 sm:top-5 sm:px-4 sm:py-2 sm:text-lg sm:tracking-[0.2em] ${
                    showFinalPhase
                      ? "border-rose-400/70 bg-rose-950/70 text-rose-100 shadow-[0_0_18px_rgba(248,113,113,0.35)]"
                        : "border-indigo-300/30 bg-slate-950/82 text-cyan-100"
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

              <p className={`text-sm uppercase tracking-[0.3em] text-textSecondary ${isPlaying ? "pr-14 sm:pr-0" : ""}`}>
                {isCountdown ? "Countdown" : "Current Question"}
              </p>

              {isCountdown ? (
                <CountdownDisplay value={countdownValue} />
              ) : (
                <div className="mt-3 sm:mt-4">
                  <QuestionContent
                    question={currentQuestionData}
                    fallbackPrompt={currentQuestion}
                    compact
                    promptClassName="text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl"
                  />
                </div>
              )}
            </div>

            {isPlaying && (
              <form className="space-y-3" onSubmit={handleSubmit}>
                {isDuelMode ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <EmoteBar
                      emotes={availableEmotes}
                      open={emoteBarOpen}
                      onToggle={() => setEmoteBarOpen((open) => !open)}
                      onSend={handleSendEmote}
                      coolingDown={emoteCoolingDown}
                      cooldownUntil={emoteCooldownUntil}
                      disabled={!isPlaying}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 rounded-xl border-cyan-300/35 bg-cyan-400/10 px-4 text-xs font-black uppercase tracking-[0.16em] text-cyan-100 hover:border-cyan-200/60 hover:bg-cyan-400/15"
                      disabled={!canUseYourUltimate}
                      onClick={() => activateYourUltimate()}
                    >
                      {yourUltimateUsed ? "Ultimate used" : canUseYourUltimate ? "Use ultimate" : `Ultimate ${Math.round(yourUltimateCharge)}%`}
                    </Button>
                  </div>
                ) : null}
                <WorkingScratchpad answerInputLocked={isPlayerInputLocked} />
                <label className="block space-y-2">
                  <span className="text-sm font-medium uppercase tracking-[0.2em] text-textSecondary">
                    Your Answer
                  </span>
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder={
                      youEliminated
                        ? "Eliminated"
                        : isPlayerInputLocked
                          ? `${BOT_NAME}'s ${botAvatar.ultimateName} is jamming input...`
                        : currentQuestionData?.inputMode === "text"
                          ? "Type text or symbol answer"
                          : "Type your answer and press Enter"
                    }
                    autoComplete="off"
                    disabled={youEliminated || isPlayerInputLocked}
                    className="neon-input w-full rounded-2xl px-4 py-4 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="h-12 flex-1" type="submit" disabled={!answer.trim() || youEliminated || isPlayerInputLocked}>
                    Submit Answer
                  </Button>
                  {isDuelMode ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 shrink-0 rounded-xl border-amber-300/35 bg-amber-400/10 px-4 text-xs font-black uppercase tracking-[0.16em] text-amber-100 hover:border-amber-200/60 hover:bg-amber-400/15 sm:w-[9.5rem]"
                      disabled={youEliminated || isPlayerInputLocked}
                      aria-label="Skip question and lose HP"
                      onClick={handleSkipQuestion}
                    >
                      Skip question
                    </Button>
                  ) : null}
                </div>
                {!isDuelMode ? (
                  <p className="text-center text-xs uppercase tracking-[0.2em] text-textSecondary">
                    Mistakes: {mistakes.you}
                  </p>
                ) : null}
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
                  onClick={() => router.push("/play?mode=ai")}
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

