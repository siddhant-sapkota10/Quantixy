"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { PlayerPanel } from "@/components/player-panel";
import { PowerUpSlot } from "@/components/power-up-slot";
import { SoundToggle } from "@/components/sound-toggle";
import { getSupabaseClient } from "@/lib/supabase";
import { createGameSocket, type GameSocket } from "@/lib/socket";
import { soundManager } from "@/lib/sounds";
import { formatTopicLabel, getSafeDifficulty, getSafeTopic } from "@/lib/topics";
import { getAvatar } from "@/lib/avatars";
import { EMOTES, getEmoteById } from "@/lib/emotes";
import { useGameAnimations } from "@/hooks/useGameAnimations";
import { FrostBurst } from "@/components/animations/FrostBurst";
import { FloatingLabel } from "@/components/animations/FloatingLabel";
import { CountdownDisplay } from "@/components/animations/CountdownDisplay";
import { GameOverOverlay } from "@/components/animations/GameOverOverlay";
import { SnowfallOverlay } from "@/components/animations/SnowfallOverlay";

type GameStatus = "connecting" | "waiting" | "countdown" | "playing" | "finished" | "opponent-left" | "failed";

type ScoreState = {
  you: number;
  opponent: number;
};

type RatingState = {
  you: number;
  opponent: number;
};

type TimerState = {
  secondsLeft: number;
};

type FeedbackState = {
  youStreak: number;
  opponentStreak: number;
  youFast: boolean;
  opponentFast: boolean;
  youPulseKey: number;
  opponentPulseKey: number;
  youPowerUpAvailable: "freeze" | "shield" | null;
  opponentPowerUpAvailable: "freeze" | "shield" | null;
  youShieldActive: boolean;
  opponentShieldActive: boolean;
};

const initialScores: ScoreState = {
  you: 0,
  opponent: 0
};

const initialRatings: RatingState = {
  you: 1000,
  opponent: 1000
};

const initialTimer: TimerState = {
  secondsLeft: 60
};

const initialFeedback: FeedbackState = {
  youStreak: 0,
  opponentStreak: 0,
  youFast: false,
  opponentFast: false,
  youPulseKey: 0,
  opponentPulseKey: 0,
  youPowerUpAvailable: null,
  opponentPowerUpAvailable: null,
  youShieldActive: false,
  opponentShieldActive: false
};

const statusHeading: Record<GameStatus, string> = {
  connecting: "Connecting...",
  waiting: "Waiting for opponent...",
  countdown: "Match found",
  playing: "In game",
  finished: "Game over",
  "opponent-left": "Opponent left the game",
  failed: "Connection Failed"
};

const statusCopy: Record<GameStatus, string> = {
  connecting: "Connecting you to the multiplayer server.",
  waiting: "You are in queue. We will pair you up as soon as another player joins.",
  countdown: "Get ready. The round starts in a moment.",
  playing: "Answer quickly and keep the score moving.",
  finished: "This round is complete.",
  "opponent-left": "The match ended because the other player disconnected.",
  failed: "Could not reach the multiplayer server. Check your connection and try again."
};

type GameClientProps = {
  initialTopic?: string;
  initialDifficulty?: string;
};

