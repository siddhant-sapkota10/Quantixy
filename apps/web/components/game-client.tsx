"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { PlayerPanel } from "@/components/player-panel";
import { SoundToggle } from "@/components/sound-toggle";
import { getSupabaseClient } from "@/lib/supabase";
import { createGameSocket, type GameSocket } from "@/lib/socket";
import { soundManager } from "@/lib/sounds";
import { formatTopicLabel, getSafeDifficulty, getSafeTopic } from "@/lib/topics";
import { getAvatar } from "@/lib/avatars";
import { EMOTES, getEmoteById } from "@/lib/emotes";
import { getPowerUpMeta, POWER_UPS, type PowerUpId } from "@/lib/powerups";

// Feature flag — set to true to re-enable the powerup system in live matches.
// While false, powerup UI is hidden and powerup socket events are no-ops.
const POWERUPS_ENABLED = false;
import { useGameAnimations } from "@/hooks/useGameAnimations";
import { FrostBurst } from "@/components/animations/FrostBurst";
import { FloatingLabel } from "@/components/animations/FloatingLabel";
import { CountdownDisplay } from "@/components/animations/CountdownDisplay";
import { GameOverOverlay } from "@/components/animations/GameOverOverlay";
import { SnowfallOverlay } from "@/components/animations/SnowfallOverlay";
import { EmoteBar } from "@/components/EmoteBar";
import { EmoteDisplay, type EmoteDisplayItem } from "@/components/EmoteDisplay";
import { OpponentPresence, type OpponentActivity } from "@/components/OpponentPresence";
import {
  UltimateActivationOverlay,
  type UltimateActivationCue
} from "@/components/animations/UltimateActivationOverlay";
import { ULTIMATE_VFX, normalizeUltimateType, type UltimateType } from "@/lib/ultimate-vfx";

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

type StrikeState = {
  you: number;
  opponent: number;
};

type TimerState = {
  secondsLeft: number;
};

type UltimateState = {
  type: string;
  name: string;
  description: string;
  charge: number;
  ready: boolean;
  used: boolean;
  implemented: boolean;
  opponentType: string;
  opponentName: string;
  opponentCharge: number;
  opponentReady: boolean;
  opponentUsed: boolean;
  opponentImplemented: boolean;
  titanUntil: number;
  opponentTitanUntil: number;
  blackoutUntil: number;
  opponentBlackoutUntil: number;
  overclockUntil: number;
  opponentOverclockUntil: number;
  fortressUntil: number;
  opponentFortressUntil: number;
  fortressBlocksRemaining: number;
  opponentFortressBlocksRemaining: number;
  flashBonusRemaining: number;
  opponentFlashBonusRemaining: number;
  novaBonusRemaining: number;
  opponentNovaBonusRemaining: number;
  infernoPending: boolean;
  opponentInfernoPending: boolean;
};

type FeedbackState = {
  youStreak: number;
  opponentStreak: number;
  youFast: boolean;
  opponentFast: boolean;
  youPulseKey: number;
  opponentPulseKey: number;
  youPowerUpAvailable: PowerUpId | null;
  youPowerUpUsed: boolean;
  opponentPowerUpAvailable: PowerUpId | null;
  youPowerUpsAvailable: PowerUpId[];
  opponentPowerUpsAvailable: PowerUpId[];
  youPowerUpsUsed: PowerUpId[];
  opponentPowerUpsUsed: PowerUpId[];
  youShieldActive: boolean;
  opponentShieldActive: boolean;
  youSlowedUntil: number;
  opponentSlowedUntil: number;
  youDoublePointsUntil: number;
  opponentDoublePointsUntil: number;
  hintText: string;
  hintUntil: number;
  youAnsweredCurrent: boolean;
  opponentAnsweredCurrent: boolean;
  questionWinner: "you" | "opponent" | null;
};

const initialScores: ScoreState = {
  you: 0,
  opponent: 0
};

const initialRatings: RatingState = {
  you: 1000,
  opponent: 1000
};

const initialStrikes: StrikeState = {
  you: 0,
  opponent: 0
};

const initialTimer: TimerState = {
  secondsLeft: 60
};

const initialUltimate: UltimateState = {
  type: "rapid_fire",
  name: "Rapid Fire",
  description: "",
  charge: 0,
  ready: false,
  used: false,
  implemented: true,
  opponentType: "rapid_fire",
  opponentName: "Rapid Fire",
  opponentCharge: 0,
  opponentReady: false,
  opponentUsed: false,
  opponentImplemented: true,
  titanUntil: 0,
  opponentTitanUntil: 0,
  blackoutUntil: 0,
  opponentBlackoutUntil: 0,
  overclockUntil: 0,
  opponentOverclockUntil: 0,
  fortressUntil: 0,
  opponentFortressUntil: 0,
  fortressBlocksRemaining: 0,
  opponentFortressBlocksRemaining: 0,
  flashBonusRemaining: 0,
  opponentFlashBonusRemaining: 0,
  novaBonusRemaining: 0,
  opponentNovaBonusRemaining: 0,
  infernoPending: false,
  opponentInfernoPending: false
};

