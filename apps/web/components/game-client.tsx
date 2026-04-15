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
import { getPowerUpMeta, type PowerUpId } from "@/lib/powerups";
import { useGameAnimations } from "@/hooks/useGameAnimations";
import { FrostBurst } from "@/components/animations/FrostBurst";
import { FloatingLabel } from "@/components/animations/FloatingLabel";
import { CountdownDisplay } from "@/components/animations/CountdownDisplay";
import { GameOverOverlay } from "@/components/animations/GameOverOverlay";
import { SnowfallOverlay } from "@/components/animations/SnowfallOverlay";

type GameStatus =
  | "connecting"
  | "waiting"
  | "room-lobby"
  | "countdown"
  | "playing"
  | "finished"
  | "opponent-left"
  | "failed";

type LobbyPlayer = {
  socketId: string;
  name: string;
  avatar: string;
  isHost: boolean;
};

type RoomLobbyState = {
  roomCode: string;
  topic: string;
  difficulty: string;
  status: "waiting" | "ready" | "in-game" | "finished";
  isHost: boolean;
  canStart: boolean;
  players: LobbyPlayer[];
};

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
  youPowerUpAvailable: PowerUpId | null;
  opponentPowerUpAvailable: PowerUpId | null;
  youShieldActive: boolean;
  opponentShieldActive: boolean;
  youSlowedUntil: number;
  opponentSlowedUntil: number;
  youDoublePointsUntil: number;
  opponentDoublePointsUntil: number;
  youAnsweredCurrent: boolean;
  opponentAnsweredCurrent: boolean;
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
  opponentShieldActive: false,
  youSlowedUntil: 0,
  opponentSlowedUntil: 0,
  youDoublePointsUntil: 0,
  opponentDoublePointsUntil: 0,
  youAnsweredCurrent: false,
  opponentAnsweredCurrent: false
};

function formatRoomCode(code: string) {
  const clean = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  if (clean.length <= 3) {
    return clean;
  }

  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}

const statusHeading: Record<GameStatus, string> = {
  connecting: "Connecting...",
  waiting: "Waiting for opponent...",
  "room-lobby": "Private room lobby",
  countdown: "Match found",
  playing: "In game",
  finished: "Game over",
  "opponent-left": "Opponent left the game",
  failed: "Connection Failed"
};

const statusCopy: Record<GameStatus, string> = {
  connecting: "Connecting you to the multiplayer server.",
  waiting: "You are in queue. We will pair you up as soon as another player joins.",
  "room-lobby": "Share your room code and start when both players are ready.",
  countdown: "Get ready. The round starts in a moment.",
  playing: "Answer quickly and keep the score moving.",
  finished: "This round is complete.",
  "opponent-left": "The match ended because the other player disconnected.",
  failed: "Could not reach the multiplayer server. Check your connection and try again."
};

type GameClientProps = {
  initialTopic?: string;
  initialDifficulty?: string;
  matchType?: string;
  initialRoomCode?: string;
};