export function GameClient({ initialTopic, initialDifficulty }: GameClientProps) {
  const router = useRouter();
  const topic = getSafeTopic(initialTopic);
  const difficulty = getSafeDifficulty(initialDifficulty);
  const topicLabel = useMemo(() => formatTopicLabel(topic), [topic]);
  const difficultyLabel = useMemo(
    () => difficulty.charAt(0).toUpperCase() + difficulty.slice(1),
    [difficulty]
  );

  const [retryKey, setRetryKey] = useState(0);
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [status, setStatus] = useState<GameStatus>("connecting");
  const [scores, setScores] = useState<ScoreState>(initialScores);
  const [ratings, setRatings] = useState<RatingState>(initialRatings);
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const feedbackRef = useRef(initialFeedback);
  const scoresRef = useRef(initialScores);
  const [currentQuestion, setCurrentQuestion] = useState("Waiting for the first question...");
  const [answer, setAnswer] = useState("");
  const [yourName, setYourName] = useState("You");
  const [opponentName, setOpponentName] = useState("Opponent");
  const [yourAvatar, setYourAvatar] = useState("🦊");
  const [opponentAvatar, setOpponentAvatar] = useState("🦊");
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [frozenUntil, setFrozenUntil] = useState(0);
  const [shieldBlockedUntil, setShieldBlockedUntil] = useState(0);
  const [emoteBarOpen, setEmoteBarOpen] = useState(false);
  const [emoteCooldownUntil, setEmoteCooldownUntil] = useState(0);
  const [emoteLabels, setEmoteLabels] = useState<Array<{ id: number; who: "you" | "opponent"; text: string }>>([]);
  const emoteIdRef = useRef(0);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [muted, setMuted] = useState(false);
  const [gameResult, setGameResult] = useState<{
    result: "win" | "loss" | "draw";
    message: string;
    ratingChange?: RatingState;
    newRatings?: RatingState;
  } | null>(null);

  // Animation hook
  const {
    animState,
    triggerFreezeHit,
    triggerPowerUpActivated,
    triggerShieldBlock,
    triggerPowerUpReady,
    triggerScoreGlow,
    triggerStreakBroken,
  } = useGameAnimations();

  useEffect(() => {
    soundManager.init();
    setMuted(soundManager.isMuted());
  }, []);

  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  useEffect(() => {
    const nextSocket = createGameSocket();
    setSocket(nextSocket);
    console.log("[client] connecting to Socket.io server");
    setStatus("connecting");
    setScores(initialScores);
    setRatings(initialRatings);
    setTimer(initialTimer);
    setFeedback(initialFeedback);
    setCurrentQuestion("Waiting for the first question...");
    setAnswer("");
    setYourName("You");
    setOpponentName("Opponent");
    setYourAvatar("🦊");
    setOpponentAvatar("🦊");
    setCountdownValue(null);
    setFrozenUntil(0);
    setShieldBlockedUntil(0);
    setEmoteBarOpen(false);
    setEmoteCooldownUntil(0);
    setEmoteLabels([]);
    setRematchRequested(false);
    setGameResult(null);

    // Mark connection failed after 20 s if the socket never fires "connect".
    // 20 s gives Render's free tier time to cold-start the server.
    const connectionTimeout = setTimeout(() => {
      if (!nextSocket.connected) {
        console.error("[client] connection timed out after 20 s");
        setStatus("failed");
      }
    }, 20000);

    // Track consecutive connect_error events; flip to "failed" after 3.
    let connectErrorCount = 0;

    const handleConnect = async () => {
      clearTimeout(connectionTimeout);
      connectErrorCount = 0;
      // Log which transport was negotiated (polling or websocket) to help debug.
      console.log(`[client] connected -> id=${nextSocket.id} transport=${nextSocket.io.engine.transport.name}`);
      const supabase = getSupabaseClient();
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        nextSocket.disconnect();
        router.push("/");
        return;
      }

      console.log(`[client] joinQueue emitted -> topic=${topic} difficulty=${difficulty}`);
      setStatus("waiting");
      nextSocket.emit("joinQueue", {
        topic,
        difficulty,
        accessToken: session.access_token
      });
    };

    const handleConnectError = (error: Error) => {
      connectErrorCount++;
      console.error(`[client] socket connect_error (attempt ${connectErrorCount})`, error.message);
      if (connectErrorCount >= 3) {
        setStatus("failed");
      }
    };

    const handleAuthRequired = (payload: { message?: string }) => {
      console.log("[client] authRequired received", payload);
      nextSocket.disconnect();
      router.push("/");
    };

    const handleMatchFound = (payload: {
      yourName?: string;
      opponentName?: string;
      opponent?: { name?: string };
      difficulty?: string;
      yourAvatar?: string;
      opponentAvatar?: string;
      ratings?: {
        you: number;
        opponent: number;
      };
    }) => {
      console.log("[client] matchFound received", payload);
      setYourName(payload.yourName ?? "You");
      setOpponentName(payload.opponentName ?? payload.opponent?.name ?? "Opponent");
      setYourAvatar(getAvatar(payload.yourAvatar).emoji);
      setOpponentAvatar(getAvatar(payload.opponentAvatar).emoji);
      if (payload.ratings) {
        setRatings(payload.ratings);
      }
      setStatus("countdown");
      setCurrentQuestion("");
      setCountdownValue(null);
      setFeedback(initialFeedback);
      setTimer(initialTimer);
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);
      setEmoteCooldownUntil(0);
      setEmoteLabels([]);
      setRematchRequested(false);
      setGameResult(null);
    };

    const handleCountdown = (payload: { value: string }) => {
      console.log("[client] countdown received", payload);
      setStatus("countdown");
      setCurrentQuestion("");
      setAnswer("");
      setCountdownValue(payload.value);
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);

      if (payload.value === "GO") {
        soundManager.play("go");
      } else {
        soundManager.play("tick");
      }
    };

    const handleNewQuestion = (payload: { question?: string } | string) => {
      console.log("[client] newQuestion received", payload);
      const question = typeof payload === "string" ? payload : payload.question;
      setCurrentQuestion(question || "Get ready...");
      setAnswer("");
      setCountdownValue(null);
      setFeedback((previous) => ({
        ...previous,
        youFast: false,
        opponentFast: false
      }));
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);
      setRematchRequested(false);
      setGameResult(null);
      setStatus("playing");
    };

    const handleTimerUpdate = (payload: { secondsLeft: number }) => {
      console.log("[client] timerUpdate received", payload);
      setTimer({
        secondsLeft: payload.secondsLeft
      });
    };

    const pushEmoteLabel = (who: "you" | "opponent", emoteId: string) => {
      const emote = getEmoteById(emoteId);
      const id = ++emoteIdRef.current;

      setEmoteLabels((previous) => [
        ...previous,
        {
          id,
          who,
          text: `${emote.icon} ${emote.label}`
        }
      ]);

      setTimeout(() => {
        setEmoteLabels((previous) => previous.filter((item) => item.id !== id));
      }, 1500);
    };

    const handleIncorrectAnswer = () => {
      console.log("[client] incorrectAnswer received");
      soundManager.play("wrong");
      // Show "Streak Broken" popup if local player had a streak going
      if (feedbackRef.current.youStreak >= 2) {
        triggerStreakBroken();
      }
    };

    const handlePointScored = (payload: {
      scores?: { you?: number; opponent?: number };
      playerScores?: { you?: number; opponent?: number };
      you?: number;
      opponent?: number;
      streak?: number;
      opponentStreak?: number;
      fastAnswer?: boolean;
      opponentFastAnswer?: boolean;
      powerUpAvailable?: "freeze" | "shield" | null;
      opponentPowerUpAvailable?: "freeze" | "shield" | null;
      shieldActive?: boolean;
      opponentShieldActive?: boolean;
    }) => {
      console.log("[client] pointScored received", payload);
      const nextScores = payload.scores ?? payload.playerScores;
      const streakValue = payload.streak ?? 0;
      const opponentStreakValue = payload.opponentStreak ?? 0;
      const previousFeedback = feedbackRef.current;

      // Determine who scored by comparing new values against the previous score
      const prevScores = scoresRef.current;
      const newYouScore = nextScores?.you ?? payload.you ?? 0;
      const newOpponentScore = nextScores?.opponent ?? payload.opponent ?? 0;
      if (newYouScore > prevScores.you) triggerScoreGlow("you");
      if (newOpponentScore > prevScores.opponent) triggerScoreGlow("opponent");

      const nextYouPowerUp = payload.powerUpAvailable ?? previousFeedback.youPowerUpAvailable;
      const nextOpponentPowerUp =
        payload.opponentPowerUpAvailable ?? previousFeedback.opponentPowerUpAvailable;
      const localJustEarnedPowerUp =
        !previousFeedback.youPowerUpAvailable && nextYouPowerUp;
      const opponentJustEarnedPowerUp =
        !previousFeedback.opponentPowerUpAvailable && nextOpponentPowerUp;

      setScores({
        you: newYouScore,
        opponent: newOpponentScore
      });

      setFeedback((previous) => ({
        youStreak: payload.streak ?? 0,
        opponentStreak: payload.opponentStreak ?? 0,
        youFast: payload.fastAnswer ?? false,
        opponentFast: payload.opponentFastAnswer ?? false,
        youPowerUpAvailable: payload.powerUpAvailable ?? previous.youPowerUpAvailable,
        opponentPowerUpAvailable:
          payload.opponentPowerUpAvailable ?? previous.opponentPowerUpAvailable,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive,
        youPulseKey:
          (payload.fastAnswer ?? false) || (payload.streak ?? 0) > previous.youStreak
            ? previous.youPulseKey + 1
            : previous.youPulseKey,
        opponentPulseKey:
          (payload.opponentFastAnswer ?? false) ||
          (payload.opponentStreak ?? 0) > previous.opponentStreak
            ? previous.opponentPulseKey + 1
            : previous.opponentPulseKey
      }));

      if (localJustEarnedPowerUp) {
        triggerPowerUpReady("you", nextYouPowerUp);
        soundManager.play("powerReady");
      }

      if (opponentJustEarnedPowerUp) {
        triggerPowerUpReady("opponent", nextOpponentPowerUp);
      }

      if (payload.fastAnswer) {
        soundManager.play("fast");
      } else if (payload.opponentFastAnswer) {
        soundManager.play("fast");
      }

      if (streakValue >= 3 && streakValue > previousFeedback.youStreak) {
        soundManager.play("streak");
      } else if (opponentStreakValue >= 3 && opponentStreakValue > previousFeedback.opponentStreak) {
        soundManager.play("streak");
      } else {
        soundManager.play("correct");
      }
    };

    const handlePowerUpUsed = (payload: {
      type: "freeze";
      by: "you" | "opponent";
      target: "you" | "opponent";
      durationMs: number;
      powerUpAvailable?: "freeze" | "shield" | null;
      opponentPowerUpAvailable?: "freeze" | "shield" | null;
      shieldActive?: boolean;
      opponentShieldActive?: boolean;
    }) => {
      console.log("[client] powerUpUsed received", payload);
      setFeedback((previous) => ({
        ...previous,
        youPowerUpAvailable: payload.powerUpAvailable ?? previous.youPowerUpAvailable,
        opponentPowerUpAvailable:
          payload.opponentPowerUpAvailable ?? previous.opponentPowerUpAvailable,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive
      }));

      if (payload.target === "you") {
        setFrozenUntil(Date.now() + payload.durationMs);
      }

      // Animate: freeze burst on question card + power-up label on activator's panel
      triggerFreezeHit(payload.target);
      triggerPowerUpActivated(payload.by, payload.type);
      soundManager.play("freezeHit");
    };

    const handleShieldActivated = (payload: {
      by: "you" | "opponent";
      powerUpAvailable?: "freeze" | "shield" | null;
      opponentPowerUpAvailable?: "freeze" | "shield" | null;
      shieldActive?: boolean;
      opponentShieldActive?: boolean;
    }) => {
      console.log("[client] shieldActivated received", payload);
      setFeedback((previous) => ({
        ...previous,
        youPowerUpAvailable: payload.powerUpAvailable ?? previous.youPowerUpAvailable,
        opponentPowerUpAvailable:
          payload.opponentPowerUpAvailable ?? previous.opponentPowerUpAvailable,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive
      }));

      // Animate: power-up glow + floating label on the activating player's panel
      triggerPowerUpActivated(payload.by, "shield");
    };

    const handleShieldBlocked = (payload: {
      by: "you" | "opponent";
      target: "you" | "opponent";
      blockedType: "freeze";
      powerUpAvailable?: "freeze" | "shield" | null;
      opponentPowerUpAvailable?: "freeze" | "shield" | null;
      shieldActive?: boolean;
      opponentShieldActive?: boolean;
    }) => {
      console.log("[client] shieldBlocked received", payload);
      setFeedback((previous) => ({
        ...previous,
        youPowerUpAvailable: payload.powerUpAvailable ?? previous.youPowerUpAvailable,
        opponentPowerUpAvailable:
          payload.opponentPowerUpAvailable ?? previous.opponentPowerUpAvailable,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive
      }));

      if (payload.target === "you") {
        setShieldBlockedUntil(Date.now() + 1800);
      }

      // Animate: flash on blocking player's panel + floating "BLOCKED" label
      triggerShieldBlock(payload.target);
      soundManager.play("shieldBlock");
    };

    const handleEmoteReceived = (payload: {
      emoteId: string;
      sender: "opponent" | "you";
    }) => {
      console.log("[client] emoteReceived received", payload);
      pushEmoteLabel(payload.sender, payload.emoteId);
    };

    const handleGameOver = (payload: {
      result?: string;
      message?: string;
      opponentName?: string;
      scores?: {
        you: number;
        opponent: number;
      };
      ratingChange?: {
        you: number;
        opponent: number;
      };
      newRatings?: {
        you: number;
        opponent: number;
      };
    }) => {
      console.log("[client] gameOver received", payload);
      const result =
        payload.result === "loss" ? "loss" : payload.result === "draw" ? "draw" : "win";

      if (payload.scores) {
        setScores(payload.scores);
      }

      if (payload.opponentName) {
        setOpponentName(payload.opponentName);
      }
      if (payload.newRatings) {
        setRatings(payload.newRatings);
      }

      setCurrentQuestion("");
      setAnswer("");
      setCountdownValue(null);
      setTimer({
        secondsLeft: 0
      });
      setFeedback((previous) => ({
        ...previous,
        youFast: false,
        opponentFast: false,
        youPowerUpAvailable: null,
        opponentPowerUpAvailable: null,
        youShieldActive: false,
        opponentShieldActive: false
      }));
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);
      setEmoteCooldownUntil(0);
      setEmoteLabels([]);
      setGameResult({
        result,
        message:
          payload.message ??
          (result === "win" ? "You Win!" : result === "loss" ? "You Lose" : "It's a Draw"),
        ratingChange: payload.ratingChange,
        newRatings: payload.newRatings
      });
      setStatus("finished");
      soundManager.play(result === "loss" ? "lose" : "win");
    };

    const handleOpponentLeft = (payload: { message?: string }) => {
      console.log("[client] opponentLeft received", payload);
      setCurrentQuestion("");
      setAnswer("");
      setCountdownValue(null);
      setFeedback(initialFeedback);
      setTimer(initialTimer);
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);
      setEmoteCooldownUntil(0);
      setEmoteLabels([]);
      setRematchRequested(false);
      setGameResult({
        result: "loss",
        message: payload.message ?? "Opponent left the game"
      });
      setStatus("opponent-left");
    };

    nextSocket.on("connect", handleConnect);
    nextSocket.on("connect_error", handleConnectError);
    nextSocket.on("authRequired", handleAuthRequired);
    nextSocket.on("matchFound", handleMatchFound);
    nextSocket.on("countdown", handleCountdown);
    nextSocket.on("newQuestion", handleNewQuestion);
    nextSocket.on("timerUpdate", handleTimerUpdate);
    nextSocket.on("incorrectAnswer", handleIncorrectAnswer);
    nextSocket.on("pointScored", handlePointScored);
    nextSocket.on("powerUpUsed", handlePowerUpUsed);
    nextSocket.on("shieldActivated", handleShieldActivated);
    nextSocket.on("shieldBlocked", handleShieldBlocked);
    nextSocket.on("emoteReceived", handleEmoteReceived);
    nextSocket.on("gameOver", handleGameOver);
    nextSocket.on("opponentLeft", handleOpponentLeft);

    return () => {
      clearTimeout(connectionTimeout);
      nextSocket.off("connect", handleConnect);
      nextSocket.off("connect_error", handleConnectError);
      nextSocket.off("authRequired", handleAuthRequired);
      nextSocket.off("matchFound", handleMatchFound);
      nextSocket.off("countdown", handleCountdown);
      nextSocket.off("newQuestion", handleNewQuestion);
      nextSocket.off("timerUpdate", handleTimerUpdate);
      nextSocket.off("incorrectAnswer", handleIncorrectAnswer);
      nextSocket.off("pointScored", handlePointScored);
      nextSocket.off("powerUpUsed", handlePowerUpUsed);
      nextSocket.off("shieldActivated", handleShieldActivated);
      nextSocket.off("shieldBlocked", handleShieldBlocked);
      nextSocket.off("emoteReceived", handleEmoteReceived);
      nextSocket.off("gameOver", handleGameOver);
      nextSocket.off("opponentLeft", handleOpponentLeft);
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [difficulty, retryKey, router, topic]);

  const submitAnswer = () => {
    const trimmedAnswer = answer.trim();

    if (!socket || !trimmedAnswer || status !== "playing") {
      return;
    }

    console.log(`[client] submitAnswer emitted -> ${trimmedAnswer}`);
    socket.emit("submitAnswer", trimmedAnswer);
    setAnswer("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitAnswer();
  };

  const handlePlayAgain = () => {
    if (!socket) {
      return;
    }

    setStatus("waiting");
    setScores(initialScores);
    setRatings((previous) => previous);
    setTimer(initialTimer);
    setFeedback(initialFeedback);
    setCurrentQuestion("Waiting for the first question...");
    setAnswer("");
    setCountdownValue(null);
    setFrozenUntil(0);
    setShieldBlockedUntil(0);
    setEmoteBarOpen(false);
    setEmoteCooldownUntil(0);
    setEmoteLabels([]);
    setRematchRequested(true);
    setGameResult(null);
    console.log("[client] requestRematch emitted");
    socket.emit("requestRematch");
  };

  const handleRetryConnection = () => {
    setStatus("connecting");
    setRetryKey((k) => k + 1);
  };

  const handleChangeTopic = () => {
    router.push("/");
  };

  const handleReturnToLobby = () => {
    router.push("/");
  };

  const handleToggleSound = () => {
    const nextMuted = !muted;
    soundManager.setMuted(nextMuted);
    setMuted(nextMuted);
  };

  const handleUsePowerUp = () => {
    if (!socket || status !== "playing" || !feedback.youPowerUpAvailable) {
      return;
    }

    socket.emit("usePowerUp", { type: feedback.youPowerUpAvailable });
  };

  const handleSendEmote = (emoteId: string) => {
    if (!socket || status !== "playing" || emoteCooldownUntil > Date.now()) {
      return;
    }

    const emote = getEmoteById(emoteId);
    const id = ++emoteIdRef.current;
    setEmoteLabels((previous) => [
      ...previous,
      { id, who: "you", text: `${emote.icon} ${emote.label}` }
    ]);
    setTimeout(() => {
      setEmoteLabels((previous) => previous.filter((item) => item.id !== id));
    }, 1500);

    setEmoteCooldownUntil(Date.now() + 1500);
    setEmoteBarOpen(false);
    socket.emit("sendEmote", { emoteId });
  };

  const isFinished = status === "finished";
  const isCountdown = status === "countdown";
  const isOpponentLeft = status === "opponent-left";
  const isWaitingState = status === "connecting" || status === "waiting";
  const isActiveGameplay = status === "playing";
  const isFrozen = frozenUntil > Date.now();
  const isShieldBlocked = shieldBlockedUntil > Date.now();
  const emoteCoolingDown = emoteCooldownUntil > Date.now();
  const timerLabel = `00:${String(Math.max(0, timer.secondsLeft)).padStart(2, "0")}`;

  const getStreakLabel = (streak: number) => {
    if (streak >= 5) {
      return "UNSTOPPABLE";
    }

    if (streak >= 3) {
      return "ON FIRE";
    }

    return null;
  };

  const yourStreakLabel = getStreakLabel(feedback.youStreak);
  const opponentStreakLabel = getStreakLabel(feedback.opponentStreak);
  const yourStreakLevel = feedback.youStreak >= 5 ? "unstoppable" : feedback.youStreak >= 3 ? "fire" : null;
  const opponentStreakLevel =
    feedback.opponentStreak >= 5 ? "unstoppable" : feedback.opponentStreak >= 3 ? "fire" : null;

  // Build floating label item lists for each player panel
  const youFloatingItems = [
    ...animState.shieldBlockedLabels
      .filter((l) => l.who === "you")
      .map((l) => ({ id: l.id, text: "BLOCKED 🛡️", color: "#6ee7b7" })),
    ...animState.powerUpActivatedLabels
      .filter((l) => l.who === "you")
      .map((l) => ({
        id: l.id,
        text: l.type === "freeze" ? "FREEZE ❄️" : "SHIELD 🛡️",
        color: l.type === "freeze" ? "#bae6fd" : "#6ee7b7",
      })),
    ...animState.powerUpReadyLabels
      .filter((l) => l.who === "you")
      .map((l) => ({
        id: l.id,
        text: l.type === "freeze" ? "FREEZE READY ❄️" : "SHIELD READY 🛡️",
        color: l.type === "freeze" ? "#bae6fd" : "#a7f3d0",
        duration: 1.5,
        className: "px-4 py-2 text-base md:text-lg"
      })),
    ...emoteLabels
      .filter((item) => item.who === "you")
      .map((item) => ({
        id: item.id,
        text: item.text,
        color: "#fef08a",
        duration: 1.5
      })),
  ];
  const opponentFloatingItems = [
    ...animState.shieldBlockedLabels
      .filter((l) => l.who === "opponent")
      .map((l) => ({ id: l.id, text: "BLOCKED 🛡️", color: "#6ee7b7" })),
    ...animState.powerUpActivatedLabels
      .filter((l) => l.who === "opponent")
      .map((l) => ({
        id: l.id,
        text: l.type === "freeze" ? "FREEZE ❄️" : "SHIELD 🛡️",
        color: l.type === "freeze" ? "#bae6fd" : "#6ee7b7",
      })),
    ...animState.powerUpReadyLabels
      .filter((l) => l.who === "opponent")
      .map((l) => ({
        id: l.id,
        text: l.type === "freeze" ? "FREEZE READY ❄️" : "SHIELD READY 🛡️",
        color: l.type === "freeze" ? "#bae6fd" : "#a7f3d0",
        duration: 1.5,
        className: "px-4 py-2 text-base md:text-lg"
      })),
    ...emoteLabels
      .filter((item) => item.who === "opponent")
      .map((item) => ({
        id: item.id,
        text: item.text,
        color: "#fef08a",
        duration: 1.5
      })),
  ];

  return (
    <section className="relative w-full max-w-4xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 shadow-glow backdrop-blur md:p-10">
      {/* Game-over overlays (win glow / lose vignette) */}
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

      <SoundToggle muted={muted} onToggle={handleToggleSound} />

      <div className="flex flex-col gap-8">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-sky-300">
            <span>Topic: {topicLabel}</span>
            <span>Difficulty: {difficultyLabel}</span>
            <span>Time: {timerLabel}</span>
          </div>

          <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">
            {statusHeading[status]}
          </h1>

          <p className="text-lg text-slate-300">{statusCopy[status]}</p>
          {isActiveGameplay ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                className="rounded-full bg-slate-800 px-4 py-2 text-xs text-slate-100 hover:bg-slate-700"
                onClick={() => setEmoteBarOpen((open) => !open)}
                disabled={emoteCoolingDown}
              >
                {emoteCoolingDown ? "Emote Cooldown" : "Emotes"}
              </Button>
              <AnimatePresence>
                {emoteBarOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/90 px-3 py-3"
                  >
                    {EMOTES.map((emote) => (
                      <button
                        key={emote.id}
                        type="button"
                        onClick={() => handleSendEmote(emote.id)}
                        className="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 transition hover:border-sky-400/40 hover:bg-slate-900"
                      >
                        <span className="mr-2">{emote.icon}</span>
                        <span>{emote.label}</span>
                      </button>
                    ))}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </div>

        {/* Player panels */}
        <div
          className={`grid gap-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:grid-cols-[1fr_auto_1fr] md:items-end ${
            isFrozen ? "ring-2 ring-sky-300/30 bg-sky-500/10" : ""
          }`}
        >
          {/* You */}
          <div className="relative flex flex-col gap-3">
            <PlayerPanel
              label={yourName}
              score={scores.you}
              rating={ratings.you}
              avatar={yourAvatar}
              streakLabel={isActiveGameplay ? yourStreakLabel : null}
              streakLevel={isActiveGameplay ? yourStreakLevel : null}
              fastActive={isActiveGameplay && feedback.youFast}
              highlighted={
                isActiveGameplay &&
                (feedback.youFast || !!yourStreakLabel || feedback.youShieldActive)
              }
              pulseKey={feedback.youPulseKey}
              scoreGlowKey={animState.youScoreGlowKey}
              shieldBlockFlashKey={animState.youShieldBlockFlashKey}
              powerUpGlowKey={animState.youPowerUpGlowKey}
            />
            <PowerUpSlot
              type={feedback.youPowerUpAvailable}
              onUse={handleUsePowerUp}
              disabled={!isActiveGameplay}
              pulseKey={animState.youPowerUpGlowKey}
              align="left"
            />
            <FloatingLabel items={youFloatingItems} />
          </div>

          <div className="pb-4 text-center text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">
            vs
          </div>

          {/* Opponent */}
          <div className="relative flex flex-col gap-3">
            <PlayerPanel
              label={opponentName}
              score={scores.opponent}
              rating={ratings.opponent}
              avatar={opponentAvatar}
              streakLabel={isActiveGameplay ? opponentStreakLabel : null}
              streakLevel={isActiveGameplay ? opponentStreakLevel : null}
              fastActive={isActiveGameplay && feedback.opponentFast}
              highlighted={
                isActiveGameplay &&
                (feedback.opponentFast || !!opponentStreakLabel || feedback.opponentShieldActive)
              }
              pulseKey={feedback.opponentPulseKey}
              scoreGlowKey={animState.opponentScoreGlowKey}
              shieldBlockFlashKey={animState.opponentShieldBlockFlashKey}
              powerUpGlowKey={animState.opponentPowerUpGlowKey}
            />
            <PowerUpSlot
              type={feedback.opponentPowerUpAvailable}
              disabled
              pulseKey={animState.opponentPowerUpGlowKey}
              align="right"
            />
            <FloatingLabel items={opponentFloatingItems} />
          </div>
        </div>

        {status === "failed" ? (
          <div className="rounded-[1.75rem] border border-amber-500/30 bg-amber-500/10 p-6 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-amber-300">Connection Failed</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-amber-200">
              Could not reach the game server
            </h2>
            <p className="mt-3 text-base text-slate-300">
              Make sure the server is running and{" "}
              <code className="rounded bg-slate-800 px-1 py-0.5 text-sm">NEXT_PUBLIC_SERVER_URL</code>{" "}
              is set correctly.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button className="w-full sm:w-auto" onClick={handleRetryConnection}>
                Retry Connection
              </Button>
              <Button variant="secondary" className="w-full sm:w-auto" onClick={handleReturnToLobby}>
                Return to Lobby
              </Button>
            </div>
          </div>
        ) : isOpponentLeft ? (
          <div className="rounded-[1.75rem] border border-rose-500/30 bg-rose-500/10 p-6 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-rose-300">Match Ended</p>
            <h2 className="mt-4 text-4xl font-black tracking-tight text-rose-200">
              Opponent left the game
            </h2>
            <p className="mt-3 text-base text-slate-200">{gameResult?.message}</p>
            <div className="mt-8">
              <Button variant="secondary" className="w-full" onClick={handleReturnToLobby}>
                Return to Lobby
              </Button>
            </div>
          </div>
        ) : !isFinished ? (
          <>
            {/* Question card — shake wrapper + frost burst overlay */}
            <motion.div animate={animState.questionShakeControls}>
              <div
                className={`relative rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-6 text-center transition-all duration-300 ${
                  isFrozen ? "border-sky-300/40 bg-sky-500/10" : ""
                }`}
              >
                {isActiveGameplay ? (
                  <div className="absolute right-5 top-5 rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-lg font-black tracking-[0.2em] text-sky-200">
                    {timerLabel}
                  </div>
                ) : null}
                <p className="text-sm uppercase tracking-[0.3em] text-slate-500">
                  {isCountdown ? "Countdown" : isWaitingState ? "Match Status" : "Current Question"}
                </p>

                {isCountdown ? (
                  <CountdownDisplay value={countdownValue} />
                ) : (
                  <p className="mt-4 text-3xl font-black tracking-tight text-white md:text-5xl">
                    {isWaitingState ? statusHeading[status] : currentQuestion}
                  </p>
                )}

                {isFrozen ? (
                  <p className="mt-4 text-2xl font-black uppercase tracking-[0.25em] text-sky-200">
                    FROZEN ❄️
                  </p>
                ) : null}
                {isShieldBlocked ? (
                  <p className="mt-4 text-2xl font-black uppercase tracking-[0.25em] text-emerald-200">
                    BLOCKED 🛡️
                  </p>
                ) : null}
                {!isFrozen && feedback.youShieldActive && isActiveGameplay ? (
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">
                    Shield Active 🛡️
                  </p>
                ) : null}
                {!isFrozen && feedback.opponentShieldActive && isActiveGameplay ? (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-300">
                    Opponent Shielded
                  </p>
                ) : null}

                {/* Frost burst overlay */}
                <FrostBurst active={animState.frostBurstActive} />
                <SnowfallOverlay active={animState.snowfallActive} />
              </div>
            </motion.div>

            {status === "playing" ? (
              <form className="space-y-3 transition-all duration-300" onSubmit={handleSubmit}>
                <label className="block space-y-2">
                  <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                    Your Answer
                  </span>
                  <input
                    type="text"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder={isFrozen ? "Frozen..." : "Type your answer and press Enter"}
                    disabled={isFrozen}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-4 text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                <Button className="w-full" type="submit" disabled={!answer.trim() || isFrozen}>
                  Submit Answer
                </Button>
              </form>
            ) : null}
          </>
        ) : (
          /* Game over — loss gets a subtle downward drift */
          <motion.div
            initial={{ y: 0 }}
            animate={gameResult?.result === "loss" ? { y: [0, 6, 0] } : {}}
            transition={{ duration: 1.3, delay: 0.5, ease: "easeInOut" }}
          >
            <div
              className={`rounded-[1.75rem] border p-6 text-center ${
                gameResult?.result === "win"
                  ? "border-sky-400/40 bg-sky-500/10"
                  : "border-rose-500/30 bg-rose-500/10"
              }`}
            >
              <p
                className={`text-sm uppercase tracking-[0.3em] ${
                  gameResult?.result === "win" ? "text-sky-300" : "text-rose-300"
                }`}
              >
                Game Over
              </p>
              <h2
                className={`mt-4 text-4xl font-black tracking-tight ${
                  gameResult?.result === "win" ? "text-sky-200" : "text-rose-200"
                }`}
              >
                {gameResult?.result === "win" ? "You Win! 🎉" : "You Lose"}
              </h2>
              <p className="mt-3 text-base text-slate-200">{gameResult?.message}</p>
              <p className="mt-6 text-sm uppercase tracking-[0.25em] text-slate-400">Final Score</p>
              <p className="mt-2 text-3xl font-black text-white">
                {scores.you} - {scores.opponent}
              </p>
              <p className="mt-2 text-sm text-slate-400">Opponent: {opponentName}</p>
              {gameResult?.ratingChange ? (
                <p
                  className={`mt-4 text-sm font-semibold ${
                    gameResult.ratingChange.you >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {gameResult.ratingChange.you >= 0 ? "+" : ""}
                  {gameResult.ratingChange.you} rating
                </p>
              ) : null}
              {gameResult?.newRatings ? (
                <p className="mt-1 text-sm text-slate-300">New Rating: {gameResult.newRatings.you}</p>
              ) : null}

              <div className="mt-8 grid gap-3 md:grid-cols-2">
                <Button className="w-full" onClick={handlePlayAgain} disabled={rematchRequested}>
                  {rematchRequested ? "Waiting for opponent..." : "Play Again"}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleChangeTopic}
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