const initialFeedback: FeedbackState = {
  youStreak: 0,
  opponentStreak: 0,
  youFast: false,
  opponentFast: false,
  youPulseKey: 0,
  opponentPulseKey: 0,
  youPowerUpAvailable: null,
  youPowerUpUsed: false,
  opponentPowerUpAvailable: null,
  youPowerUpsAvailable: [],
  opponentPowerUpsAvailable: [],
  youPowerUpsUsed: [],
  opponentPowerUpsUsed: [],
  youShieldActive: false,
  opponentShieldActive: false,
  youSlowedUntil: 0,
  opponentSlowedUntil: 0,
  youDoublePointsUntil: 0,
  opponentDoublePointsUntil: 0,
  hintText: "",
  hintUntil: 0,
  youAnsweredCurrent: false,
  opponentAnsweredCurrent: false,
  questionWinner: null
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
  const [strikes, setStrikes] = useState<StrikeState>(initialStrikes);
  const [eliminated, setEliminated] = useState({ you: false, opponent: false });
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const [ultimate, setUltimate] = useState<UltimateState>(initialUltimate);
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
  const [emoteLabels, setEmoteLabels] = useState<EmoteDisplayItem[]>([]);
  const emoteIdRef = useRef(0);
  const emoteTimestampsRef = useRef<number[]>([]);
  const seenEmoteMessageIdsRef = useRef<Set<string>>(new Set());
  const currentMatchRoomIdRef = useRef<string | null>(null);
  const [opponentEmoteFlashKey, setOpponentEmoteFlashKey] = useState(0);
  /** Token (server-side generation counter) of the question currently on screen.
   *  Sent back with every submitAnswer so the server can reject stale submissions. */
  const currentQuestionTokenRef = useRef(0);

  // Opponent presence / activity state
  const [opponentActivity, setOpponentActivity] = useState<OpponentActivity>("idle");
  /** Auto-reverts "typing" back to "thinking" if no new typing events arrive. */
  const opponentTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Throttle: timestamp of last playerTyping emit to avoid spamming the server. */
  const lastTypingEmitRef = useRef(0);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [opponentRematchRequested, setOpponentRematchRequested] = useState(false);
  const [rematchProgress, setRematchProgress] = useState({ requestedPlayers: 0, requiredPlayers: 2 });
  const [muted, setMuted] = useState(false);
  const [roomLobby, setRoomLobby] = useState<RoomLobbyState | null>(null);
  const [roomErrorMessage, setRoomErrorMessage] = useState<string | null>(null);
  const [roomNotice, setRoomNotice] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<{
    result: "win" | "loss" | "draw";
    message: string;
    ratingChange?: RatingState;
    newRatings?: RatingState;
    peakStreak: number;
    opponentPeakStreak: number;
  } | null>(null);
  /** Peak answer-streak reached by local player this match. */
  const peakYouStreakRef = useRef(0);
  /** Peak answer-streak reached by opponent this match. */
  const peakOpponentStreakRef = useRef(0);
  const [ultimateCue, setUltimateCue] = useState<UltimateActivationCue | null>(null);
  const ultimateCueIdRef = useRef(0);
  const ultimateCueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [youUltimateFxKey, setYouUltimateFxKey] = useState(0);
  const [opponentUltimateFxKey, setOpponentUltimateFxKey] = useState(0);
  const [youUltimateFxType, setYouUltimateFxType] = useState<UltimateType | null>(null);
  const [opponentUltimateFxType, setOpponentUltimateFxType] = useState<UltimateType | null>(null);

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
    setStrikes(initialStrikes);
    setEliminated({ you: false, opponent: false });
    setTimer(initialTimer);
    setUltimate(initialUltimate);
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
    seenEmoteMessageIdsRef.current.clear();
    setRematchRequested(false);
    setOpponentRematchRequested(false);
    setRematchProgress({ requestedPlayers: 0, requiredPlayers: 2 });
    setRoomLobby(null);
    setRoomErrorMessage(null);
    setRoomNotice(null);
    setGameResult(null);
    setUltimateCue(null);
    setYouUltimateFxKey(0);
    setOpponentUltimateFxKey(0);
    setYouUltimateFxType(null);
    setOpponentUltimateFxType(null);
    if (ultimateCueTimeoutRef.current) {
      clearTimeout(ultimateCueTimeoutRef.current);
      ultimateCueTimeoutRef.current = null;
    }
    currentMatchRoomIdRef.current = null;

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

    const syncUltimateFromPayload = (payload: Record<string, unknown>) => {
      setUltimate((previous) => ({
        ...previous,
        type: typeof payload.ultimateType === "string" ? payload.ultimateType : previous.type,
        name: typeof payload.ultimateName === "string" ? payload.ultimateName : previous.name,
        description:
          typeof payload.ultimateDescription === "string"
            ? payload.ultimateDescription
            : previous.description,
        charge: typeof payload.ultimateCharge === "number" ? payload.ultimateCharge : previous.charge,
        ready: typeof payload.ultimateReady === "boolean" ? payload.ultimateReady : previous.ready,
        used: typeof payload.ultimateUsed === "boolean" ? payload.ultimateUsed : previous.used,
        implemented:
          typeof payload.ultimateImplemented === "boolean"
            ? payload.ultimateImplemented
            : previous.implemented,
        opponentType:
          typeof payload.opponentUltimateType === "string"
            ? payload.opponentUltimateType
            : previous.opponentType,
        opponentName:
          typeof payload.opponentUltimateName === "string"
            ? payload.opponentUltimateName
            : previous.opponentName,
        opponentCharge:
          typeof payload.opponentUltimateCharge === "number"
            ? payload.opponentUltimateCharge
            : previous.opponentCharge,
        opponentReady:
          typeof payload.opponentUltimateReady === "boolean"
            ? payload.opponentUltimateReady
            : previous.opponentReady,
        opponentUsed:
          typeof payload.opponentUltimateUsed === "boolean"
            ? payload.opponentUltimateUsed
            : previous.opponentUsed,
        opponentImplemented:
          typeof payload.opponentUltimateImplemented === "boolean"
            ? payload.opponentUltimateImplemented
            : previous.opponentImplemented,
        titanUntil: typeof payload.titanUntil === "number" ? payload.titanUntil : previous.titanUntil,
        opponentTitanUntil:
          typeof payload.opponentTitanUntil === "number"
            ? payload.opponentTitanUntil
            : previous.opponentTitanUntil,
        blackoutUntil:
          typeof payload.blackoutUntil === "number" ? payload.blackoutUntil : previous.blackoutUntil,
        opponentBlackoutUntil:
          typeof payload.opponentBlackoutUntil === "number"
            ? payload.opponentBlackoutUntil
            : previous.opponentBlackoutUntil,
        overclockUntil:
          typeof payload.overclockUntil === "number" ? payload.overclockUntil : previous.overclockUntil,
        opponentOverclockUntil:
          typeof payload.opponentOverclockUntil === "number"
            ? payload.opponentOverclockUntil
            : previous.opponentOverclockUntil,
        fortressUntil:
          typeof payload.fortressUntil === "number" ? payload.fortressUntil : previous.fortressUntil,
        opponentFortressUntil:
          typeof payload.opponentFortressUntil === "number"
            ? payload.opponentFortressUntil
            : previous.opponentFortressUntil,
        fortressBlocksRemaining:
          typeof payload.fortressBlocksRemaining === "number"
            ? payload.fortressBlocksRemaining
            : previous.fortressBlocksRemaining,
        opponentFortressBlocksRemaining:
          typeof payload.opponentFortressBlocksRemaining === "number"
            ? payload.opponentFortressBlocksRemaining
            : previous.opponentFortressBlocksRemaining,
        flashBonusRemaining:
          typeof payload.flashBonusRemaining === "number"
            ? payload.flashBonusRemaining
            : previous.flashBonusRemaining,
        opponentFlashBonusRemaining:
          typeof payload.opponentFlashBonusRemaining === "number"
            ? payload.opponentFlashBonusRemaining
            : previous.opponentFlashBonusRemaining,
        novaBonusRemaining:
          typeof payload.novaBonusRemaining === "number"
            ? payload.novaBonusRemaining
            : previous.novaBonusRemaining,
        opponentNovaBonusRemaining:
          typeof payload.opponentNovaBonusRemaining === "number"
            ? payload.opponentNovaBonusRemaining
            : previous.opponentNovaBonusRemaining,
        infernoPending:
          typeof payload.infernoPending === "boolean" ? payload.infernoPending : previous.infernoPending,
        opponentInfernoPending:
          typeof payload.opponentInfernoPending === "boolean"
            ? payload.opponentInfernoPending
            : previous.opponentInfernoPending
      }));
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
      roomId?: string;
      room?: string;
      roomInfo?: { id?: string };
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
      ultimateType?: string;
      ultimateName?: string;
      ultimateCharge?: number;
      ultimateReady?: boolean;
      ultimateUsed?: boolean;
      ultimateImplemented?: boolean;
      opponentUltimateType?: string;
      opponentUltimateName?: string;
      opponentUltimateCharge?: number;
      opponentUltimateReady?: boolean;
      opponentUltimateUsed?: boolean;
      opponentUltimateImplemented?: boolean;
      titanUntil?: number;
      opponentTitanUntil?: number;
      blackoutUntil?: number;
      opponentBlackoutUntil?: number;
      flashBonusRemaining?: number;
      opponentFlashBonusRemaining?: number;
      infernoPending?: boolean;
      opponentInfernoPending?: boolean;
    }) => {
      console.log("[client] matchFound received", payload);
      currentMatchRoomIdRef.current =
        payload.roomId ?? payload.room ?? payload.roomInfo?.id ?? currentMatchRoomIdRef.current;
      setYourName(payload.yourName ?? "You");
      setOpponentName(payload.opponentName ?? payload.opponent?.name ?? "Opponent");
      setYourAvatar(getAvatar(payload.yourAvatar).emoji);
      setOpponentAvatar(getAvatar(payload.opponentAvatar).emoji);
      if (payload.ratings) {
        setRatings(payload.ratings);
      }
      setUltimate(initialUltimate);
      syncUltimateFromPayload(payload);
      const youPowerUpsAvailable = Array.isArray((payload as { powerUpsAvailable?: PowerUpId[] }).powerUpsAvailable)
        ? (payload as { powerUpsAvailable?: PowerUpId[] }).powerUpsAvailable ?? []
        : [];
      const opponentPowerUpsAvailable = Array.isArray((payload as { opponentPowerUpsAvailable?: PowerUpId[] }).opponentPowerUpsAvailable)
        ? (payload as { opponentPowerUpsAvailable?: PowerUpId[] }).opponentPowerUpsAvailable ?? []
        : [];
      const youPowerUpsUsed = Array.isArray((payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed)
        ? (payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed ?? []
        : [];
      const opponentPowerUpsUsed = Array.isArray((payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed)
        ? (payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed ?? []
        : [];

      setStatus("countdown");
      setCurrentQuestion("");
      setCountdownValue(null);
      setFeedback({
        ...initialFeedback,
        youPowerUpsAvailable,
        opponentPowerUpsAvailable,
        youPowerUpsUsed,
        opponentPowerUpsUsed,
        youPowerUpAvailable: youPowerUpsAvailable[0] ?? null,
        opponentPowerUpAvailable: opponentPowerUpsAvailable[0] ?? null,
      });
      setStrikes(initialStrikes);
      setEliminated({ you: false, opponent: false });
      setTimer(initialTimer);
      setUltimate(initialUltimate);
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);
      setEmoteCooldownUntil(0);
      setEmoteLabels([]);
      seenEmoteMessageIdsRef.current.clear();
      setRoomErrorMessage(null);
      setRoomNotice(null);
      setRematchRequested(false);
      setOpponentRematchRequested(false);
      setRematchProgress({ requestedPlayers: 0, requiredPlayers: 2 });
      setGameResult(null);
      // Presence: opponent is now in-match — start as idle until first question
      setOpponentActivity("idle");
      // Reset peak streak tracking for new match
      peakYouStreakRef.current = 0;
      peakOpponentStreakRef.current = 0;
    };

    const handleCountdown = (payload: { value: string }) => {
      console.log("[client] countdown received", payload);
      if (payload.value === "3") {
        setScores(initialScores);
        setStrikes(initialStrikes);
        setEliminated({ you: false, opponent: false });
        setTimer(initialTimer);
        setUltimate(initialUltimate);
        setFeedback(initialFeedback);
        setFrozenUntil(0);
        setShieldBlockedUntil(0);
        setEmoteCooldownUntil(0);
        setEmoteLabels([]);
        seenEmoteMessageIdsRef.current.clear();
        setOpponentActivity("idle");
        if (opponentTypingTimerRef.current) {
          clearTimeout(opponentTypingTimerRef.current);
          opponentTypingTimerRef.current = null;
        }
        peakYouStreakRef.current = 0;
        peakOpponentStreakRef.current = 0;
      }
      setStatus("countdown");
      setCurrentQuestion("");
      setAnswer("");
      setCountdownValue(payload.value);
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);
      setRematchRequested(false);
      setOpponentRematchRequested(false);
      setRematchProgress({ requestedPlayers: 0, requiredPlayers: 2 });

      if (payload.value === "GO") {
        soundManager.play("go");
      } else {
        soundManager.play("tick");
      }
    };

    const handleNewQuestion = (payload: { question?: string; token?: number } | string) => {
      console.log("[client] newQuestion received", payload);
      const question = typeof payload === "string" ? payload : payload.question;
      const token = typeof payload === "object" && payload !== null ? (payload.token ?? 0) : 0;
      // Store the question token so stale submits can be rejected server-side.
      currentQuestionTokenRef.current = token;
      setCurrentQuestion(question || "Get ready...");
      setAnswer("");
      setCountdownValue(null);
      setFeedback((previous) => ({
        ...previous,
        youFast: false,
        opponentFast: false,
        youAnsweredCurrent: false,
        opponentAnsweredCurrent: false,
        questionWinner: null,
        hintText: "",
        hintUntil: 0
      }));
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);
      setRematchRequested(false);
      setOpponentRematchRequested(false);
      setRematchProgress({ requestedPlayers: 0, requiredPlayers: 2 });
      setGameResult(null);
      setStatus("playing");
      // Reset opponent presence to "thinking" for the new question
      setOpponentActivity("thinking");
      if (opponentTypingTimerRef.current) {
        clearTimeout(opponentTypingTimerRef.current);
        opponentTypingTimerRef.current = null;
      }
      lastTypingEmitRef.current = 0;
    };

    const handleTimerUpdate = (payload: {
      secondsLeft: number;
      ultimateType?: string;
      ultimateName?: string;
      ultimateCharge?: number;
      ultimateReady?: boolean;
      ultimateUsed?: boolean;
      ultimateImplemented?: boolean;
      opponentUltimateType?: string;
      opponentUltimateName?: string;
      opponentUltimateCharge?: number;
      opponentUltimateReady?: boolean;
      opponentUltimateUsed?: boolean;
      opponentUltimateImplemented?: boolean;
      titanUntil?: number;
      opponentTitanUntil?: number;
      blackoutUntil?: number;
      opponentBlackoutUntil?: number;
      flashBonusRemaining?: number;
      opponentFlashBonusRemaining?: number;
      infernoPending?: boolean;
      opponentInfernoPending?: boolean;
    }) => {
      console.log("[client] timerUpdate received", payload);
      setTimer({
        secondsLeft: payload.secondsLeft
      });
      syncUltimateFromPayload(payload);
    };

    const pushEmoteLabel = (who: "you" | "opponent", emoteId: string, clientMessageId?: string) => {
      if (clientMessageId) {
        const seen = seenEmoteMessageIdsRef.current;
        if (seen.has(clientMessageId)) {
          return;
        }
        seen.add(clientMessageId);
        if (seen.size > 300) {
          const oldest = seen.values().next().value;
          if (oldest) {
            seen.delete(oldest);
          }
        }
      }

      const emote = getEmoteById(emoteId);
      const id = ++emoteIdRef.current;

      setEmoteLabels((previous) => [
        ...previous,
        { id, who, icon: emote.icon, label: emote.label }
      ]);

      // Flash the opponent panel when they emote
      if (who === "opponent") {
        setOpponentEmoteFlashKey((k) => k + 1);
      }

      setTimeout(() => {
        setEmoteLabels((previous) => previous.filter((item) => item.id !== id));
      }, 2000);
    };

    const handleIncorrectAnswer = (payload: { strikes?: number; eliminated?: boolean }) => {
      console.log("[client] incorrectAnswer received", payload);
      soundManager.play("wrong");
      // Show "Streak Broken" popup if local player had a streak going
      if (feedbackRef.current.youStreak >= 2) {
        triggerStreakBroken();
      }
      setStrikes((previous) => ({
        ...previous,
        you: payload.strikes ?? previous.you
      }));
      setEliminated((previous) => ({
        ...previous,
        you: payload.eliminated ?? previous.you
      }));
      if (payload.eliminated) {
        setAnswer("");
      }
    };

    const handleOpponentStrike = (payload: {
      opponentStrikes?: number;
      opponentEliminated?: boolean;
    }) => {
      console.log("[client] opponentStrike received", payload);
      setStrikes((previous) => ({
        ...previous,
        opponent: payload.opponentStrikes ?? previous.opponent
      }));
      setEliminated((previous) => ({
        ...previous,
        opponent: payload.opponentEliminated ?? previous.opponent
      }));
    };

    const handleLiveLeaderboard = (payload: {
      entries?: Array<{
        name: string;
        score: number;
        strikes: number;
        eliminated: boolean;
      }>;
      scores?: { you: number; opponent: number };
      strikes?: { you: number; opponent: number };
      eliminated?: { you: boolean; opponent: boolean };
      ultimateType?: string;
      ultimateName?: string;
      ultimateCharge?: number;
      ultimateReady?: boolean;
      ultimateUsed?: boolean;
      ultimateImplemented?: boolean;
      opponentUltimateType?: string;
      opponentUltimateName?: string;
      opponentUltimateCharge?: number;
      opponentUltimateReady?: boolean;
      opponentUltimateUsed?: boolean;
      opponentUltimateImplemented?: boolean;
      titanUntil?: number;
      opponentTitanUntil?: number;
      blackoutUntil?: number;
      opponentBlackoutUntil?: number;
      flashBonusRemaining?: number;
      opponentFlashBonusRemaining?: number;
      infernoPending?: boolean;
      opponentInfernoPending?: boolean;
    }) => {
      console.log("[client] liveLeaderboard received", payload);
      if (payload.scores) {
        setScores(payload.scores);
      }
      if (payload.strikes) {
        setStrikes(payload.strikes);
      }
      if (payload.eliminated) {
        setEliminated(payload.eliminated);
      }
      syncUltimateFromPayload(payload);
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
      strikes?: number;
      opponentStrikes?: number;
      youEliminated?: boolean;
      opponentEliminated?: boolean;
      powerUpAvailable?: PowerUpId | null;
      opponentPowerUpAvailable?: PowerUpId | null;
      shieldActive?: boolean;
      opponentShieldActive?: boolean;
      slowedUntil?: number;
      opponentSlowedUntil?: number;
      doublePointsUntil?: number;
      opponentDoublePointsUntil?: number;
      ultimateType?: string;
      ultimateName?: string;
      ultimateCharge?: number;
      ultimateReady?: boolean;
      ultimateUsed?: boolean;
      ultimateImplemented?: boolean;
      opponentUltimateType?: string;
      opponentUltimateName?: string;
      opponentUltimateCharge?: number;
      opponentUltimateReady?: boolean;
      opponentUltimateUsed?: boolean;
      opponentUltimateImplemented?: boolean;
      titanUntil?: number;
      opponentTitanUntil?: number;
      blackoutUntil?: number;
      opponentBlackoutUntil?: number;
      flashBonusRemaining?: number;
      opponentFlashBonusRemaining?: number;
      infernoPending?: boolean;
      opponentInfernoPending?: boolean;
      youAnswered?: boolean;
      opponentAnswered?: boolean;
    }) => {
      console.log("[client] pointScored received", payload);
      const nextScores = payload.scores ?? payload.playerScores;
      const streakValue = payload.streak ?? 0;
      const opponentStreakValue = payload.opponentStreak ?? 0;
      // Track peak streaks for end-of-match summary
      if (streakValue > peakYouStreakRef.current) peakYouStreakRef.current = streakValue;
      if (opponentStreakValue > peakOpponentStreakRef.current) peakOpponentStreakRef.current = opponentStreakValue;
      const previousFeedback = feedbackRef.current;

      // Determine who scored by comparing new values against the previous score
      const prevScores = scoresRef.current;
      const newYouScore = nextScores?.you ?? payload.you ?? 0;
      const newOpponentScore = nextScores?.opponent ?? payload.opponent ?? 0;
      if (newYouScore > prevScores.you) triggerScoreGlow("you");
      if (newOpponentScore > prevScores.opponent) triggerScoreGlow("opponent");

      // Use "in" check to distinguish explicit null (clear) from absent (keep previous)
      const payloadYouAvailable = (payload as { powerUpsAvailable?: PowerUpId[] }).powerUpsAvailable;
      const payloadOpponentAvailable = (payload as { opponentPowerUpsAvailable?: PowerUpId[] }).opponentPowerUpsAvailable;
      const nextYouPowerUp = Array.isArray(payloadYouAvailable)
        ? payloadYouAvailable[0] ?? null
        : "powerUpAvailable" in payload
          ? (payload.powerUpAvailable ?? null)
          : previousFeedback.youPowerUpAvailable;
      const nextOpponentPowerUp = Array.isArray(payloadOpponentAvailable)
        ? payloadOpponentAvailable[0] ?? null
        : "opponentPowerUpAvailable" in payload
          ? (payload.opponentPowerUpAvailable ?? null)
          : previousFeedback.opponentPowerUpAvailable;
      const localJustEarnedPowerUp =
        !previousFeedback.youPowerUpAvailable && nextYouPowerUp;
      const opponentJustEarnedPowerUp =
        !previousFeedback.opponentPowerUpAvailable && nextOpponentPowerUp;

      setScores({
        you: newYouScore,
        opponent: newOpponentScore
      });
      setStrikes((previous) => ({
        you: payload.strikes ?? previous.you,
        opponent: payload.opponentStrikes ?? previous.opponent
      }));
      setEliminated((previous) => ({
        you: payload.youEliminated ?? previous.you,
        opponent: payload.opponentEliminated ?? previous.opponent
      }));
      syncUltimateFromPayload(payload);

      setFeedback((previous) => ({
        youStreak: payload.streak ?? 0,
        opponentStreak: payload.opponentStreak ?? 0,
        youFast: payload.fastAnswer ?? false,
        opponentFast: payload.opponentFastAnswer ?? false,
        youPowerUpAvailable: "powerUpAvailable" in payload ? (payload.powerUpAvailable ?? null) : previous.youPowerUpAvailable,
        youPowerUpUsed: nextYouPowerUp ? false : previous.youPowerUpUsed,
        opponentPowerUpAvailable: "opponentPowerUpAvailable" in payload ? (payload.opponentPowerUpAvailable ?? null) : previous.opponentPowerUpAvailable,
        youPowerUpsAvailable: Array.isArray(payloadYouAvailable) ? payloadYouAvailable : previous.youPowerUpsAvailable,
        opponentPowerUpsAvailable: Array.isArray(payloadOpponentAvailable) ? payloadOpponentAvailable : previous.opponentPowerUpsAvailable,
        youPowerUpsUsed: Array.isArray((payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed)
          ? (payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed ?? []
          : previous.youPowerUpsUsed,
        opponentPowerUpsUsed: Array.isArray((payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed)
          ? (payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed ?? []
          : previous.opponentPowerUpsUsed,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive,
        youSlowedUntil: payload.slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil: payload.opponentSlowedUntil ?? previous.opponentSlowedUntil,
        youDoublePointsUntil: payload.doublePointsUntil ?? previous.youDoublePointsUntil,
        opponentDoublePointsUntil:
          payload.opponentDoublePointsUntil ?? previous.opponentDoublePointsUntil,
        hintText:
          (payload as { hintText?: string }).hintText ?? previous.hintText,
        hintUntil:
          (payload as { hintUntil?: number }).hintUntil ?? previous.hintUntil,
        youAnsweredCurrent: payload.youAnswered ?? previous.youAnsweredCurrent,
        opponentAnsweredCurrent: payload.opponentAnswered ?? previous.opponentAnsweredCurrent,
        questionWinner: previous.questionWinner,
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

      if (POWERUPS_ENABLED && localJustEarnedPowerUp) {
        triggerPowerUpReady("you", nextYouPowerUp);
        soundManager.play("powerReady");
      }

      if (POWERUPS_ENABLED && opponentJustEarnedPowerUp) {
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
      youEliminated?: boolean;
      opponentEliminated?: boolean;
      ultimateType?: string;
      ultimateName?: string;
      ultimateCharge?: number;
      ultimateReady?: boolean;
      ultimateUsed?: boolean;
      ultimateImplemented?: boolean;
      opponentUltimateType?: string;
      opponentUltimateName?: string;
      opponentUltimateCharge?: number;
      opponentUltimateReady?: boolean;
      opponentUltimateUsed?: boolean;
      opponentUltimateImplemented?: boolean;
      titanUntil?: number;
      opponentTitanUntil?: number;
      blackoutUntil?: number;
      opponentBlackoutUntil?: number;
      flashBonusRemaining?: number;
      opponentFlashBonusRemaining?: number;
      infernoPending?: boolean;
      opponentInfernoPending?: boolean;
    }) => {
      console.log("[client] questionState received", payload);
      if (payload.youAnswered) {
        setAnswer("");
      }
      setFeedback((previous) => ({
        ...previous,
        youAnsweredCurrent: payload.youAnswered,
        opponentAnsweredCurrent: payload.opponentAnswered,
        questionWinner: payload.winner ?? previous.questionWinner
      }));
      setEliminated((previous) => ({
        you: payload.youEliminated ?? previous.you,
        opponent: payload.opponentEliminated ?? previous.opponent
      }));
      syncUltimateFromPayload(payload);
    };

    const handleUltimateApplied = (payload: {
      by: "you" | "opponent";
      target: "you" | "opponent";
      type: string;
      effect: string;
      durationMs?: number;
      questionsRemaining?: number;
      ultimateType?: string;
      ultimateName?: string;
      ultimateCharge?: number;
      ultimateReady?: boolean;
      ultimateUsed?: boolean;
      ultimateImplemented?: boolean;
      opponentUltimateType?: string;
      opponentUltimateName?: string;
      opponentUltimateCharge?: number;
      opponentUltimateReady?: boolean;
      opponentUltimateUsed?: boolean;
      opponentUltimateImplemented?: boolean;
      titanUntil?: number;
      opponentTitanUntil?: number;
      blackoutUntil?: number;
      opponentBlackoutUntil?: number;
      flashBonusRemaining?: number;
      opponentFlashBonusRemaining?: number;
      infernoPending?: boolean;
      opponentInfernoPending?: boolean;
    }) => {
      console.log("[client] ultimateApplied received", payload);
      syncUltimateFromPayload(payload);
      setFeedback((previous) => ({
        ...previous,
        youShieldActive: (payload as { shieldActive?: boolean }).shieldActive ?? previous.youShieldActive,
        opponentShieldActive:
          (payload as { opponentShieldActive?: boolean }).opponentShieldActive ??
          previous.opponentShieldActive,
        youSlowedUntil: (payload as { slowedUntil?: number }).slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil:
          (payload as { opponentSlowedUntil?: number }).opponentSlowedUntil ??
          previous.opponentSlowedUntil,
        youDoublePointsUntil:
          (payload as { doublePointsUntil?: number }).doublePointsUntil ??
          previous.youDoublePointsUntil,
        opponentDoublePointsUntil:
          (payload as { opponentDoublePointsUntil?: number }).opponentDoublePointsUntil ??
          previous.opponentDoublePointsUntil
      }));
      const normalizedType = normalizeUltimateType(payload.type);
      const cueId = ++ultimateCueIdRef.current;
      setUltimateCue({
        id: cueId,
        by: payload.by,
        target: payload.target,
        type: normalizedType
      });
      if (ultimateCueTimeoutRef.current) {
        clearTimeout(ultimateCueTimeoutRef.current);
      }
      const cueLifetimeMs = Math.max(
        880,
        Math.min(1300, (ULTIMATE_VFX[normalizedType].durationMs ?? 1000) * 0.34)
      );
      const cueVisibleMs = payload.by === "opponent" ? cueLifetimeMs + 120 : cueLifetimeMs;
      ultimateCueTimeoutRef.current = setTimeout(() => {
        setUltimateCue((previous) => (previous?.id === cueId ? null : previous));
      }, cueVisibleMs);

      if (payload.by === "you") {
        setYouUltimateFxType(normalizedType);
        setYouUltimateFxKey((value) => value + 1);
      } else {
        setOpponentUltimateFxType(normalizedType);
        setOpponentUltimateFxKey((value) => value + 1);
      }

      if ((payload.effect === "jam_active" || payload.effect === "input_disabled") && payload.target === "you" && payload.durationMs) {
        setFrozenUntil(Date.now() + payload.durationMs);
        triggerFreezeHit("you");
      }
    };

    const handleUltimateEnded = (payload: {
      by: "you" | "opponent";
      target: "you" | "opponent";
      type: string;
      effect: string;
      ultimateType?: string;
      ultimateName?: string;
      ultimateCharge?: number;
      ultimateReady?: boolean;
      ultimateUsed?: boolean;
      ultimateImplemented?: boolean;
      opponentUltimateType?: string;
      opponentUltimateName?: string;
      opponentUltimateCharge?: number;
      opponentUltimateReady?: boolean;
      opponentUltimateUsed?: boolean;
      opponentUltimateImplemented?: boolean;
      titanUntil?: number;
      opponentTitanUntil?: number;
      blackoutUntil?: number;
      opponentBlackoutUntil?: number;
      flashBonusRemaining?: number;
      opponentFlashBonusRemaining?: number;
      infernoPending?: boolean;
      opponentInfernoPending?: boolean;
    }) => {
      console.log("[client] ultimateEnded received", payload);
      syncUltimateFromPayload(payload);
      setFeedback((previous) => ({
        ...previous,
        youShieldActive: (payload as { shieldActive?: boolean }).shieldActive ?? previous.youShieldActive,
        opponentShieldActive:
          (payload as { opponentShieldActive?: boolean }).opponentShieldActive ??
          previous.opponentShieldActive,
        youSlowedUntil: (payload as { slowedUntil?: number }).slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil:
          (payload as { opponentSlowedUntil?: number }).opponentSlowedUntil ??
          previous.opponentSlowedUntil
      }));

      if (payload.effect === "jam_ended" && payload.target === "you") {
        setFrozenUntil(0);
      }
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
      const youAvailable = (payload as { powerUpsAvailable?: PowerUpId[] }).powerUpsAvailable;
      const opponentAvailable = (payload as { opponentPowerUpsAvailable?: PowerUpId[] }).opponentPowerUpsAvailable;
      setFeedback((previous) => ({
        ...previous,
        youPowerUpAvailable: "powerUpAvailable" in payload ? (payload.powerUpAvailable ?? null) : previous.youPowerUpAvailable,
        youPowerUpUsed: payload.by === "you" ? true : previous.youPowerUpUsed,
        opponentPowerUpAvailable: "opponentPowerUpAvailable" in payload ? (payload.opponentPowerUpAvailable ?? null) : previous.opponentPowerUpAvailable,
        youPowerUpsAvailable: Array.isArray(youAvailable) ? youAvailable : previous.youPowerUpsAvailable,
        opponentPowerUpsAvailable: Array.isArray(opponentAvailable) ? opponentAvailable : previous.opponentPowerUpsAvailable,
        youPowerUpsUsed: Array.isArray((payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed)
          ? (payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed ?? []
          : previous.youPowerUpsUsed,
        opponentPowerUpsUsed: Array.isArray((payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed)
          ? (payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed ?? []
          : previous.opponentPowerUpsUsed,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive,
        youSlowedUntil: payload.slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil: payload.opponentSlowedUntil ?? previous.opponentSlowedUntil,
        youDoublePointsUntil: payload.doublePointsUntil ?? previous.youDoublePointsUntil,
        opponentDoublePointsUntil:
          payload.opponentDoublePointsUntil ?? previous.opponentDoublePointsUntil,
        hintText: (payload as { hintText?: string }).hintText ?? previous.hintText,
        hintUntil: (payload as { hintUntil?: number }).hintUntil ?? previous.hintUntil
      }));
      syncUltimateFromPayload(payload);

      if (payload.type === "freeze") {
        if (payload.target === "you" && payload.durationMs) {
          setFrozenUntil(Date.now() + payload.durationMs);
        }

        triggerFreezeHit(payload.target);
        soundManager.play("freezeHit");
      } else if (payload.type === "cleanse") {
        if (payload.target === "you") {
          setFrozenUntil(0);
        }
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
      const youAvailable = (payload as { powerUpsAvailable?: PowerUpId[] }).powerUpsAvailable;
      const opponentAvailable = (payload as { opponentPowerUpsAvailable?: PowerUpId[] }).opponentPowerUpsAvailable;
      setFeedback((previous) => ({
        ...previous,
        youPowerUpAvailable: "powerUpAvailable" in payload ? (payload.powerUpAvailable ?? null) : previous.youPowerUpAvailable,
        youPowerUpUsed: payload.by === "you" ? true : previous.youPowerUpUsed,
        opponentPowerUpAvailable: "opponentPowerUpAvailable" in payload ? (payload.opponentPowerUpAvailable ?? null) : previous.opponentPowerUpAvailable,
        youPowerUpsAvailable: Array.isArray(youAvailable) ? youAvailable : previous.youPowerUpsAvailable,
        opponentPowerUpsAvailable: Array.isArray(opponentAvailable) ? opponentAvailable : previous.opponentPowerUpsAvailable,
        youPowerUpsUsed: Array.isArray((payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed)
          ? (payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed ?? []
          : previous.youPowerUpsUsed,
        opponentPowerUpsUsed: Array.isArray((payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed)
          ? (payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed ?? []
          : previous.opponentPowerUpsUsed,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive,
        youSlowedUntil: payload.slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil: payload.opponentSlowedUntil ?? previous.opponentSlowedUntil,
        youDoublePointsUntil: payload.doublePointsUntil ?? previous.youDoublePointsUntil,
        opponentDoublePointsUntil:
          payload.opponentDoublePointsUntil ?? previous.opponentDoublePointsUntil,
        hintText: (payload as { hintText?: string }).hintText ?? previous.hintText,
        hintUntil: (payload as { hintUntil?: number }).hintUntil ?? previous.hintUntil
      }));
      syncUltimateFromPayload(payload);

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
      const youAvailable = (payload as { powerUpsAvailable?: PowerUpId[] }).powerUpsAvailable;
      const opponentAvailable = (payload as { opponentPowerUpsAvailable?: PowerUpId[] }).opponentPowerUpsAvailable;
      setFeedback((previous) => {
        const nextYouPU = "powerUpAvailable" in payload ? (payload.powerUpAvailable ?? null) : previous.youPowerUpAvailable;
        return {
        ...previous,
        youPowerUpAvailable: nextYouPU,
        youPowerUpUsed: !nextYouPU && !!previous.youPowerUpAvailable ? true : previous.youPowerUpUsed,
        opponentPowerUpAvailable: "opponentPowerUpAvailable" in payload ? (payload.opponentPowerUpAvailable ?? null) : previous.opponentPowerUpAvailable,
        youPowerUpsAvailable: Array.isArray(youAvailable) ? youAvailable : previous.youPowerUpsAvailable,
        opponentPowerUpsAvailable: Array.isArray(opponentAvailable) ? opponentAvailable : previous.opponentPowerUpsAvailable,
        youPowerUpsUsed: Array.isArray((payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed)
          ? (payload as { powerUpsUsed?: PowerUpId[] }).powerUpsUsed ?? []
          : previous.youPowerUpsUsed,
        opponentPowerUpsUsed: Array.isArray((payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed)
          ? (payload as { opponentPowerUpsUsed?: PowerUpId[] }).opponentPowerUpsUsed ?? []
          : previous.opponentPowerUpsUsed,
        youShieldActive: payload.shieldActive ?? previous.youShieldActive,
        opponentShieldActive: payload.opponentShieldActive ?? previous.opponentShieldActive,
        youSlowedUntil: payload.slowedUntil ?? previous.youSlowedUntil,
        opponentSlowedUntil: payload.opponentSlowedUntil ?? previous.opponentSlowedUntil,
        youDoublePointsUntil: payload.doublePointsUntil ?? previous.youDoublePointsUntil,
        opponentDoublePointsUntil:
          payload.opponentDoublePointsUntil ?? previous.opponentDoublePointsUntil,
        hintText: (payload as { hintText?: string }).hintText ?? previous.hintText,
        hintUntil: (payload as { hintUntil?: number }).hintUntil ?? previous.hintUntil
        };
      });
      syncUltimateFromPayload(payload);

      if (payload.target === "you") {
        setShieldBlockedUntil(Date.now() + 1800);
      }

      // Animate: flash on blocking player's panel + floating "BLOCKED" label
      triggerShieldBlock(payload.target);
      soundManager.play("shieldBlock");
    };

    const handleEmotePlayed = (payload: {
      roomId: string;
      emoteId: string;
      senderSocketId: string;
      clientMessageId: string;
      sentAt: number;
    }) => {
      console.log("[client] emotePlayed received", payload);
      if (currentMatchRoomIdRef.current && payload.roomId !== currentMatchRoomIdRef.current) {
        return;
      }
      const who = payload.senderSocketId === nextSocket.id ? "you" : "opponent";
      pushEmoteLabel(who, payload.emoteId, payload.clientMessageId);
    };

    /**
     * Opponent sent a typing event — show "Typing…" presence and auto-revert
     * to "thinking" after 4 s if no further events arrive.
     */
    const handleOpponentTyping = () => {
      setOpponentActivity("typing");
      if (opponentTypingTimerRef.current) {
        clearTimeout(opponentTypingTimerRef.current);
      }
      opponentTypingTimerRef.current = setTimeout(() => {
        setOpponentActivity((current) =>
          current === "typing" ? "thinking" : current
        );
        opponentTypingTimerRef.current = null;
      }, 4000);
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
      setUltimate(initialUltimate);
      setFeedback((previous) => ({
        ...previous,
        youFast: false,
        opponentFast: false,
        youPowerUpAvailable: null,
        youPowerUpUsed: false,
        opponentPowerUpAvailable: null,
        youPowerUpsAvailable: [],
        opponentPowerUpsAvailable: [],
        youPowerUpsUsed: [],
        opponentPowerUpsUsed: [],
        youShieldActive: false,
        opponentShieldActive: false,
        youSlowedUntil: 0,
        opponentSlowedUntil: 0,
        youDoublePointsUntil: 0,
        opponentDoublePointsUntil: 0,
        hintText: "",
        hintUntil: 0,
        youAnsweredCurrent: false,
        opponentAnsweredCurrent: false,
        questionWinner: null
      }));
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);
      setEmoteCooldownUntil(0);
      setEmoteLabels([]);
      seenEmoteMessageIdsRef.current.clear();
      setOpponentActivity("idle");
      if (opponentTypingTimerRef.current) {
        clearTimeout(opponentTypingTimerRef.current);
        opponentTypingTimerRef.current = null;
      }
      setGameResult({
        result,
        message:
          payload.message ??
          (result === "win" ? "You Win!" : result === "loss" ? "You Lose" : "It's a Draw"),
        ratingChange: payload.ratingChange,
        newRatings: payload.newRatings,
        peakStreak: peakYouStreakRef.current,
        opponentPeakStreak: peakOpponentStreakRef.current,
      });
      setRematchRequested(false);
      setOpponentRematchRequested(false);
      setRematchProgress({ requestedPlayers: 0, requiredPlayers: 2 });
      setStatus("finished");
      soundManager.play(result === "loss" ? "lose" : "win");
    };

    const handleRematchStatus = (payload: {
      youRequested: boolean;
      opponentRequested: boolean;
      requestedPlayers: number;
      requiredPlayers: number;
    }) => {
      setRematchRequested(payload.youRequested);
      setOpponentRematchRequested(payload.opponentRequested);
      setRematchProgress({
        requestedPlayers: payload.requestedPlayers,
        requiredPlayers: payload.requiredPlayers
      });
    };

    const handleOpponentLeft = (payload: { message?: string }) => {
      console.log("[client] opponentLeft received", payload);
      setCurrentQuestion("");
      setAnswer("");
      setCountdownValue(null);
      setFeedback(initialFeedback);
      setTimer(initialTimer);
      setUltimate(initialUltimate);
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setEmoteBarOpen(false);
      setEmoteCooldownUntil(0);
      setOpponentActivity("idle");
      if (opponentTypingTimerRef.current) {
        clearTimeout(opponentTypingTimerRef.current);
        opponentTypingTimerRef.current = null;
      }
      setEmoteLabels([]);
      seenEmoteMessageIdsRef.current.clear();
      setRematchRequested(false);
      setOpponentRematchRequested(false);
      setRematchProgress({ requestedPlayers: 0, requiredPlayers: 2 });
      setGameResult({
        result: "loss",
        message: payload.message ?? "Opponent left the game",
        peakStreak: peakYouStreakRef.current,
        opponentPeakStreak: peakOpponentStreakRef.current
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
    nextSocket.on("opponentStrike", handleOpponentStrike);
    nextSocket.on("liveLeaderboard", handleLiveLeaderboard);
    nextSocket.on("pointScored", handlePointScored);
    nextSocket.on("questionState", handleQuestionState);
    nextSocket.on("ultimateApplied", handleUltimateApplied);
    nextSocket.on("ultimateEnded", handleUltimateEnded);
    nextSocket.on("powerUpUsed", handlePowerUpUsed);
    nextSocket.on("shieldActivated", handleShieldActivated);
    nextSocket.on("shieldBlocked", handleShieldBlocked);
    nextSocket.on("emotePlayed", handleEmotePlayed);
    nextSocket.on("opponentTyping", handleOpponentTyping);
    nextSocket.on("gameOver", handleGameOver);
    nextSocket.on("rematchStatus", handleRematchStatus);
    nextSocket.on("opponentLeft", handleOpponentLeft);

    return () => {
      clearTimeout(connectionTimeout);
      if (ultimateCueTimeoutRef.current) {
        clearTimeout(ultimateCueTimeoutRef.current);
        ultimateCueTimeoutRef.current = null;
      }
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
      nextSocket.off("opponentStrike", handleOpponentStrike);
      nextSocket.off("liveLeaderboard", handleLiveLeaderboard);
      nextSocket.off("pointScored", handlePointScored);
      nextSocket.off("questionState", handleQuestionState);
      nextSocket.off("ultimateApplied", handleUltimateApplied);
      nextSocket.off("ultimateEnded", handleUltimateEnded);
      nextSocket.off("powerUpUsed", handlePowerUpUsed);
      nextSocket.off("shieldActivated", handleShieldActivated);
      nextSocket.off("shieldBlocked", handleShieldBlocked);
      nextSocket.off("emotePlayed", handleEmotePlayed);
      nextSocket.off("opponentTyping", handleOpponentTyping);
      nextSocket.off("gameOver", handleGameOver);
      nextSocket.off("rematchStatus", handleRematchStatus);
      nextSocket.off("opponentLeft", handleOpponentLeft);
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [difficulty, normalizedRoomCode, retryKey, roomJoinMode, router, topic]);

  const submitAnswer = () => {
    const trimmedAnswer = answer.trim();

    if (!socket || !trimmedAnswer || status !== "playing" || eliminated.you) {
      return;
    }

    // Reset typing throttle so next question triggers fresh emit
    lastTypingEmitRef.current = 0;

    console.log(`[client] submitAnswer emitted -> ${trimmedAnswer} token=${currentQuestionTokenRef.current}`);
    socket.emit("submitAnswer", { answer: trimmedAnswer, token: currentQuestionTokenRef.current });
    setAnswer("");
  };

  /**
   * Throttled handler for answer input changes.
   * Emits playerTyping at most once per 3 s while the input has content.
   * Never emits when the input is cleared (opponent sees nothing = cleared).
   */
  const handleAnswerChange = (value: string) => {
    setAnswer(value);

    if (!socket || status !== "playing" || eliminated.you || !value) return;

    const now = Date.now();
    if (now - lastTypingEmitRef.current > 3000) {
      socket.emit("playerTyping");
      lastTypingEmitRef.current = now;
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitAnswer();
  };

  const handlePlayAgain = () => {
    if (!socket || status !== "finished" || rematchRequested) {
      return;
    }

    setEmoteBarOpen(false);
    setRematchRequested(true);
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
    currentMatchRoomIdRef.current = null;
    router.push("/");
  };

  const handleReturnToLobby = () => {
    if (socket && roomLobby) {
      socket.emit("leaveRoom");
    }
    currentMatchRoomIdRef.current = null;
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

  const handleUsePowerUp = (_type: PowerUpId) => {
    if (!POWERUPS_ENABLED) return; // Powerups disabled — ultimates are the only active ability
    if (!socket || status !== "playing") return;
    if (!feedback.youPowerUpsAvailable.includes(_type)) return;
    socket.emit("usePowerUp", { type: _type });
  };

  const handleActivateUltimate = () => {
    if (!socket || status !== "playing") {
      return;
    }

    if (!ultimate.ready || ultimate.used || !ultimate.implemented || youEliminated) {
      return;
    }

    socket.emit("activateUltimate");
  };

  const EMOTE_COOLDOWN_MS = 1500;
  const EMOTE_BURST_WINDOW_MS = 5000;
  const EMOTE_BURST_LIMIT = 3;

  const handleSendEmote = (emoteId: string) => {
    if (!socket || status !== "playing" || emoteCooldownUntil > Date.now()) {
      return;
    }

    // Client-side burst guard: max 3 emotes per 5 seconds
    const now = Date.now();
    emoteTimestampsRef.current = emoteTimestampsRef.current.filter(
      (t) => now - t < EMOTE_BURST_WINDOW_MS
    );
    if (emoteTimestampsRef.current.length >= EMOTE_BURST_LIMIT) {
      return;
    }
    emoteTimestampsRef.current.push(now);

    // Optimistic UI — show immediately before server confirms
    const clientMessageId = `${socket.id}:${now}:${Math.random().toString(36).slice(2, 9)}`;
    const seen = seenEmoteMessageIdsRef.current;
    seen.add(clientMessageId);
    if (seen.size > 300) {
      const oldest = seen.values().next().value;
      if (oldest) {
        seen.delete(oldest);
      }
    }
    const emote = getEmoteById(emoteId);
    const id = ++emoteIdRef.current;
    setEmoteLabels((previous) => [
      ...previous,
      { id, who: "you", icon: emote.icon, label: emote.label }
    ]);
    setTimeout(() => {
      setEmoteLabels((previous) => previous.filter((item) => item.id !== id));
    }, 2000);

    setEmoteCooldownUntil(now + EMOTE_COOLDOWN_MS);
    setEmoteBarOpen(false);
    socket.emit("sendEmote", { emoteId, clientMessageId });
  };

  const isFinished = status === "finished";
  const isCountdown = status === "countdown";
  const isRoomLobby = status === "room-lobby";
  const isOpponentLeft = status === "opponent-left";
  const isWaitingState = status === "connecting" || status === "waiting";
  const isActiveGameplay = status === "playing";
  const youEliminated = eliminated.you;
  const opponentEliminated = eliminated.opponent;
  const emoteCoolingDown = emoteCooldownUntil > Date.now();
  const isJamActive = ultimate.blackoutUntil > Date.now();
  const isRapidFireActive = ultimate.overclockUntil > Date.now();
  const isOpponentRapidFireActive = ultimate.opponentOverclockUntil > Date.now();
  const isGuardianShieldActive = ultimate.fortressUntil > Date.now() && ultimate.fortressBlocksRemaining > 0;
  const isOpponentGuardianShieldActive =
    ultimate.opponentFortressUntil > Date.now() && ultimate.opponentFortressBlocksRemaining > 0;
  const canUseUltimate =
    isActiveGameplay && ultimate.ready && !ultimate.used && ultimate.implemented && !youEliminated;
  const roomPlayerCount = roomLobby?.players.length ?? 0;
  const roomReady = roomPlayerCount === 2;
  const rematchCtaLabel = rematchRequested
    ? "Waiting for opponent..."
    : opponentRematchRequested
      ? "Accept Rematch"
      : "Play Again";
  const rematchStatusText = rematchRequested && !opponentRematchRequested
    ? "Waiting for opponent to accept rematch..."
    : !rematchRequested && opponentRematchRequested
      ? "Opponent wants a rematch."
      : rematchProgress.requestedPlayers > 0 && rematchProgress.requestedPlayers < rematchProgress.requiredPlayers
        ? `${rematchProgress.requestedPlayers}/${rematchProgress.requiredPlayers} players ready`
        : " ";
  const timerLabel = `00:${String(Math.max(0, timer.secondsLeft)).padStart(2, "0")}`;
  const now = Date.now();

  /**
   * Consolidated in-match status display.
   *
   * Previously 13 individually-conditional <p> elements stacked inside the
   * question card, causing the card to grow/shrink by up to ~300 px as
   * effects toggled on and off — the largest source of layout shift.
   *
   * Now: a single prioritised object drives a fixed-height reserved slot.
   * The card height stays constant regardless of which effects are active.
   */
  const primaryStatus = isActiveGameplay
    ? isJamActive
      ? { text: "Jam Active",       color: "text-violet-200",  large: false }
      : isRapidFireActive
      ? { text: "Rapid Fire",       color: "text-cyan-200",    large: false }
      : isGuardianShieldActive
      ? { text: "Guardian Shield",  color: "text-teal-200",    large: false }
      : youEliminated
      ? { text: "Eliminated ✕",     color: "text-rose-300",    large: false }
      : feedback.youAnsweredCurrent
      ? { text: "Waiting...",        color: "text-slate-400",   large: false }
      : null
    : null;

  const secondaryStatus = (() => {
    if (!isActiveGameplay) return null;
    const parts = [
      isOpponentRapidFireActive      && "Opp. Rapid Fire",
      isOpponentGuardianShieldActive && "Opp. Guardian Shield",
      !youEliminated && opponentEliminated && "Opponent Eliminated",
      !feedback.youAnsweredCurrent && feedback.opponentAnsweredCurrent && "Opponent answered — still your turn",
    ].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join("  |  ") : null;
  })();

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
  ];

  // Emotes are rendered by EmoteDisplay (separate from FloatingLabel)
  const youEmoteItems = emoteLabels.filter((item) => item.who === "you");
  const opponentEmoteItems = emoteLabels.filter((item) => item.who === "opponent");
  const renderPowerUpGrid = ({
    readyIds,
    usedIds,
    tone,
    onUse
  }: {
    readyIds: PowerUpId[];
    usedIds: PowerUpId[];
    tone: "you" | "opponent";
    onUse?: (id: PowerUpId) => void;
  }) => (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Powerups
      </div>
      <div className="grid grid-cols-2 gap-2">
        {POWER_UPS.map((powerUp) => {
          const ready = readyIds.includes(powerUp.id);
          const used = usedIds.includes(powerUp.id);
          const clickable = Boolean(onUse) && ready;
          const readyClass =
            tone === "you"
              ? "border-sky-400/40 bg-sky-500/10 text-sky-100 hover:border-sky-300"
              : "border-rose-400/35 bg-rose-500/10 text-rose-100";

          return (
            <button
              key={powerUp.id}
              type="button"
              onClick={() => onUse?.(powerUp.id)}
              disabled={!clickable}
              aria-label={`${powerUp.name} ${ready ? "ready" : used ? "used" : "unavailable"}`}
              className={`min-h-[3.4rem] rounded-xl border px-2 py-1.5 text-left text-[11px] transition ${
                ready
                  ? readyClass
                  : used
                  ? "border-slate-700 bg-slate-900/60 text-slate-500"
                  : "border-slate-800 bg-slate-950/70 text-slate-400"
              } ${clickable ? "" : "cursor-default"}`}
            >
              <p className={`truncate font-semibold ${used ? "line-through decoration-slate-600" : ""}`}>
                {powerUp.icon} {powerUp.name}
              </p>
              <p className="mt-0.5 uppercase tracking-[0.18em] text-[10px]">
                {ready ? "Ready" : used ? "Used" : "Unavailable"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const getUltimateStatus = (
    type: string,
    side: "you" | "opponent"
  ): { label: string; sublabel: string; progress: number | null; accent: string } => {
    const normalizedType = normalizeUltimateType(type);
    const vfx = ULTIMATE_VFX[normalizedType];

    if (normalizedType === "rapid_fire") {
      const until = side === "you" ? ultimate.overclockUntil : ultimate.opponentOverclockUntil;
      const active = until > now;
      const total = vfx.durationMs ?? 3000;
      const progress = active ? Math.max(0, Math.min(1, (until - now) / total)) : 0;
      return {
        label: active ? "Rapid Fire Active" : "Rapid Fire",
        sublabel: active ? "Speed bonus live" : "Stand by",
        progress: active ? progress : null,
        accent: "bg-amber-400"
      };
    }

    if (normalizedType === "jam") {
      const until = side === "you" ? ultimate.blackoutUntil : ultimate.opponentBlackoutUntil;
      const active = until > now;
      const total = vfx.durationMs ?? 2000;
      const progress = active ? Math.max(0, Math.min(1, (until - now) / total)) : 0;
      return {
        label: active ? "Jam Active" : "Jam Ready",
        sublabel: active ? "Input disruption online" : "Stand by",
        progress: active ? progress : null,
        accent: "bg-violet-400"
      };
    }

    if (normalizedType === "shield") {
      const until = side === "you" ? ultimate.fortressUntil : ultimate.opponentFortressUntil;
      const blocks = side === "you" ? ultimate.fortressBlocksRemaining : ultimate.opponentFortressBlocksRemaining;
      const active = until > now && blocks > 0;
      const total = vfx.durationMs ?? 7000;
      const progress = active ? Math.max(0, Math.min(1, (until - now) / total)) : 0;
      return {
        label: active ? "Shield Active" : "Shield",
        sublabel: `Blocks ${blocks}`,
        progress: active ? progress : null,
        accent: "bg-cyan-400"
      };
    }

    const armed = side === "you" ? ultimate.infernoPending : ultimate.opponentInfernoPending;
    return {
      label: armed ? "Double Armed" : "Double",
      sublabel: armed ? "Next correct +2" : "Waiting",
      progress: null,
      accent: "bg-rose-400"
    };
  };

  const localUltimateStatus = getUltimateStatus(ultimate.type, "you");
  const opponentUltimateStatus = getUltimateStatus(ultimate.opponentType, "opponent");

  return (
    <section className="relative w-full max-w-5xl rounded-[2rem] border border-white/10 bg-slate-950/70 p-3 shadow-glow backdrop-blur sm:p-5 md:p-7 lg:p-8">
      {/* Game-over overlays (win glow / lose vignette) */}
      <GameOverOverlay result={isFinished ? (gameResult?.result ?? null) : null} />
      <UltimateActivationOverlay cue={ultimateCue} />

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

      <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
        <div className="space-y-2.5 sm:space-y-3">
          <div className="flex min-h-[1.5rem] flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.2em] text-sky-300">
            <span>Topic: {topicLabel}</span>
            <span>Difficulty: {difficultyLabel}</span>
            <span>Time: {timerLabel}</span>
          </div>

          <h1 className="min-h-[2.5rem] text-2xl font-black tracking-tight text-white sm:min-h-[3rem] sm:text-3xl md:min-h-[3.5rem] md:text-4xl lg:text-5xl">
            {statusHeading[status]}
          </h1>

          <p className="min-h-[1.5rem] text-sm text-slate-300 sm:min-h-[1.75rem] sm:text-base md:text-lg">{statusCopy[status]}</p>
          <div className="mt-2 min-h-[2.75rem]">
            {isActiveGameplay ? (
              <EmoteBar
                emotes={EMOTES}
                open={emoteBarOpen}
                onToggle={() => setEmoteBarOpen((o) => !o)}
                onSend={handleSendEmote}
                coolingDown={emoteCoolingDown}
                cooldownUntil={emoteCooldownUntil}
                disabled={!isActiveGameplay}
              />
            ) : (
              <div aria-hidden="true" className="h-11" />
            )}
          </div>
        </div>

        {/* Player panels */}
        <div className="grid gap-3 rounded-3xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] md:items-stretch md:gap-4 md:p-5 lg:p-6">
          {/* You */}
          <div className="relative grid min-h-[22rem] grid-rows-[auto_2.5rem_minmax(8.5rem,auto)] gap-2 sm:min-h-[23rem] sm:gap-3">
            <PlayerPanel
              label={yourName}
              score={scores.you}
              rating={ratings.you}
              strikes={strikes.you}
              eliminated={youEliminated}
              avatar={yourAvatar}
              streakLabel={isActiveGameplay ? yourStreakLabel : null}
              streakLevel={isActiveGameplay ? yourStreakLevel : null}
              fastActive={isActiveGameplay && feedback.youFast}
              highlighted={
                isActiveGameplay &&
                (feedback.youFast || !!yourStreakLabel)
              }
              pulseKey={feedback.youPulseKey}
              scoreGlowKey={animState.youScoreGlowKey}
              shieldBlockFlashKey={animState.youShieldBlockFlashKey}
              powerUpGlowKey={animState.youPowerUpGlowKey}
              ultimateFxKey={youUltimateFxKey}
              ultimateFxType={youUltimateFxType}
            />
            {/* Symmetry spacer - matches OpponentPresence min-height in opponent column */}
            <div className="min-h-[2.5rem]" aria-hidden="true" />
            <div
              className={`min-h-[8.5rem] rounded-xl border bg-slate-950/70 px-3 py-2 ${
                canUseUltimate ? "border-emerald-500/40" : "border-slate-800"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400">
                <span>{ultimate.name}</span>
                <span>{Math.round(ultimate.charge)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
                <motion.div
                  className={`h-full ${ultimate.ready ? "bg-emerald-400" : "bg-sky-400"}`}
                  animate={{ width: `${Math.max(0, Math.min(100, ultimate.charge))}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <p className="mt-1 h-8 overflow-hidden text-[10px] text-slate-400">
                {ultimate.description}
              </p>
              <div className="mt-1 min-h-[1.9rem] rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300">{localUltimateStatus.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{localUltimateStatus.sublabel}</p>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <motion.div
                  className={`h-full ${localUltimateStatus.accent}`}
                  animate={{
                    width: `${Math.round(((localUltimateStatus.progress ?? 0) * 100))}%`,
                    opacity: localUltimateStatus.progress === null ? 0 : 1
                  }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                {ultimate.used ? "Used" : ultimate.ready ? "Ready" : "Charging"}
              </p>
              <Button
                className={`mt-2 w-full py-2 text-xs ${canUseUltimate ? "shadow-lg shadow-emerald-500/20" : ""}`}
                onClick={handleActivateUltimate}
                disabled={!canUseUltimate}
              >
                {ultimate.used
                  ? "Ultimate Used"
                  : !ultimate.implemented
                  ? "Ultimate Soon"
                  : ultimate.ready
                  ? "Ready - Activate Ultimate"
                  : `Charging ${Math.round(ultimate.charge)}%`}
              </Button>
            </div>
            <FloatingLabel items={youFloatingItems} />
            <EmoteDisplay items={youEmoteItems} />
          </div>

          <div className="flex items-center justify-center self-center pb-0 text-xs font-semibold uppercase tracking-[0.35em] text-slate-500 sm:text-sm">
            vs
          </div>

          {/* Opponent */}
          <div className="relative grid min-h-[22rem] grid-rows-[auto_2.5rem_minmax(8.5rem,auto)] gap-2 sm:min-h-[23rem] sm:gap-3">
            <PlayerPanel
              label={opponentName}
              score={scores.opponent}
              rating={ratings.opponent}
              strikes={strikes.opponent}
              eliminated={opponentEliminated}
              avatar={opponentAvatar}
              streakLabel={isActiveGameplay ? opponentStreakLabel : null}
              streakLevel={isActiveGameplay ? opponentStreakLevel : null}
              fastActive={isActiveGameplay && feedback.opponentFast}
              highlighted={
                isActiveGameplay &&
                (feedback.opponentFast || !!opponentStreakLabel)
              }
              pulseKey={feedback.opponentPulseKey}
              scoreGlowKey={animState.opponentScoreGlowKey}
              shieldBlockFlashKey={animState.opponentShieldBlockFlashKey}
              powerUpGlowKey={animState.opponentPowerUpGlowKey}
              ultimateFxKey={opponentUltimateFxKey}
              ultimateFxType={opponentUltimateFxType}
            />
            <OpponentPresence
              activity={opponentActivity}
              opponentAnswered={feedback.opponentAnsweredCurrent}
              youAnswered={feedback.youAnsweredCurrent}
              isActive={isActiveGameplay}
            />
            <div
              className={`min-h-[8.5rem] rounded-xl border bg-slate-950/70 px-3 py-2 ${
                ultimate.opponentReady && !ultimate.opponentUsed ? "border-rose-500/40" : "border-slate-800"
              }`}
            >
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400">
                <span>{ultimate.opponentName}</span>
                <span>{Math.round(ultimate.opponentCharge)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
                <motion.div
                  className={`h-full ${ultimate.opponentReady ? "bg-rose-400" : "bg-slate-500"}`}
                  animate={{ width: `${Math.max(0, Math.min(100, ultimate.opponentCharge))}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <div className="mt-1 min-h-[1.9rem] rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-left">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-300">{opponentUltimateStatus.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{opponentUltimateStatus.sublabel}</p>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <motion.div
                  className={`h-full ${opponentUltimateStatus.accent}`}
                  animate={{
                    width: `${Math.round(((opponentUltimateStatus.progress ?? 0) * 100))}%`,
                    opacity: opponentUltimateStatus.progress === null ? 0 : 1
                  }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <p className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-slate-400">
                {ultimate.opponentUsed
                  ? "Used"
                  : !ultimate.opponentImplemented
                  ? "Soon"
                  : ultimate.opponentReady
                  ? "Ready"
                  : "Charging"}
              </p>
            </div>
            <FloatingLabel items={opponentFloatingItems} />
            <EmoteDisplay items={opponentEmoteItems} />
            {/* Emote flash: brief rose glow when opponent taunts */}
            {opponentEmoteFlashKey > 0 && (
              <motion.div
                key={`oef-${opponentEmoteFlashKey}`}
                className="pointer-events-none absolute inset-0 z-10 rounded-3xl"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.3, 0] }}
                transition={{ duration: 0.65, ease: "easeOut" }}
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 30%, rgba(251,113,133,0.55) 0%, transparent 72%)",
                }}
              />
            )}
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
              <div className="relative rounded-[1.75rem] border border-slate-800 bg-slate-900/80 p-4 text-center transition-all duration-300 sm:p-6">
                {isActiveGameplay ? (
                  <div className="absolute right-3 top-3 rounded-full border border-slate-700 bg-slate-950/80 px-2 py-1 text-sm font-black tracking-[0.15em] text-sky-200 sm:right-5 sm:top-5 sm:px-4 sm:py-2 sm:text-lg sm:tracking-[0.2em]">
                    {timerLabel}
                  </div>
                ) : null}
                <p className={`text-sm uppercase tracking-[0.3em] text-slate-500 ${isActiveGameplay ? "pr-14 sm:pr-0" : ""}`}>
                  {isCountdown ? "Countdown" : isWaitingState ? "Match Status" : "Current Question"}
                </p>

                <div className="mt-3 flex min-h-[6.5rem] items-center justify-center sm:min-h-[7.5rem]">
                  {isCountdown ? (
                    <CountdownDisplay value={countdownValue} />
                  ) : (
                    <p className="max-h-[7rem] overflow-hidden text-xl font-black tracking-tight text-white sm:max-h-[8rem] sm:text-3xl md:max-h-[9rem] md:text-5xl">
                      {isWaitingState ? statusHeading[status] : currentQuestion}
                    </p>
                  )}
                </div>

                {/* Fixed-height status slot — never causes layout shift */}
                <div className="mt-3 flex min-h-[3rem] flex-col items-center justify-center gap-0.5">
                  {primaryStatus ? (
                    <p
                      className={`font-black uppercase tracking-[0.22em] ${
                        primaryStatus.large ? "text-xl sm:text-2xl" : "text-sm"
                      } ${primaryStatus.color}`}
                    >
                      {primaryStatus.text}
                    </p>
                  ) : null}
                  {secondaryStatus ? (
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px]">
                      {secondaryStatus}
                    </p>
                  ) : null}
                </div>

                {/* Frost burst overlay */}
                <FrostBurst active={animState.frostBurstActive} />
                <SnowfallOverlay active={animState.snowfallActive} />
              </div>
            </motion.div>

            <div className="min-h-[9.5rem]">
              {status === "playing" ? (
                <form className="space-y-3 transition-all duration-300" onSubmit={handleSubmit}>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium uppercase tracking-[0.2em] text-slate-400">
                      Your Answer
                    </span>
                    <input
                      type="text"
                      value={answer}
                      onChange={(event) => handleAnswerChange(event.target.value)}
                      placeholder={
                        isJamActive
                          ? "Jammed..."
                          : youEliminated
                          ? "Eliminated"
                          : feedback.youAnsweredCurrent
                          ? "Waiting for opponent..."
                          : "Type your answer and press Enter"
                      }
                      disabled={isJamActive || youEliminated || feedback.youAnsweredCurrent}
                      className="h-14 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/35 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </label>

                  <Button className="h-12 w-full" type="submit" disabled={!answer.trim() || isJamActive || youEliminated || feedback.youAnsweredCurrent}>
                    Submit Answer
                  </Button>
                </form>
              ) : (
                <div aria-hidden="true" className="h-[9.5rem]" />
              )}
            </div>
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

              <div className="mt-4 min-h-[1.25rem] text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {rematchStatusText}
              </div>
              <div className="mt-6 grid gap-3 sm:mt-8 md:grid-cols-2">
                <Button
                  className="w-full min-h-[2.75rem]"
                  onClick={handlePlayAgain}
                  disabled={rematchRequested}
                >
                  {rematchCtaLabel}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full min-h-[2.75rem]"
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