export function GameClient({
  initialTopic,
  initialDifficulty,
  matchType,
  initialRoomCode
}: GameClientProps) {
  const router = useRouter();
  const topic = getSafeTopic(initialTopic);
  const difficulty = getSafeDifficulty(initialDifficulty);
  const roomJoinMode = matchType === "room-create" ? "create" : matchType === "room-join" ? "join" : "quick";
  const normalizedRoomCode = (initialRoomCode ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
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
  const [roomLobby, setRoomLobby] = useState<RoomLobbyState | null>(null);
  const [roomErrorMessage, setRoomErrorMessage] = useState<string | null>(null);
  const [roomNotice, setRoomNotice] = useState<string | null>(null);
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
    setRoomLobby(null);
    setRoomErrorMessage(null);
    setRoomNotice(null);
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

      if (roomJoinMode === "create") {
        console.log(`[client] createRoom emitted -> topic=${topic} difficulty=${difficulty}`);
        setStatus("room-lobby");
        nextSocket.emit("createRoom", {
          topic,
          difficulty,
          accessToken: session.access_token
        });
        return;
      }

      if (roomJoinMode === "join") {
        if (!normalizedRoomCode) {
          setStatus("failed");
          setRoomErrorMessage("Enter a valid room code.");
          setRoomNotice(null);
          return;
        }

        console.log(`[client] joinRoom emitted -> code=${normalizedRoomCode}`);
        setStatus("room-lobby");
        nextSocket.emit("joinRoom", {
          roomCode: normalizedRoomCode,
          accessToken: session.access_token
        });
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

    const applyRoomLobby = (payload: RoomLobbyState) => {
      setRoomErrorMessage(null);
      setRoomNotice(null);
      setRoomLobby(payload);
      if (payload.status !== "in-game") {
        setStatus("room-lobby");
      }
      setCurrentQuestion("Waiting for match start...");
    };

    const handleRoomCreated = (payload: RoomLobbyState) => {
      console.log("[client] roomCreated received", payload);
      applyRoomLobby(payload);
    };

    const handleRoomJoined = (payload: RoomLobbyState) => {
      console.log("[client] roomJoined received", payload);
      applyRoomLobby(payload);
    };

    const handleRoomUpdated = (payload: RoomLobbyState) => {
      console.log("[client] roomUpdated received", payload);
      applyRoomLobby(payload);
    };

    const handleRoomError = (payload: { message: string }) => {
      console.log("[client] roomError received", payload);
      setRoomErrorMessage(payload.message || "Room action failed.");
      setRoomNotice(null);
      if (roomJoinMode === "join") {
        setStatus("failed");
      }
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
      setRoomErrorMessage(null);
      setRoomNotice(null);
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
        opponentFast: false,
        youAnsweredCurrent: false,
        opponentAnsweredCurrent: false
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
      pointsAwarded?: number;
      powerUpAvailable?: PowerUpId | null;
      opponentPowerUpAvailable?: PowerUpId | null;
      shieldActive?: boolean;
      opponentShieldActive?: boolean;
      slowedUntil?: number;
      opponentSlowedUntil?: number;
      doublePointsUntil?: number;
      opponentDoublePointsUntil?: number;
      youAnswered?: boolean;
      opponentAnswered?: boolean;
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
        youSlowedUntil: payload.slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil: payload.opponentSlowedUntil ?? previous.opponentSlowedUntil,
        youDoublePointsUntil: payload.doublePointsUntil ?? previous.youDoublePointsUntil,
        opponentDoublePointsUntil:
          payload.opponentDoublePointsUntil ?? previous.opponentDoublePointsUntil,
        youAnsweredCurrent: payload.youAnswered ?? previous.youAnsweredCurrent,
        opponentAnsweredCurrent: payload.opponentAnswered ?? previous.opponentAnsweredCurrent,
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

      if ((payload.pointsAwarded ?? 0) > 1) {
        soundManager.play("powerReady");
      } else if (streakValue >= 3 && streakValue > previousFeedback.youStreak) {
        soundManager.play("streak");
      } else if (opponentStreakValue >= 3 && opponentStreakValue > previousFeedback.opponentStreak) {
        soundManager.play("streak");
      } else {
        soundManager.play("correct");
      }
    };

    const handleQuestionState = (payload: {
      youAnswered: boolean;
      opponentAnswered: boolean;
      winner: "you" | "opponent" | null;
    }) => {
      console.log("[client] questionState received", payload);
      if (payload.youAnswered) {
        setAnswer("");
      }
      setFeedback((previous) => ({
        ...previous,
        youAnsweredCurrent: payload.youAnswered,
        opponentAnsweredCurrent: payload.opponentAnswered
      }));
    };

    const handlePowerUpUsed = (payload: {
      type: PowerUpId;
      by: "you" | "opponent";
      target: "you" | "opponent";
      durationMs?: number;
      removedEffects?: string[];
      powerUpAvailable?: PowerUpId | null;
      opponentPowerUpAvailable?: PowerUpId | null;
      shieldActive?: boolean;
      opponentShieldActive?: boolean;
      slowedUntil?: number;
      opponentSlowedUntil?: number;
      doublePointsUntil?: number;
      opponentDoublePointsUntil?: number;
    }) => {
      console.log("[client] powerUpUsed received", payload);
      setFeedback((previous) => ({
        ...previous,
        youPowerUpAvailable: payload.powerUpAvailable ?? previous.youPowerUpAvailable,
        opponentPowerUpAvailable:
          payload.opponentPowerUpAvailable ?? previous.opponentPowerUpAvailable,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive,
        youSlowedUntil: payload.slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil: payload.opponentSlowedUntil ?? previous.opponentSlowedUntil,
        youDoublePointsUntil: payload.doublePointsUntil ?? previous.youDoublePointsUntil,
        opponentDoublePointsUntil:
          payload.opponentDoublePointsUntil ?? previous.opponentDoublePointsUntil
      }));

      if (payload.type === "freeze") {
        if (payload.target === "you" && payload.durationMs) {
          setFrozenUntil(Date.now() + payload.durationMs);
        }

        triggerFreezeHit(payload.target);
        soundManager.play("freezeHit");
      } else if (payload.type === "slow_opponent") {
        soundManager.play("powerReady");
      } else if (payload.type === "cleanse") {
        if (payload.target === "you") {
          setFrozenUntil(0);
        }
        soundManager.play("shieldBlock");
      } else if (payload.type === "steal_momentum") {
        soundManager.play("shieldBlock");
      } else {
        soundManager.play("powerReady");
      }

      triggerPowerUpActivated(payload.by, payload.type);
    };

    const handleShieldActivated = (payload: {
      by: "you" | "opponent";
      powerUpAvailable?: PowerUpId | null;
      opponentPowerUpAvailable?: PowerUpId | null;
      shieldActive?: boolean;
      opponentShieldActive?: boolean;
      slowedUntil?: number;
      opponentSlowedUntil?: number;
      doublePointsUntil?: number;
      opponentDoublePointsUntil?: number;
    }) => {
      console.log("[client] shieldActivated received", payload);
      setFeedback((previous) => ({
        ...previous,
        youPowerUpAvailable: payload.powerUpAvailable ?? previous.youPowerUpAvailable,
        opponentPowerUpAvailable:
          payload.opponentPowerUpAvailable ?? previous.opponentPowerUpAvailable,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive,
        youSlowedUntil: payload.slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil: payload.opponentSlowedUntil ?? previous.opponentSlowedUntil,
        youDoublePointsUntil: payload.doublePointsUntil ?? previous.youDoublePointsUntil,
        opponentDoublePointsUntil:
          payload.opponentDoublePointsUntil ?? previous.opponentDoublePointsUntil
      }));

      // Animate: power-up glow + floating label on the activating player's panel
      triggerPowerUpActivated(payload.by, "shield");
    };

    const handleShieldBlocked = (payload: {
      by: "you" | "opponent";
      target: "you" | "opponent";
      blockedType: "freeze";
      powerUpAvailable?: PowerUpId | null;
      opponentPowerUpAvailable?: PowerUpId | null;
      shieldActive?: boolean;
      opponentShieldActive?: boolean;
      slowedUntil?: number;
      opponentSlowedUntil?: number;
      doublePointsUntil?: number;
      opponentDoublePointsUntil?: number;
    }) => {
      console.log("[client] shieldBlocked received", payload);
      setFeedback((previous) => ({
        ...previous,
        youPowerUpAvailable: payload.powerUpAvailable ?? previous.youPowerUpAvailable,
        opponentPowerUpAvailable:
          payload.opponentPowerUpAvailable ?? previous.opponentPowerUpAvailable,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive,
        youSlowedUntil: payload.slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil: payload.opponentSlowedUntil ?? previous.opponentSlowedUntil,
        youDoublePointsUntil: payload.doublePointsUntil ?? previous.youDoublePointsUntil,
        opponentDoublePointsUntil:
          payload.opponentDoublePointsUntil ?? previous.opponentDoublePointsUntil
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
        opponentShieldActive: false,
        youSlowedUntil: 0,
        opponentSlowedUntil: 0,
        youDoublePointsUntil: 0,
        opponentDoublePointsUntil: 0,
        youAnsweredCurrent: false,
        opponentAnsweredCurrent: false
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
    nextSocket.on("roomCreated", handleRoomCreated);
    nextSocket.on("roomJoined", handleRoomJoined);
    nextSocket.on("roomUpdated", handleRoomUpdated);
    nextSocket.on("roomError", handleRoomError);
    nextSocket.on("matchFound", handleMatchFound);
    nextSocket.on("countdown", handleCountdown);
    nextSocket.on("newQuestion", handleNewQuestion);
    nextSocket.on("timerUpdate", handleTimerUpdate);
    nextSocket.on("incorrectAnswer", handleIncorrectAnswer);
    nextSocket.on("pointScored", handlePointScored);
    nextSocket.on("questionState", handleQuestionState);
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
      nextSocket.off("roomCreated", handleRoomCreated);
      nextSocket.off("roomJoined", handleRoomJoined);
      nextSocket.off("roomUpdated", handleRoomUpdated);
      nextSocket.off("roomError", handleRoomError);
      nextSocket.off("matchFound", handleMatchFound);
      nextSocket.off("countdown", handleCountdown);
      nextSocket.off("newQuestion", handleNewQuestion);
      nextSocket.off("timerUpdate", handleTimerUpdate);
      nextSocket.off("incorrectAnswer", handleIncorrectAnswer);
      nextSocket.off("pointScored", handlePointScored);
      nextSocket.off("questionState", handleQuestionState);
      nextSocket.off("powerUpUsed", handlePowerUpUsed);
      nextSocket.off("shieldActivated", handleShieldActivated);
      nextSocket.off("shieldBlocked", handleShieldBlocked);
      nextSocket.off("emoteReceived", handleEmoteReceived);
      nextSocket.off("gameOver", handleGameOver);
      nextSocket.off("opponentLeft", handleOpponentLeft);
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [difficulty, normalizedRoomCode, retryKey, roomJoinMode, router, topic]);

  const submitAnswer = () => {
    const trimmedAnswer = answer.trim();

    if (!socket || !trimmedAnswer || status !== "playing" || feedback.youAnsweredCurrent) {
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
    if (socket && roomLobby) {
      socket.emit("leaveRoom");
    }
    router.push("/");
  };

  const handleReturnToLobby = () => {
    if (socket && roomLobby) {
      socket.emit("leaveRoom");
    }
    router.push("/");
  };

  const handleStartRoomMatch = () => {
    if (!socket || !roomLobby?.isHost || !roomLobby.canStart) {
      return;
    }

    socket.emit("startRoomMatch");
  };

  const handleCopyRoomCode = async () => {
    if (!roomLobby?.roomCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(roomLobby.roomCode);
      setRoomNotice("Room code copied.");
      setTimeout(() => setRoomNotice(null), 1200);
    } catch {
      setRoomErrorMessage("Could not copy room code.");
      setRoomNotice(null);
    }
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
  const isRoomLobby = status === "room-lobby";
  const isOpponentLeft = status === "opponent-left";
  const isWaitingState = status === "connecting" || status === "waiting";
  const isActiveGameplay = status === "playing";
  const isFrozen = frozenUntil > Date.now();
  const isSlowed = feedback.youSlowedUntil > Date.now();
  const hasAnsweredCurrent = feedback.youAnsweredCurrent;
  const opponentAnsweredCurrent = feedback.opponentAnsweredCurrent;
  const isShieldBlocked = shieldBlockedUntil > Date.now();
  const emoteCoolingDown = emoteCooldownUntil > Date.now();
  const hasDoublePoints = feedback.youDoublePointsUntil > Date.now();
  const opponentHasDoublePoints = feedback.opponentDoublePointsUntil > Date.now();
  const roomPlayerCount = roomLobby?.players.length ?? 0;
  const roomReady = roomPlayerCount === 2;
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
      .map((l) => {
        const powerMeta = getPowerUpMeta(l.type);
        return {
        id: l.id,
        text: `${powerMeta?.name.toUpperCase() ?? "POWER-UP"} ${powerMeta?.icon ?? "✨"}`,
        color: "#6ee7b7",
      };
      }),
    ...animState.powerUpReadyLabels
      .filter((l) => l.who === "you")
      .map((l) => {
        const powerMeta = getPowerUpMeta(l.type);
        return {
        id: l.id,
        text: `${powerMeta?.name.toUpperCase() ?? "POWER-UP"} READY ${powerMeta?.icon ?? "✨"}`,
        color: "#a7f3d0",
        duration: 1.5,
        className: "px-4 py-2 text-base md:text-lg"
      };
      }),
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
      .map((l) => {
        const powerMeta = getPowerUpMeta(l.type);
        return {
        id: l.id,
        text: `${powerMeta?.name.toUpperCase() ?? "POWER-UP"} ${powerMeta?.icon ?? "✨"}`,
        color: "#6ee7b7",
      };
      }),
    ...animState.powerUpReadyLabels
      .filter((l) => l.who === "opponent")
      .map((l) => {
        const powerMeta = getPowerUpMeta(l.type);
        return {
        id: l.id,
        text: `${powerMeta?.name.toUpperCase() ?? "POWER-UP"} READY ${powerMeta?.icon ?? "✨"}`,
        color: "#a7f3d0",
        duration: 1.5,
        className: "px-4 py-2 text-base md:text-lg"
      };
      }),
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
    <section className="relative w-full max-w-4xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-4 shadow-glow backdrop-blur sm:p-6 md:p-10">
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

      <div className="flex flex-col gap-5 sm:gap-6 md:gap-8">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.25em] text-sky-300">
            <span>Topic: {topicLabel}</span>
            <span>Difficulty: {difficultyLabel}</span>
            <span>Time: {timerLabel}</span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">
            {statusHeading[status]}
          </h1>

          <p className="text-sm text-slate-300 sm:text-base md:text-lg">{statusCopy[status]}</p>
          {isActiveGameplay ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-3 sm:gap-3">
              <Button
                className="rounded-full bg-slate-800 px-4 py-2.5 text-xs text-slate-100 hover:bg-slate-700"
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
                        className="rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 transition hover:border-sky-400/40 hover:bg-slate-900"
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
          className={`grid grid-cols-[1fr_auto_1fr] gap-2 items-end rounded-3xl border border-slate-800 bg-slate-900/70 p-3 sm:gap-4 sm:p-4 md:p-6 ${
            isFrozen ? "ring-2 ring-sky-300/30 bg-sky-500/10" : ""
          }`}
        >
          {/* You */}
          <div className="relative flex flex-col gap-2 sm:gap-3">
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

          <div className="flex items-center justify-center self-center pb-0 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500 sm:text-sm">
            vs
          </div>

          {/* Opponent */}
          <div className="relative flex flex-col gap-2 sm:gap-3">
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

        {isRoomLobby && roomLobby ? (
          <div className="rounded-[1.75rem] border border-slate-700 bg-slate-900/70 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Room Code</p>
                <p className="mt-1 font-mono text-2xl font-black tracking-[0.28em] text-sky-200 sm:text-3xl">
                  {formatRoomCode(roomLobby.roomCode)}
                </p>
              </div>
              <Button variant="secondary" className="px-4 py-2 text-sm" onClick={handleCopyRoomCode}>
                Copy Code
              </Button>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <p>Topic: <span className="font-semibold text-white">{formatTopicLabel(getSafeTopic(roomLobby.topic))}</span></p>
              <p>Difficulty: <span className="font-semibold text-white">{roomLobby.difficulty}</span></p>
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300">
              <span
                className={`mr-2 inline-block h-2 w-2 rounded-full ${
                  roomReady ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                }`}
              />
              {roomReady ? "Both players ready." : "Waiting for another player to join..."}
            </div>

            <div className="mt-4 space-y-2">
              {roomLobby.players.map((player) => (
                <div key={player.socketId} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5">
                  <p className="flex items-center gap-2 text-sm text-slate-100">
                    <span>{getAvatar(player.avatar).emoji}</span>
                    <span>{player.name}</span>
                  </p>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    {player.isHost ? "Host" : "Guest"}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Button
                className="w-full"
                onClick={handleStartRoomMatch}
                disabled={!roomLobby.isHost || !roomLobby.canStart}
              >
                {roomLobby.isHost
                  ? roomLobby.canStart
                    ? "Start Match"
                    : "Waiting for Player"
                  : "Host Starts Match"}
              </Button>
              <Button variant="secondary" className="w-full" onClick={handleReturnToLobby}>
                Leave Room
              </Button>
            </div>
            {!roomLobby.isHost && roomReady ? (
              <p className="mt-3 text-sm text-slate-300">Waiting for host to start the match...</p>
            ) : null}
            {roomErrorMessage ? (
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                {roomErrorMessage}
              </p>
            ) : null}
            {roomNotice ? (
              <p className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {roomNotice}
              </p>
            ) : null}
          </div>
        ) : status === "failed" ? (
          <div className="rounded-[1.75rem] border border-amber-500/30 bg-amber-500/10 p-4 text-center sm:p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-amber-300">Connection Failed</p>
            <h2 className="mt-3 text-xl font-black tracking-tight text-amber-200 sm:mt-4 sm:text-2xl md:text-3xl">
              {roomJoinMode === "join" && roomErrorMessage ? "Unable to join room" : "Could not reach the game server"}
            </h2>
            <p className="mt-3 text-sm text-slate-300 sm:text-base">
              {roomErrorMessage ?? (
                <>
                  Make sure the server is running and{" "}
                  <code className="rounded bg-slate-800 px-1 py-0.5 text-sm">NEXT_PUBLIC_SERVER_URL</code>{" "}
                  is set correctly.
                </>
              )}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:justify-center">
              <Button className="w-full sm:w-auto" onClick={handleRetryConnection}>
                Retry Connection
              </Button>
              <Button variant="secondary" className="w-full sm:w-auto" onClick={handleReturnToLobby}>
                Return to Lobby
              </Button>
            </div>
          </div>
        ) : isOpponentLeft ? (
          <div className="rounded-[1.75rem] border border-rose-500/30 bg-rose-500/10 p-4 text-center sm:p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-rose-300">Match Ended</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-rose-200 sm:mt-4 sm:text-3xl md:text-4xl">
              Opponent left the game
            </h2>
            <p className="mt-3 text-sm text-slate-200 sm:text-base">{gameResult?.message}</p>
            <div className="mt-6 sm:mt-8">
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
                className={`relative rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-4 text-center transition-all duration-300 sm:p-6 ${
                  isFrozen ? "border-sky-300/40 bg-sky-500/10" : ""
                }`}
              >
                {isActiveGameplay ? (
                  <div className="absolute right-3 top-3 rounded-full border border-slate-700 bg-slate-950/80 px-2 py-1 text-sm font-black tracking-[0.15em] text-sky-200 sm:right-5 sm:top-5 sm:px-4 sm:py-2 sm:text-lg sm:tracking-[0.2em]">
                    {timerLabel}
                  </div>
                ) : null}
                <p className={`text-sm uppercase tracking-[0.3em] text-slate-500 ${isActiveGameplay ? "pr-14 sm:pr-0" : ""}`}>
                  {isCountdown ? "Countdown" : isWaitingState ? "Match Status" : "Current Question"}
                </p>

                {isCountdown ? (
                  <CountdownDisplay value={countdownValue} />
                ) : (
                  <p className="mt-3 text-xl font-black tracking-tight text-white sm:mt-4 sm:text-3xl md:text-5xl">
                    {isWaitingState ? statusHeading[status] : currentQuestion}
                  </p>
                )}

                {isFrozen ? (
                  <p className="mt-4 text-2xl font-black uppercase tracking-[0.25em] text-sky-200">
                    FROZEN ❄️
                  </p>
                ) : null}
                {isSlowed ? (
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.22em] text-amber-200">
                    Slowed 🐢
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
                {isActiveGameplay && hasDoublePoints ? (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
                    Double Points Ready ✖️
                  </p>
                ) : null}
                {isActiveGameplay && opponentHasDoublePoints ? (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.22em] text-rose-200">
                    Opponent Has Double Points
                  </p>
                ) : null}
                {isActiveGameplay && hasAnsweredCurrent && !opponentAnsweredCurrent ? (
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200">
                    Correct - waiting for opponent...
                  </p>
                ) : null}
                {isActiveGameplay && !hasAnsweredCurrent && opponentAnsweredCurrent ? (
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-amber-200">
                    Opponent answered - your turn
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
                    placeholder={
                      hasAnsweredCurrent
                        ? "Waiting for opponent..."
                        : isFrozen
                        ? "Frozen..."
                        : isSlowed
                        ? "Slowed..."
                        : "Type your answer and press Enter"
                    }
                    disabled={isFrozen || isSlowed || hasAnsweredCurrent}
                    className="w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-4 text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>

                <Button className="w-full" type="submit" disabled={!answer.trim() || isFrozen || isSlowed || hasAnsweredCurrent}>
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
              <p className="mt-3 text-base text-slate-200">{gameResult?.message}</p>
              <p className="mt-4 text-sm uppercase tracking-[0.25em] text-slate-400 sm:mt-6">Final Score</p>
              <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
                {scores.you} - {scores.opponent}
              </p>
              <p className="mt-2 text-sm text-slate-400">Opponent: {opponentName}</p>
              {gameResult?.ratingChange ? (
                <p
                  className={`mt-3 text-sm font-semibold ${
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

              <div className="mt-6 grid gap-3 sm:mt-8 md:grid-cols-2">
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
