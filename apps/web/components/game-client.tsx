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
import { getAvatar, normalizeAvatarId, type AvatarId } from "@/lib/avatars";
import type { Avatar } from "@/lib/avatars";
import { EMOTES, getEmoteById } from "@/lib/emotes";
import {
  normalizeStreakEffectId,
  normalizeEmotePackId,
  getEmotePack,
  type StreakEffectId,
  type EmotePackId,
} from "@/lib/cosmetics";
import { getPowerUpMeta, POWER_UPS, type PowerUpId } from "@/lib/powerups";
import { MatchChampionCard } from "@/components/match-champion-card";
import { MatchResultPanel } from "@/components/MatchResultPanel";
import type { MatchRewardsClaimResponse } from "@/lib/match-rewards";

// Feature flag — set to true to re-enable the powerup system in live matches.
// While false, powerup UI is hidden and powerup socket events are no-ops.
const POWERUPS_ENABLED = false;
import { useGameAnimations } from "@/hooks/useGameAnimations";
import { FrostBurst } from "@/components/animations/FrostBurst";
import { FloatingLabel } from "@/components/animations/FloatingLabel";
import type { FloatingLabelItem } from "@/components/animations/FloatingLabel";
import { CountdownDisplay } from "@/components/animations/CountdownDisplay";
import { GameOverOverlay } from "@/components/animations/GameOverOverlay";
import { SnowfallOverlay } from "@/components/animations/SnowfallOverlay";
import { EmoteBar } from "@/components/EmoteBar";
import { EmoteDisplay, type EmoteDisplayItem } from "@/components/EmoteDisplay";
import { OpponentPresence, type OpponentActivity } from "@/components/OpponentPresence";
import { QuestionContent } from "@/components/question-content";
import { WorkingScratchpad } from "@/components/working-scratchpad";
import { UltimateAbilityButton } from "@/components/ultimate-ability-button";
import type { DuelQuestion } from "@/lib/question-model";
import {
  UltimateActivationOverlay,
  type UltimateActivationCue
} from "@/components/animations/UltimateActivationOverlay";
import { BattlefieldEffects } from "@/components/animations/BattlefieldEffects";
import { UltimateCombatFxLayer, type UltimateFxSnapshot } from "@/components/animations/UltimateCombatFxLayer";
import { ULTIMATE_VFX, normalizeUltimateType, type UltimateType } from "@/lib/ultimate-vfx";
import { cn } from "@/lib/utils";

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

type HitEffectId = "none" | "lightning_strike" | "fire_burst" | "pixel_glitch";
type AnswerFeedback = {
  key: number;
  kind: "correct" | "wrong";
  option?: string;
  text: string;
};
type QuestionFlash = {
  key: number;
  kind: "correct" | "wrong" | "new";
};
type SpeedTier = "normal" | "fast" | "lightning";
type MomentCallout = {
  key: number;
  text: string;
  side?: "you" | "opponent" | "center";
  tone: "cyan" | "rose" | "amber" | "violet";
};

const SPEED_THRESHOLDS_MS = {
  lightning: 1000,
  fast: 1500,
} as const;

const STREAK_TIERS = [
  { min: 7, label: "DOMINATING", tone: "violet" },
  { min: 5, label: "UNSTOPPABLE", tone: "amber" },
  { min: 3, label: "ON FIRE", tone: "rose" },
  { min: 2, label: "COMBO", tone: "cyan" },
] as const;

const LOW_HP_THRESHOLD = 25;
const LAST_STAND_HP = 15;
const FINISH_THEM_HP = 10;
const CLUTCH_HP = 20;
const MOMENT_CALLOUT_MS = 1050;

function normalizeHitEffectId(value: string | null | undefined): HitEffectId {
  return value === "lightning_strike" || value === "fire_burst" || value === "pixel_glitch" ? value : "none";
}

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
  ultimateQuestionsLeft: number;
  opponentUltimateQuestionsLeft: number;
  ultimateSecondsLeft: number;
  opponentUltimateSecondsLeft: number;
  wildfireStacks: number;
  opponentWildfireStacks: number;
  visibilityMaskActive: boolean;
  titanUntil: number;
  opponentTitanUntil: number;
  blackoutUntil: number;
  opponentBlackoutUntil: number;
  shadowCorruptUntil: number;
  opponentShadowCorruptUntil: number;
  shadowCorruptStacks: number;
  opponentShadowCorruptStacks: number;
  architectUntil: number;
  opponentArchitectUntil: number;
  architectMarks: number;
  opponentArchitectMarks: number;
  architectSequenceStreak: number;
  opponentArchitectSequenceStreak: number;
  architectNodes: number;
  opponentArchitectNodes: number;
  architectReady: boolean;
  opponentArchitectReady: boolean;
  titanOverpowerUntil: number;
  opponentTitanOverpowerUntil: number;
  titanStreak: number;
  opponentTitanStreak: number;
  titanBreakArmed: boolean;
  opponentTitanBreakArmed: boolean;
  titanRecoveryUntil: number;
  opponentTitanRecoveryUntil: number;
  titanRecovering: boolean;
  opponentTitanRecovering: boolean;
  titanDamageReduction: number;
  opponentTitanDamageReduction: number;
  overclockUntil: number;
  opponentOverclockUntil: number;
  fortressUntil: number;
  opponentFortressUntil: number;
  fortressBlocksRemaining: number;
  opponentFortressBlocksRemaining: number;
  fortressStoredDamage: number;
  opponentFortressStoredDamage: number;
  flashBonusRemaining: number;
  opponentFlashBonusRemaining: number;
  novaBonusRemaining: number;
  opponentNovaBonusRemaining: number;
  infernoPending: boolean;
  infernoPendingUntil: number;
  opponentInfernoPending: boolean;
  opponentInfernoPendingUntil: number;
  flashOverclockStacks: number;
  opponentFlashOverclockStacks: number;
  jammed: boolean;
  opponentJammed: boolean;
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


const initialTimer: TimerState = {
  secondsLeft: 60
};

const initialUltimate: UltimateState = {
  type: "rapid_fire",
  name: "Overclock",
  description: "",
  charge: 0,
  ready: false,
  used: false,
  implemented: true,
  opponentType: "rapid_fire",
  opponentName: "Overclock",
  opponentCharge: 0,
  opponentReady: false,
  opponentUsed: false,
  opponentImplemented: true,
  ultimateQuestionsLeft: 0,
  opponentUltimateQuestionsLeft: 0,
  ultimateSecondsLeft: 0,
  opponentUltimateSecondsLeft: 0,
  wildfireStacks: 0,
  opponentWildfireStacks: 0,
  visibilityMaskActive: false,
  titanUntil: 0,
  opponentTitanUntil: 0,
  blackoutUntil: 0,
  opponentBlackoutUntil: 0,
  shadowCorruptUntil: 0,
  opponentShadowCorruptUntil: 0,
  shadowCorruptStacks: 0,
  opponentShadowCorruptStacks: 0,
  architectUntil: 0,
  opponentArchitectUntil: 0,
  architectMarks: 0,
  opponentArchitectMarks: 0,
  architectSequenceStreak: 0,
  opponentArchitectSequenceStreak: 0,
  architectNodes: 0,
  opponentArchitectNodes: 0,
  architectReady: false,
  opponentArchitectReady: false,
  titanOverpowerUntil: 0,
  opponentTitanOverpowerUntil: 0,
  titanStreak: 0,
  opponentTitanStreak: 0,
  titanBreakArmed: false,
  opponentTitanBreakArmed: false,
  titanRecoveryUntil: 0,
  opponentTitanRecoveryUntil: 0,
  titanRecovering: false,
  opponentTitanRecovering: false,
  titanDamageReduction: 0,
  opponentTitanDamageReduction: 0,
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
  infernoPendingUntil: 0,
  opponentInfernoPending: false,
  opponentInfernoPendingUntil: 0,
  flashOverclockStacks: 0,
  opponentFlashOverclockStacks: 0,
  fortressStoredDamage: 0,
  opponentFortressStoredDamage: 0,
  jammed: false,
  opponentJammed: false
};

type UltimateToastState = {
  id: number;
  text: string;
  by: "you" | "opponent";
};

function buildUltimateIdentityFromAvatars(yourAvatarId: AvatarId, opponentAvatarId: AvatarId): Pick<
  UltimateState,
  "type" | "name" | "description" | "implemented" | "opponentType" | "opponentName" | "opponentImplemented"
> {
  const yourAvatar = getAvatar(yourAvatarId);
  const opponentAvatar = getAvatar(opponentAvatarId);
  return {
    type: yourAvatar.ultimateId,
    name: yourAvatar.ultimateName,
    description: yourAvatar.ultimateDescription,
    implemented: true,
    opponentType: opponentAvatar.ultimateId,
    opponentName: opponentAvatar.ultimateName,
    opponentImplemented: true,
  };
}

type ServerAvatarSnapshot = Pick<
  Avatar,
  "id" | "emoji" | "ultimateId" | "ultimateName" | "ultimateDescription"
>;

function isServerAvatarSnapshot(value: unknown): value is ServerAvatarSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ServerAvatarSnapshot>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.emoji === "string" &&
    typeof candidate.ultimateId === "string" &&
    typeof candidate.ultimateName === "string" &&
    typeof candidate.ultimateDescription === "string"
  );
}

function buildUltimateIdentityFromServerAvatars(
  yourAvatar: ServerAvatarSnapshot,
  opponentAvatar: ServerAvatarSnapshot
): Pick<
  UltimateState,
  "type" | "name" | "description" | "implemented" | "opponentType" | "opponentName" | "opponentImplemented"
> {
  return {
    type: yourAvatar.ultimateId,
    name: yourAvatar.ultimateName,
    description: yourAvatar.ultimateDescription,
    implemented: true,
    opponentType: opponentAvatar.ultimateId,
    opponentName: opponentAvatar.ultimateName,
    opponentImplemented: true,
  };
}

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

const FINAL_PHASE_SECONDS = 10;
const CLUTCH_SECONDS = 3;
const CLOSE_SCORE_DELTA = 2;

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

/**
 * Calculate HP damage from a scored point.
 * Base 8 per point + bonuses for fast answer and streak level.
 */
function calcDamage(points: number, speedTier: SpeedTier, streak: number): number {
  if (points <= 0) return 0;
  const base = points * 8;
  const fastBonus = speedTier === "lightning" ? 6 : speedTier === "fast" ? 4 : 0;
  const streakBonus = streak >= 5 ? 4 : streak >= 3 ? 2 : 0;
  return base + fastBonus + streakBonus;
}

function normalizeSpeedTier(value: unknown, fallbackFast = false): SpeedTier {
  if (value === "lightning" || value === "fast" || value === "normal") return value;
  return fallbackFast ? "fast" : "normal";
}

function getStreakTier(streak: number) {
  return STREAK_TIERS.find((tier) => streak >= tier.min) ?? null;
}

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

type TimeoutDecisionPromptState = {
  open: boolean;
  token: number;
};

type SocketRecoveryState = {
  active: boolean;
  message: string;
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
  const statusRef = useRef<GameStatus>("connecting");
  const [socketRecovery, setSocketRecovery] = useState<SocketRecoveryState>({
    active: false,
    message: ""
  });
  const [scores, setScores] = useState<ScoreState>(initialScores);
  const [ratings, setRatings] = useState<RatingState>(initialRatings);
  const [eliminated, setEliminated] = useState({ you: false, opponent: false });
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const [ultimate, setUltimate] = useState<UltimateState>(initialUltimate);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedback);
  const feedbackRef = useRef(initialFeedback);
  const scoresRef = useRef(initialScores);
  const ultimateRef = useRef(initialUltimate);
  const [currentQuestion, setCurrentQuestion] = useState("Waiting for the first question...");
  const [currentQuestionData, setCurrentQuestionData] = useState<DuelQuestion | null>(null);
  const [questionMotionKey, setQuestionMotionKey] = useState(0);
  const [questionFlash, setQuestionFlash] = useState<QuestionFlash | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
  const [momentCallout, setMomentCallout] = useState<MomentCallout | null>(null);
  const [workpadOpen, setWorkpadOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [timeoutDecisionPrompt, setTimeoutDecisionPrompt] = useState<TimeoutDecisionPromptState>({
    open: false,
    token: 0
  });
  const answerInputRef = useRef<HTMLInputElement | null>(null);
  const lastSubmittedAnswerRef = useRef("");
  const answerFeedbackIdRef = useRef(0);
  const momentCalloutIdRef = useRef(0);
  const lowHpCalloutRefs = useRef({
    youLastStand: false,
    opponentLastStand: false,
    finishThem: false,
    clutch: false,
  });
  const [focusPulseKey, setFocusPulseKey] = useState(0);
  const [yourName, setYourName] = useState("You");
  const [opponentName, setOpponentName] = useState("Opponent");
  const [yourAvatar, setYourAvatar] = useState("🦊");
  const [opponentAvatar, setOpponentAvatar] = useState("🦊");
  const [yourAvatarId, setYourAvatarId] = useState<AvatarId>("flash");
  const [opponentAvatarId, setOpponentAvatarId] = useState<AvatarId>("flash");
  const [countdownValue, setCountdownValue] = useState<string | null>(null);
  const [frozenUntil, setFrozenUntil] = useState(0);
  const [shieldBlockedUntil, setShieldBlockedUntil] = useState(0);
  /** Server `newQuestion.inputLockedUntil` — Shadow Neural Jam input lock (epoch ms). */
  const [neuralInputUnlockAt, setNeuralInputUnlockAt] = useState(0);
  const [emoteBarOpen, setEmoteBarOpen] = useState(false);
  const [emoteCooldownUntil, setEmoteCooldownUntil] = useState(0);
  const [emoteLabels, setEmoteLabels] = useState<EmoteDisplayItem[]>([]);
  const [youCombatEvents, setYouCombatEvents] = useState<FloatingLabelItem[]>([]);
  const [opponentCombatEvents, setOpponentCombatEvents] = useState<FloatingLabelItem[]>([]);
  const [ultimateToast, setUltimateToast] = useState<UltimateToastState | null>(null);
  const emoteIdRef = useRef(0);
  const combatEventIdRef = useRef(0);
  const ultimateToastIdRef = useRef(0);
  const emoteTimestampsRef = useRef<number[]>([]);
  const seenEmoteMessageIdsRef = useRef<Set<string>>(new Set());
  const currentMatchRoomIdRef = useRef<string | null>(null);
  /** Number of questions answered correctly by local player this match. */
  const correctAnswersRef = useRef(0);
  /** Unique token for this match — roomId for PvP, client-generated UUID for AI. */
  const matchTokenRef = useRef<string | null>(null);
  /** Rewards claimed after game-over. */
  const [matchRewards, setMatchRewards] = useState<MatchRewardsClaimResponse | null>(null);
  const [opponentEmoteFlashKey, setOpponentEmoteFlashKey] = useState(0);
  /** Token (server-side generation counter) of the question currently on screen.
   *  Sent back with every submitAnswer so the server can reject stale submissions. */
  const currentQuestionTokenRef = useRef(0);
  const [viewportState, setViewportState] = useState({
    width: 0,
    height: 0,
    keyboardOpen: false,
    compact: false,
    cramped: false,
    reducedMotion: false,
    /** True on tablet/laptop landscape where side-by-side workpad layout fits. */
    tabletLandscape: false,
    /** True on tablet portrait where bottom-drawer workpad makes sense. */
    tabletPortrait: false,
    /** True on narrow mobile where we use a floating workpad button. */
    mobileLayout: false,
  });
  const [workpadSheetOpen, setWorkpadSheetOpen] = useState(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

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
  const [roomStartPending, setRoomStartPending] = useState(false);
  const [copyRoomPending, setCopyRoomPending] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [ultimateActivating, setUltimateActivating] = useState(false);
  const ultimateActivateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimateReadySoundRef = useRef({ you: false, opponent: false });
  const [ultReadyCueKey, setUltReadyCueKey] = useState({ you: 0, opponent: 0 });
  const [gameResult, setGameResult] = useState<{
    result: "win" | "loss" | "draw";
    message: string;
    ratingChange?: RatingState;
    newRatings?: RatingState;
    peakStreak: number;
    opponentPeakStreak: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateViewportState = () => {
      const visualViewport = window.visualViewport;
      const width = Math.round(visualViewport?.width ?? window.innerWidth);
      const height = Math.round(visualViewport?.height ?? window.innerHeight);
      const baselineHeight = Math.max(window.innerHeight, height);
      const keyboardOpen = baselineHeight - height > 160;
      const compact = height < 820 || width < 390;
      const cramped = height < 700 || keyboardOpen;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // Tablet landscape: wide enough for side-by-side workpad, oriented landscape
      // Covers iPad Air/Pro/mini landscape and most laptops up to 1535px
      const isLandscape = width > height;
      const tabletLandscape = isLandscape && width >= 820 && height >= 500 && !keyboardOpen;

      // Tablet portrait: taller than wide with good screen real estate
      const tabletPortrait = !isLandscape && width >= 600 && height >= 768 && !keyboardOpen;

      // Mobile: narrow screens where floating workpad button is preferred
      const mobileLayout = width < 600;

      setViewportState((previous) => {
        if (
          previous.width === width &&
          previous.height === height &&
          previous.keyboardOpen === keyboardOpen &&
          previous.compact === compact &&
          previous.cramped === cramped &&
          previous.reducedMotion === reducedMotion &&
          previous.tabletLandscape === tabletLandscape &&
          previous.tabletPortrait === tabletPortrait &&
          previous.mobileLayout === mobileLayout
        ) {
          return previous;
        }

        return { width, height, keyboardOpen, compact, cramped, reducedMotion, tabletLandscape, tabletPortrait, mobileLayout };
      });
    };

    updateViewportState();

    const visualViewport = window.visualViewport;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    window.addEventListener("resize", updateViewportState);
    visualViewport?.addEventListener("resize", updateViewportState);
    visualViewport?.addEventListener("scroll", updateViewportState);
    motionQuery.addEventListener("change", updateViewportState);

    return () => {
      window.removeEventListener("resize", updateViewportState);
      visualViewport?.removeEventListener("resize", updateViewportState);
      visualViewport?.removeEventListener("scroll", updateViewportState);
      motionQuery.removeEventListener("change", updateViewportState);
    };
  }, []);
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

  // Cosmetic state — visual only, never affects gameplay
  const [yourStreakEffect, setYourStreakEffect] = useState<StreakEffectId>("none");
  const [opponentStreakEffect, setOpponentStreakEffect] = useState<StreakEffectId>("none");
  const [yourEmotePack, setYourEmotePack] = useState<EmotePackId>("starter");
  const [yourHitEffect, setYourHitEffect] = useState<HitEffectId>("none");
  const [opponentHitEffect, setOpponentHitEffect] = useState<HitEffectId>("none");

  // Health bar system — client-side only, derived from pointScored events
  const MAX_HP = 150;
  const DISPLAY_MAX_HP = 100;
  const HP_BASE_PER_POINT = 8;
  const HP_FAST_BONUS = 4;
  const HP_STREAK_3_BONUS = 2;
  const HP_STREAK_5_BONUS = 4;
  const [youDamageTaken, setYouDamageTaken] = useState(0);
  const [opponentDamageTaken, setOpponentDamageTaken] = useState(0);
  const [youHitKey, setYouHitKey] = useState(0);
  const [opponentHitKey, setOpponentHitKey] = useState(0);
  const [latestYouDamage, setLatestYouDamage] = useState<number | null>(null);
  const [latestOpponentDamage, setLatestOpponentDamage] = useState<number | null>(null);
  const [youHitType, setYouHitType] = useState<"normal" | "streak" | "ultimate">("normal");
  const [opponentHitType, setOpponentHitType] = useState<"normal" | "streak" | "ultimate">("normal");
  const [latestYouSpeedTier, setLatestYouSpeedTier] = useState<SpeedTier>("normal");
  const [latestOpponentSpeedTier, setLatestOpponentSpeedTier] = useState<SpeedTier>("normal");
  const [youHitIntensity, setYouHitIntensity] = useState(0.35);
  const [opponentHitIntensity, setOpponentHitIntensity] = useState(0.35);
  /** Flash combo tier for floating damage on the victim panel (0 = none). */
  const [youDamageFlashTier, setYouDamageFlashTier] = useState(0);
  const [opponentDamageFlashTier, setOpponentDamageFlashTier] = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [shakeVector, setShakeVector] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const hitDelayTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const youFlashTierClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opponentFlashTierClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isFinalPhase, setIsFinalPhase] = useState(false);
  const [scoreImpactKey, setScoreImpactKey] = useState({ you: 0, opponent: 0 });
  const [clutchMoment, setClutchMoment] = useState<{ key: number; side: "you" | "opponent" | null }>({
    key: 0,
    side: null
  });
  const finalPhaseTriggeredRef = useRef(false);
  const timerSecondsRef = useRef(initialTimer.secondsLeft);
  const finalSecondTickRef = useRef<number | null>(null);

  // Animation hook
  const {
    animState,
    combatFx,
    triggerFreezeHit,
    triggerPowerUpActivated,
    triggerShieldBlock,
    triggerPowerUpReady,
    triggerScoreGlow,
    triggerStreakBroken,
    triggerFlashBolt,
    triggerFlashOverclockSnap,
    triggerInfernoVolley,
    triggerBurnTickFlare,
    triggerTitanSlam,
    triggerTitanHealRipple,
    triggerArchitectOrb,
    triggerArchitectBeam,
    triggerArchitectShatter,
    triggerShadowMindShock,
  } = useGameAnimations();

  const ultimateFxSnapshot: UltimateFxSnapshot = useMemo(
    () => ({
      type: ultimate.type,
      opponentType: ultimate.opponentType,
      overclockUntil: ultimate.overclockUntil,
      opponentOverclockUntil: ultimate.opponentOverclockUntil,
      infernoPendingUntil: ultimate.infernoPendingUntil,
      opponentInfernoPendingUntil: ultimate.opponentInfernoPendingUntil,
      novaBonusRemaining: ultimate.novaBonusRemaining,
      opponentNovaBonusRemaining: ultimate.opponentNovaBonusRemaining,
      fortressUntil: ultimate.fortressUntil,
      opponentFortressUntil: ultimate.opponentFortressUntil,
      fortressBlocksRemaining: ultimate.fortressBlocksRemaining,
      opponentFortressBlocksRemaining: ultimate.opponentFortressBlocksRemaining,
      architectUntil: ultimate.architectUntil,
      opponentArchitectUntil: ultimate.opponentArchitectUntil,
      architectSequenceStreak: ultimate.architectSequenceStreak,
      opponentArchitectSequenceStreak: ultimate.opponentArchitectSequenceStreak,
      titanOverpowerUntil: ultimate.titanOverpowerUntil,
      opponentTitanOverpowerUntil: ultimate.opponentTitanOverpowerUntil,
      shadowCorruptUntil: ultimate.shadowCorruptUntil,
      opponentShadowCorruptUntil: ultimate.opponentShadowCorruptUntil,
      flashOverclockStacks: ultimate.flashOverclockStacks,
      opponentFlashOverclockStacks: ultimate.opponentFlashOverclockStacks
    }),
    [ultimate]
  );

  useEffect(() => {
    soundManager.init();
    setMuted(soundManager.isMuted());
  }, []);

  // Scroll lock during live gameplay: make it feel like a real game viewport.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const shouldLock = status === "playing";
    const html = document.documentElement;
    const body = document.body;
    if (!shouldLock) {
      html.style.overflow = "";
      body.style.overflow = "";
      return;
    }
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, [status]);

  const focusAnswerInput = (opts: { select?: boolean } = {}) => {
    const el = answerInputRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    el.focus({ preventScroll: true });
    if (opts.select) {
      try {
        el.select();
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    return () => {
      for (const t of hitDelayTimeoutsRef.current) clearTimeout(t);
      hitDelayTimeoutsRef.current.clear();
    };
  }, []);

  const classifyHit = (opts: { streak: number; isUltimate: boolean }) => {
    if (opts.isUltimate) return "ultimate" as const;
    if (opts.streak >= 3) return "streak" as const;
    return "normal" as const;
  };

  const intensityFromDamage = (damage: number) => {
    const d = Math.max(0, damage);
    // Tuned so ~10 dmg is noticeable, ~25+ is punchy
    return Math.max(0.25, Math.min(1, d / 28));
  };

  const triggerScreenShake = (strength: number) => {
    if (viewportState.reducedMotion) return;
    const s = Math.max(0, Math.min(1, strength));
    if (s <= 0) return;
    const amp = 1.4 + s * 3.2; // subtle 1.4..4.6px
    const x = (Math.random() * 2 - 1) * amp;
    const y = (Math.random() * 2 - 1) * (amp * 0.7);
    setShakeVector({ x, y });
    setShakeKey((prev) => prev + 1);
  };

  const playHitSound = (hitType: "normal" | "streak" | "ultimate", intensity: number) => {
    const vol = 0.12 + Math.min(0.35, intensity * 0.38);
    const rate = hitType === "ultimate" ? 0.95 : hitType === "streak" ? 1.06 : 1.12;
    if (hitType === "ultimate") {
      soundManager.play("hitUltimate", { volume: vol, rate });
      return;
    }
    if (hitType === "streak") {
      soundManager.play("hitStreak", { volume: vol, rate });
      return;
    }
    soundManager.play("hitNormal", { volume: vol, rate });
  };

  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  useEffect(() => {
    ultimateRef.current = ultimate;
  }, [ultimate]);

  const pushCombatEvent = (
    target: "you" | "opponent",
    item: Omit<FloatingLabelItem, "id">
  ) => {
    const id = ++combatEventIdRef.current;
    const nextItem: FloatingLabelItem = { id, duration: 1.1, ...item };
    const setItems = target === "you" ? setYouCombatEvents : setOpponentCombatEvents;
    setItems((previous) => [...previous, nextItem]);
    window.setTimeout(() => {
      setItems((previous) => previous.filter((entry) => entry.id !== id));
    }, Math.round((nextItem.duration ?? 1.1) * 1000) + 120);
  };

  const pushUltimateToast = (text: string, by: "you" | "opponent") => {
    const id = ++ultimateToastIdRef.current;
    setUltimateToast({ id, text, by });
    window.setTimeout(() => {
      setUltimateToast((previous) => (previous?.id === id ? null : previous));
    }, 950);
  };

  const pushQuestionFlash = (kind: QuestionFlash["kind"]) => {
    const key = Date.now();
    setQuestionFlash({ key, kind });
    window.setTimeout(() => {
      setQuestionFlash((previous) => (previous?.key === key ? null : previous));
    }, kind === "new" ? 420 : 520);
  };

  const pushAnswerFeedback = (kind: AnswerFeedback["kind"], option?: string) => {
    const key = ++answerFeedbackIdRef.current;
    setAnswerFeedback({
      key,
      kind,
      option,
      text: kind === "correct" ? "HIT CONFIRMED" : "MISS",
    });
    window.setTimeout(() => {
      setAnswerFeedback((previous) => (previous?.key === key ? null : previous));
    }, 780);
  };

  const pushMomentCallout = (
    text: string,
    tone: MomentCallout["tone"],
    side: MomentCallout["side"] = "center",
  ) => {
    const key = ++momentCalloutIdRef.current;
    setMomentCallout({ key, text, tone, side });
    window.setTimeout(() => {
      setMomentCallout((previous) => (previous?.key === key ? null : previous));
    }, MOMENT_CALLOUT_MS);
  };

  useEffect(() => {
    timerSecondsRef.current = timer.secondsLeft;
  }, [timer.secondsLeft]);

  useEffect(() => {
    if (status !== "playing") {
      setIsFinalPhase(false);
      finalPhaseTriggeredRef.current = false;
      finalSecondTickRef.current = null;
      return;
    }

    if (!finalPhaseTriggeredRef.current && timer.secondsLeft <= FINAL_PHASE_SECONDS) {
      finalPhaseTriggeredRef.current = true;
      setIsFinalPhase(true);
      soundManager.play("tick");
    }
  }, [status, timer.secondsLeft]);

  useEffect(() => {
    // Play once when ultimate becomes ready (per player).
    const youReadyNow = ultimate.ready && !ultimate.used && ultimate.implemented;
    const oppReadyNow = ultimate.opponentReady && !ultimate.opponentUsed && ultimate.opponentImplemented;

    if (youReadyNow && !ultimateReadySoundRef.current.you) {
      ultimateReadySoundRef.current.you = true;
      soundManager.play("ultReady", { volume: 0.26, rate: 1.05 });
      setUltReadyCueKey((prev) => ({ ...prev, you: prev.you + 1 }));
    }
    if (oppReadyNow && !ultimateReadySoundRef.current.opponent) {
      ultimateReadySoundRef.current.opponent = true;
      soundManager.play("ultReady", { volume: 0.2, rate: 0.98 });
      setUltReadyCueKey((prev) => ({ ...prev, opponent: prev.opponent + 1 }));
    }

    if (!youReadyNow) {
      ultimateReadySoundRef.current.you = false;
    }
    if (!oppReadyNow) {
      ultimateReadySoundRef.current.opponent = false;
    }
  }, [ultimate.ready, ultimate.used, ultimate.implemented, ultimate.opponentReady, ultimate.opponentUsed, ultimate.opponentImplemented]);

  useEffect(() => {
    if (status !== "room-lobby") {
      setRoomStartPending(false);
      setCopyRoomPending(false);
    }
    if (status !== "playing") {
      setUltimateActivating(false);
    }
  }, [status]);

  useEffect(() => {
    if (!roomLobby?.canStart) {
      setRoomStartPending(false);
    }
  }, [roomLobby?.canStart]);

  useEffect(() => {
    if (!ultimate.ready || ultimate.used) {
      setUltimateActivating(false);
    }
  }, [ultimate.ready, ultimate.used]);

  const playFinalSecondCue = (secondsLeft: number) => {
    if (secondsLeft <= 0 || secondsLeft > FINAL_PHASE_SECONDS) {
      return;
    }

    if (finalSecondTickRef.current === secondsLeft) {
      return;
    }

    finalSecondTickRef.current = secondsLeft;
    // Reuses existing sound IDs; easy to swap for dedicated endgame SFX later.
    soundManager.play(secondsLeft <= CLUTCH_SECONDS ? "fast" : "tick");
  };

  useEffect(() => {
    const nextSocket = createGameSocket();
    setSocket(nextSocket);
    console.log("[client] connecting to Socket.io server");
    setStatus("connecting");
    setSocketRecovery({ active: false, message: "" });
    setScores(initialScores);
    setRatings(initialRatings);
    // strikes removed (HP-only mistakes)
    setEliminated({ you: false, opponent: false });
    setTimer(initialTimer);
    setUltimate(initialUltimate);
    setFeedback(initialFeedback);
    setCurrentQuestion("Waiting for the first question...");
    setCurrentQuestionData(null);
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
    setYouCombatEvents([]);
    setOpponentCombatEvents([]);
    setUltimateToast(null);
    seenEmoteMessageIdsRef.current.clear();
    setRematchRequested(false);
    setOpponentRematchRequested(false);
    setRematchProgress({ requestedPlayers: 0, requiredPlayers: 2 });
    setRoomLobby(null);
    setRoomErrorMessage(null);
    setRoomNotice(null);
    setRoomStartPending(false);
    setCopyRoomPending(false);
    setLeavePending(false);
    setUltimateActivating(false);
    setGameResult(null);
    setUltimateCue(null);
    setYouUltimateFxKey(0);
    setOpponentUltimateFxKey(0);
    setYouUltimateFxType(null);
    setOpponentUltimateFxType(null);
    setYourStreakEffect("none");
    setOpponentStreakEffect("none");
    setYourEmotePack("starter");
    setYourHitEffect("none");
    setOpponentHitEffect("none");
    setIsFinalPhase(false);
    setScoreImpactKey({ you: 0, opponent: 0 });
    setClutchMoment({ key: 0, side: null });
    finalPhaseTriggeredRef.current = false;
    timerSecondsRef.current = initialTimer.secondsLeft;
    finalSecondTickRef.current = null;
    if (ultimateCueTimeoutRef.current) {
      clearTimeout(ultimateCueTimeoutRef.current);
      ultimateCueTimeoutRef.current = null;
    }
    if (ultimateActivateTimeoutRef.current) {
      clearTimeout(ultimateActivateTimeoutRef.current);
      ultimateActivateTimeoutRef.current = null;
    }
    currentMatchRoomIdRef.current = null;

    // Mark connection failed after 20 s if the socket never fires "connect".
    // 20 s gives Render's free tier time to cold-start the server.
    const connectionTimeout = setTimeout(() => {
      if (!nextSocket.connected) {
        console.error("[client] connection timed out after 20 s");
        setStatus("failed");
        setSocketRecovery({ active: false, message: "" });
      }
    }, 20000);

    // Track consecutive connect_error events; flip to "failed" after 3.
    let connectErrorCount = 0;

    const handleConnect = async () => {
      clearTimeout(connectionTimeout);
      connectErrorCount = 0;
      setSocketRecovery({ active: false, message: "" });
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
      setSocketRecovery({
        active: true,
        message: connectErrorCount >= 2 ? "Still trying to reach the arena..." : "Reconnecting to the arena..."
      });
      if (connectErrorCount >= 3) {
        setStatus("failed");
        setSocketRecovery({ active: false, message: "" });
      }
    };

    const handleDisconnect = (reason: string) => {
      console.warn("[client] socket disconnected", reason);
      if (statusRef.current === "playing" || statusRef.current === "countdown" || statusRef.current === "room-lobby") {
        setSocketRecovery({
          active: true,
          message: "Connection dropped. Rejoining the arena..."
        });
      }
    };

    const handleReconnectAttempt = (attempt: number) => {
      setSocketRecovery({
        active: true,
        message: `Reconnecting to the arena... attempt ${attempt}`
      });
    };

    const handleReconnect = () => {
      setSocketRecovery({
        active: true,
        message: "Reconnected. Resyncing match state..."
      });
      window.setTimeout(() => {
        setSocketRecovery({ active: false, message: "" });
      }, 1200);
    };

    const handleReconnectFailed = () => {
      setSocketRecovery({ active: false, message: "" });
      setStatus("failed");
    };

    const handleAuthRequired = (payload: { message?: string }) => {
      console.log("[client] authRequired received", payload);
      nextSocket.disconnect();
      // Gracefully redirect to home — session expired or invalid
      // Use a short delay so any in-flight UI can settle cleanly
      setTimeout(() => router.push("/"), 300);
    };

    const applyRoomLobby = (payload: RoomLobbyState) => {
      setRoomErrorMessage(null);
      setRoomNotice(null);
      setRoomLobby(payload);
      if (payload.status !== "in-game") {
        setStatus("room-lobby");
      }
      setCurrentQuestion("Waiting for match start...");
      setCurrentQuestionData(null);
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
        ultimateQuestionsLeft:
          typeof (payload as { ultimateSecondsLeft?: number }).ultimateSecondsLeft === "number"
            ? (payload as { ultimateSecondsLeft: number }).ultimateSecondsLeft
            : typeof payload.ultimateQuestionsLeft === "number"
            ? payload.ultimateQuestionsLeft
            : previous.ultimateQuestionsLeft,
        opponentUltimateQuestionsLeft:
          typeof (payload as { opponentUltimateSecondsLeft?: number }).opponentUltimateSecondsLeft === "number"
            ? (payload as { opponentUltimateSecondsLeft: number }).opponentUltimateSecondsLeft
            : typeof payload.opponentUltimateQuestionsLeft === "number"
            ? payload.opponentUltimateQuestionsLeft
            : previous.opponentUltimateQuestionsLeft,
        ultimateSecondsLeft:
          typeof (payload as { ultimateSecondsLeft?: number }).ultimateSecondsLeft === "number"
            ? (payload as { ultimateSecondsLeft: number }).ultimateSecondsLeft
            : typeof payload.ultimateQuestionsLeft === "number"
              ? payload.ultimateQuestionsLeft
              : previous.ultimateSecondsLeft,
        opponentUltimateSecondsLeft:
          typeof (payload as { opponentUltimateSecondsLeft?: number }).opponentUltimateSecondsLeft === "number"
            ? (payload as { opponentUltimateSecondsLeft: number }).opponentUltimateSecondsLeft
            : typeof payload.opponentUltimateQuestionsLeft === "number"
              ? payload.opponentUltimateQuestionsLeft
              : previous.opponentUltimateSecondsLeft,
        wildfireStacks:
          typeof payload.wildfireStacks === "number" ? payload.wildfireStacks : previous.wildfireStacks,
        opponentWildfireStacks:
          typeof payload.opponentWildfireStacks === "number"
            ? payload.opponentWildfireStacks
            : previous.opponentWildfireStacks,
        visibilityMaskActive:
          typeof payload.visibilityMaskActive === "boolean"
            ? payload.visibilityMaskActive
            : previous.visibilityMaskActive,
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
        shadowCorruptUntil:
          typeof payload.shadowCorruptUntil === "number"
            ? payload.shadowCorruptUntil
            : (previous as UltimateState & { shadowCorruptUntil?: number }).shadowCorruptUntil ?? 0,
        opponentShadowCorruptUntil:
          typeof payload.opponentShadowCorruptUntil === "number"
            ? payload.opponentShadowCorruptUntil
            : (previous as UltimateState & { opponentShadowCorruptUntil?: number }).opponentShadowCorruptUntil ?? 0,
        shadowCorruptStacks:
          typeof payload.shadowCorruptStacks === "number"
            ? payload.shadowCorruptStacks
            : (previous as UltimateState & { shadowCorruptStacks?: number }).shadowCorruptStacks ?? 0,
        opponentShadowCorruptStacks:
          typeof payload.opponentShadowCorruptStacks === "number"
            ? payload.opponentShadowCorruptStacks
            : (previous as UltimateState & { opponentShadowCorruptStacks?: number }).opponentShadowCorruptStacks ?? 0,
        architectUntil:
          typeof payload.architectUntil === "number"
            ? payload.architectUntil
            : (previous as UltimateState & { architectUntil?: number }).architectUntil ?? 0,
        opponentArchitectUntil:
          typeof payload.opponentArchitectUntil === "number"
            ? payload.opponentArchitectUntil
            : (previous as UltimateState & { opponentArchitectUntil?: number }).opponentArchitectUntil ?? 0,
        architectMarks:
          typeof payload.architectMarks === "number"
            ? payload.architectMarks
            : (previous as UltimateState & { architectMarks?: number }).architectMarks ?? 0,
        opponentArchitectMarks:
          typeof payload.opponentArchitectMarks === "number"
            ? payload.opponentArchitectMarks
            : (previous as UltimateState & { opponentArchitectMarks?: number }).opponentArchitectMarks ?? 0,
        architectSequenceStreak:
          typeof payload.architectSequenceStreak === "number"
            ? payload.architectSequenceStreak
            : (previous as UltimateState & { architectSequenceStreak?: number }).architectSequenceStreak ?? 0,
        opponentArchitectSequenceStreak:
          typeof payload.opponentArchitectSequenceStreak === "number"
            ? payload.opponentArchitectSequenceStreak
            : (previous as UltimateState & { opponentArchitectSequenceStreak?: number }).opponentArchitectSequenceStreak ?? 0,
        architectNodes:
          typeof payload.architectNodes === "number"
            ? payload.architectNodes
            : previous.architectNodes,
        opponentArchitectNodes:
          typeof payload.opponentArchitectNodes === "number"
            ? payload.opponentArchitectNodes
            : previous.opponentArchitectNodes,
        architectReady:
          typeof payload.architectReady === "boolean"
            ? payload.architectReady
            : previous.architectReady,
        opponentArchitectReady:
          typeof payload.opponentArchitectReady === "boolean"
            ? payload.opponentArchitectReady
            : previous.opponentArchitectReady,
        titanOverpowerUntil:
          typeof payload.titanOverpowerUntil === "number"
            ? payload.titanOverpowerUntil
            : (previous as UltimateState & { titanOverpowerUntil?: number }).titanOverpowerUntil ?? 0,
        opponentTitanOverpowerUntil:
          typeof payload.opponentTitanOverpowerUntil === "number"
            ? payload.opponentTitanOverpowerUntil
            : (previous as UltimateState & { opponentTitanOverpowerUntil?: number }).opponentTitanOverpowerUntil ?? 0,
        titanStreak:
          typeof payload.titanStreak === "number"
            ? payload.titanStreak
            : (previous as UltimateState & { titanStreak?: number }).titanStreak ?? 0,
        opponentTitanStreak:
          typeof payload.opponentTitanStreak === "number"
            ? payload.opponentTitanStreak
            : (previous as UltimateState & { opponentTitanStreak?: number }).opponentTitanStreak ?? 0,
        titanBreakArmed:
          typeof payload.titanBreakArmed === "boolean"
            ? payload.titanBreakArmed
            : (previous as UltimateState & { titanBreakArmed?: boolean }).titanBreakArmed ?? false,
        opponentTitanBreakArmed:
          typeof payload.opponentTitanBreakArmed === "boolean"
            ? payload.opponentTitanBreakArmed
            : (previous as UltimateState & { opponentTitanBreakArmed?: boolean }).opponentTitanBreakArmed ?? false,
        titanRecoveryUntil:
          typeof payload.titanRecoveryUntil === "number"
            ? payload.titanRecoveryUntil
            : previous.titanRecoveryUntil,
        opponentTitanRecoveryUntil:
          typeof payload.opponentTitanRecoveryUntil === "number"
            ? payload.opponentTitanRecoveryUntil
            : previous.opponentTitanRecoveryUntil,
        titanRecovering:
          typeof payload.titanRecovering === "boolean"
            ? payload.titanRecovering
            : previous.titanRecovering,
        opponentTitanRecovering:
          typeof payload.opponentTitanRecovering === "boolean"
            ? payload.opponentTitanRecovering
            : previous.opponentTitanRecovering,
        titanDamageReduction:
          typeof payload.titanDamageReduction === "number"
            ? payload.titanDamageReduction
            : previous.titanDamageReduction,
        opponentTitanDamageReduction:
          typeof payload.opponentTitanDamageReduction === "number"
            ? payload.opponentTitanDamageReduction
            : previous.opponentTitanDamageReduction,
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
        fortressStoredDamage:
          typeof payload.fortressStoredDamage === "number"
            ? payload.fortressStoredDamage
            : previous.fortressStoredDamage,
        opponentFortressStoredDamage:
          typeof payload.opponentFortressStoredDamage === "number"
            ? payload.opponentFortressStoredDamage
            : previous.opponentFortressStoredDamage,
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
        infernoPendingUntil:
          typeof payload.infernoPendingUntil === "number"
            ? payload.infernoPendingUntil
            : (previous as UltimateState & { infernoPendingUntil?: number }).infernoPendingUntil ?? 0,
        opponentInfernoPending:
          typeof payload.opponentInfernoPending === "boolean"
            ? payload.opponentInfernoPending
            : previous.opponentInfernoPending,
        opponentInfernoPendingUntil:
          typeof payload.opponentInfernoPendingUntil === "number"
            ? payload.opponentInfernoPendingUntil
            : (previous as UltimateState & { opponentInfernoPendingUntil?: number }).opponentInfernoPendingUntil ?? 0,
        flashOverclockStacks:
          typeof payload.flashOverclockStacks === "number"
            ? payload.flashOverclockStacks
            : previous.flashOverclockStacks,
        opponentFlashOverclockStacks:
          typeof payload.opponentFlashOverclockStacks === "number"
            ? payload.opponentFlashOverclockStacks
            : previous.opponentFlashOverclockStacks,
        jammed: typeof payload.jammed === "boolean" ? payload.jammed : previous.jammed,
        opponentJammed:
          typeof payload.opponentJammed === "boolean" ? payload.opponentJammed : previous.opponentJammed
      }));
      if ("neuralInputUnlockAt" in payload) {
        const rawNeural = payload.neuralInputUnlockAt;
        if (typeof rawNeural === "number" && Number.isFinite(rawNeural)) {
          setNeuralInputUnlockAt((prev) => {
            if (rawNeural <= Date.now()) return 0;
            return Math.max(prev, rawNeural);
          });
        }
      }
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
      setRoomStartPending(false);
      setCopyRoomPending(false);
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
      yourAvatarData?: ServerAvatarSnapshot;
      opponentAvatarData?: ServerAvatarSnapshot;
      ratings?: {
        you: number;
        opponent: number;
      };
      // Cosmetics — visual only
      yourStreakEffect?: string;
      opponentStreakEffect?: string;
      yourEmotePack?: string;
      yourHitEffect?: string;
      opponentHitEffect?: string;
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
      setRoomStartPending(false);
      setCopyRoomPending(false);
      setLeavePending(false);
      const incomingRoomId = payload.roomId ?? payload.room ?? payload.roomInfo?.id ?? null;
      currentMatchRoomIdRef.current = incomingRoomId ?? currentMatchRoomIdRef.current;
      // Reset per-match counters
      correctAnswersRef.current = 0;
      matchTokenRef.current = incomingRoomId ?? `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      setMatchRewards(null);
      setYourName(payload.yourName ?? "You");
      setOpponentName(payload.opponentName ?? payload.opponent?.name ?? "Opponent");
      const nextYourAvatarId = normalizeAvatarId(payload.yourAvatarData?.id ?? payload.yourAvatar);
      const nextOpponentAvatarId = normalizeAvatarId(payload.opponentAvatarData?.id ?? payload.opponentAvatar);
      setYourAvatarId(nextYourAvatarId);
      setOpponentAvatarId(nextOpponentAvatarId);
      setYourAvatar(
        isServerAvatarSnapshot(payload.yourAvatarData)
          ? payload.yourAvatarData.emoji
          : getAvatar(nextYourAvatarId).emoji
      );
      setOpponentAvatar(
        isServerAvatarSnapshot(payload.opponentAvatarData)
          ? payload.opponentAvatarData.emoji
          : getAvatar(nextOpponentAvatarId).emoji
      );
      // Apply cosmetics — visual only, no gameplay effect
      setYourStreakEffect(normalizeStreakEffectId(payload.yourStreakEffect));
      setOpponentStreakEffect(normalizeStreakEffectId(payload.opponentStreakEffect));
      setYourEmotePack(normalizeEmotePackId(payload.yourEmotePack));
      setYourHitEffect(normalizeHitEffectId(payload.yourHitEffect));
      setOpponentHitEffect(normalizeHitEffectId(payload.opponentHitEffect));
      if (payload.ratings) {
        setRatings(payload.ratings);
      }
      setUltimate({
        ...initialUltimate,
        ...(isServerAvatarSnapshot(payload.yourAvatarData) && isServerAvatarSnapshot(payload.opponentAvatarData)
          ? buildUltimateIdentityFromServerAvatars(payload.yourAvatarData, payload.opponentAvatarData)
          : buildUltimateIdentityFromAvatars(nextYourAvatarId, nextOpponentAvatarId)),
      });
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
      setCurrentQuestionData(null);
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
      // strikes removed (HP-only mistakes)
      setEliminated({ you: false, opponent: false });
      setTimer(initialTimer);
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setNeuralInputUnlockAt(0);
      setEmoteBarOpen(false);
      setEmoteCooldownUntil(0);
      setEmoteLabels([]);
      setYouCombatEvents([]);
      setOpponentCombatEvents([]);
      setUltimateToast(null);
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
      // Reset HP damage tracking for new match
      setYouDamageTaken(0);
      setOpponentDamageTaken(0);
      setYouHitKey(0);
      setOpponentHitKey(0);
      setLatestYouDamage(null);
      setLatestOpponentDamage(null);
      setLatestYouSpeedTier("normal");
      setLatestOpponentSpeedTier("normal");
      setYouDamageFlashTier(0);
      setOpponentDamageFlashTier(0);
      if (youFlashTierClearRef.current) clearTimeout(youFlashTierClearRef.current);
      if (opponentFlashTierClearRef.current) clearTimeout(opponentFlashTierClearRef.current);
      youFlashTierClearRef.current = null;
      opponentFlashTierClearRef.current = null;
    };

    const handleCountdown = (payload: { value: string }) => {
      console.log("[client] countdown received", payload);
      if (payload.value === "3") {
        setScores(initialScores);
        // strikes removed (HP-only mistakes)
        setEliminated({ you: false, opponent: false });
        setTimer(initialTimer);
        // Keep avatar-linked ultimate identity from matchFound; only reset round state.
        setUltimate((previous) => ({
          ...initialUltimate,
          type: previous.type,
          name: previous.name,
          description: previous.description,
          implemented: previous.implemented,
          opponentType: previous.opponentType,
          opponentName: previous.opponentName,
          opponentImplemented: previous.opponentImplemented,
        }));
        setFeedback(initialFeedback);
        setFrozenUntil(0);
        setShieldBlockedUntil(0);
        setNeuralInputUnlockAt(0);
        setEmoteCooldownUntil(0);
        setEmoteLabels([]);
        setYouCombatEvents([]);
        setOpponentCombatEvents([]);
        setUltimateToast(null);
        seenEmoteMessageIdsRef.current.clear();
        setOpponentActivity("idle");
        if (opponentTypingTimerRef.current) {
          clearTimeout(opponentTypingTimerRef.current);
          opponentTypingTimerRef.current = null;
        }
        peakYouStreakRef.current = 0;
        peakOpponentStreakRef.current = 0;
        setYouDamageTaken(0);
        setOpponentDamageTaken(0);
        setYouHitKey(0);
        setOpponentHitKey(0);
        setLatestYouDamage(null);
        setLatestOpponentDamage(null);
        setLatestYouSpeedTier("normal");
        setLatestOpponentSpeedTier("normal");
        setYouDamageFlashTier(0);
        setOpponentDamageFlashTier(0);
        if (youFlashTierClearRef.current) clearTimeout(youFlashTierClearRef.current);
        if (opponentFlashTierClearRef.current) clearTimeout(opponentFlashTierClearRef.current);
        youFlashTierClearRef.current = null;
        opponentFlashTierClearRef.current = null;
      }
      setStatus("countdown");
      setCurrentQuestion("");
      setCurrentQuestionData(null);
      setTimeoutDecisionPrompt({ open: false, token: 0 });
      setAnswer("");
      setCountdownValue(payload.value);
      setFrozenUntil(0);
      setShieldBlockedUntil(0);
      setNeuralInputUnlockAt(0);
      // Keep the emote picker user-controlled during countdown/gameplay.
      // Auto-opening it steals focus and makes answer interactions feel broken.
      if (payload.value === "GO") {
        setEmoteBarOpen(false);
      }
      lowHpCalloutRefs.current = {
        youLastStand: false,
        opponentLastStand: false,
        finishThem: false,
        clutch: false,
      };
      setRematchRequested(false);
      setOpponentRematchRequested(false);
      setRematchProgress({ requestedPlayers: 0, requiredPlayers: 2 });

      if (payload.value === "GO") {
        soundManager.play("go");
      } else {
        soundManager.play("tick");
      }
    };

    const handleNewQuestion = (
      payload:
        | { question?: string; questionData?: DuelQuestion; token?: number; inputLockedUntil?: number }
        | string
    ) => {
      console.log("[client] newQuestion received", payload);
      const question = typeof payload === "string" ? payload : payload.question;
      const questionData = typeof payload === "object" && payload !== null ? payload.questionData ?? null : null;
      const token = typeof payload === "object" && payload !== null ? (payload.token ?? 0) : 0;
      const inputLockUntil =
        typeof payload === "object" &&
        payload !== null &&
        typeof payload.inputLockedUntil === "number" &&
        Number.isFinite(payload.inputLockedUntil)
          ? payload.inputLockedUntil
          : 0;
      setNeuralInputUnlockAt(inputLockUntil);
      // Store the question token so stale submits can be rejected server-side.
      currentQuestionTokenRef.current = token;
      setCurrentQuestion(questionData?.prompt || question || "Get ready...");
      setCurrentQuestionData(questionData);
      setQuestionMotionKey((key) => key + 1);
      pushQuestionFlash("new");
      setAnswerFeedback(null);
      lastSubmittedAnswerRef.current = "";
      setTimeoutDecisionPrompt({ open: false, token: 0 });
      setAnswer("");
      setFocusPulseKey((k) => k + 1);
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
      if (inputLockUntil > Date.now()) {
        pushCombatEvent("you", {
          text: "JAMMED",
          color: "#c4b5fd",
          className: "bg-violet-950/90 text-violet-100"
        });
        soundManager.play("jammed", { volume: 0.18, rate: 1.0, allowOverlap: true });
      }
      if (opponentTypingTimerRef.current) {
        clearTimeout(opponentTypingTimerRef.current);
        opponentTypingTimerRef.current = null;
      }
      lastTypingEmitRef.current = 0;
      // Mobile UX: immediately focus the answer box so typing "just works".
      // Delay by a tick so the input is enabled + mounted before focusing.
      setTimeout(() => {
        if (!youEliminated && !feedbackRef.current.youAnsweredCurrent) {
          if (!(inputLockUntil > Date.now())) {
            focusAnswerInput({ select: true });
          }
        }
      }, 0);
    };

    const handleTimeoutDecisionPrompt = (payload: { token?: number; decisionWindowMs?: number }) => {
      const token = Number(payload?.token ?? 0);
      if (!Number.isFinite(token) || token <= 0) return;
      setTimeoutDecisionPrompt({
        open: true,
        token
      });
    };

    const handleTimeoutDecisionResolved = (_payload: { action?: string; token?: number; graceSeconds?: number }) => {
      setTimeoutDecisionPrompt((prev) => ({ ...prev, open: false }));
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
      timerSecondsRef.current = payload.secondsLeft;
      playFinalSecondCue(payload.secondsLeft);
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

    const handleIncorrectAnswer = (payload: {
      reason?: string;
      damage?: number;
      hp?: { you?: number; opponent?: number };
      eliminated?: boolean;
      neuralMindShock?: boolean;
      flashOverclockSnap?: boolean;
      architectSequenceShatter?: boolean;
    } & Record<string, unknown>) => {
      console.log("[client] incorrectAnswer received", payload);
      setTimeoutDecisionPrompt((prev) => ({ ...prev, open: false }));
      soundManager.play("wrong");
      pushQuestionFlash("wrong");
      pushAnswerFeedback("wrong", lastSubmittedAnswerRef.current);
      if (!viewportState.reducedMotion) {
        animState.questionShakeControls.start({
          x: [0, -7, 6, -4, 3, 0],
          transition: { duration: 0.24, ease: "easeOut" },
        });
      }
      syncUltimateFromPayload(payload);
      if (payload.neuralMindShock) {
        triggerShadowMindShock();
        pushCombatEvent("you", {
          text: "JAMMED",
          color: "#c4b5fd",
          className: "bg-violet-950/90 text-violet-100"
        });
      }
      if (payload.flashOverclockSnap) {
        triggerFlashOverclockSnap();
        pushCombatEvent("you", {
          text: "STACKS -2",
          color: "#fde68a",
          className: "bg-amber-950/90 text-amber-100"
        });
      }
      const previousArchitectNodes = ultimateRef.current.architectNodes ?? 0;
      const nextArchitectNodes =
        typeof (payload as { architectNodes?: number }).architectNodes === "number"
          ? ((payload as { architectNodes?: number }).architectNodes ?? 0)
          : previousArchitectNodes;
      if (payload.architectSequenceShatter || nextArchitectNodes < previousArchitectNodes) {
        triggerArchitectShatter();
        pushCombatEvent("you", {
          text: "NODE -1",
          color: "#67e8f9",
          className: "bg-cyan-950/90 text-cyan-100"
        });
      }
      // Show "Streak Broken" popup if local player had a streak going
      if (feedbackRef.current.youStreak >= 2) {
        triggerStreakBroken();
      }
      setFeedback((f) => ({ ...f, youStreak: 0 }));

      const dmg = Math.max(0, payload.damage ?? 0);
      if (dmg > 0) {
        setLatestYouDamage(dmg);
        setYouHitKey((k) => k + 1);
        pushCombatEvent("you", {
          text: `-${Math.round(dmg)} HP`,
          color: "#fda4af",
          className: "bg-rose-950/90 text-rose-100"
        });
      }
      if (typeof payload.hp?.you === "number") {
        setYouDamageTaken(Math.max(0, MAX_HP - payload.hp.you));
      } else if (dmg > 0) {
        setYouDamageTaken((prev) => prev + dmg);
      }
    };

    const handleOpponentStrike = (payload: {
      reason?: string;
      damage?: number;
      hp?: { you?: number; opponent?: number };
    }) => {
      console.log("[client] opponentStrike received", payload);
      const dmg = Math.max(0, payload.damage ?? 0);
      if (dmg > 0) {
        setLatestOpponentDamage(dmg);
        setOpponentHitKey((k) => k + 1);
        pushCombatEvent("opponent", {
          text: `-${Math.round(dmg)} HP`,
          color: "#fda4af",
          className: "bg-rose-950/90 text-rose-100"
        });
      }
      if (typeof payload.hp?.opponent === "number") {
        setOpponentDamageTaken(Math.max(0, MAX_HP - payload.hp.opponent));
      } else if (dmg > 0) {
        setOpponentDamageTaken((prev) => prev + dmg);
      }
    };

    const handleLiveLeaderboard = (payload: {
      entries?: Array<{
        name: string;
        score: number;
        strikes?: number;
        eliminated?: boolean;
      }>;
      scores?: { you: number; opponent: number };
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
      answerMs?: number | null;
      opponentAnswerMs?: number | null;
      speedTier?: SpeedTier;
      opponentSpeedTier?: SpeedTier;
      pointsAwarded?: number;
      guardianMitigatedDamage?: number;
      guardianStoredDamage?: number;
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
      novaBonusRemaining?: number;
      opponentNovaBonusRemaining?: number;
      infernoPending?: boolean;
      infernoPendingUntil?: number;
      opponentInfernoPending?: boolean;
      opponentInfernoPendingUntil?: number;
      flashOverclockStacks?: number;
      opponentFlashOverclockStacks?: number;
      architectUntil?: number;
      opponentArchitectUntil?: number;
      architectSequenceStreak?: number;
      opponentArchitectSequenceStreak?: number;
      architectNodes?: number;
      opponentArchitectNodes?: number;
      titanOverpowerUntil?: number;
      opponentTitanOverpowerUntil?: number;
      titanLifestealApplied?: number;
      youAnswered?: boolean;
      opponentAnswered?: boolean;
      hp?: { you?: number | null; opponent?: number | null };
    }) => {
      console.log("[client] pointScored received", payload);
      const nextScores = payload.scores ?? payload.playerScores;
      const streakValue = payload.streak ?? 0;
      const opponentStreakValue = payload.opponentStreak ?? 0;
      const yourSpeedTier = normalizeSpeedTier(payload.speedTier, payload.fastAnswer);
      const opponentSpeedTier = normalizeSpeedTier(payload.opponentSpeedTier, payload.opponentFastAnswer);
      // Track peak streaks for end-of-match summary
      if (streakValue > peakYouStreakRef.current) peakYouStreakRef.current = streakValue;
      if (opponentStreakValue > peakOpponentStreakRef.current) peakOpponentStreakRef.current = opponentStreakValue;
      const previousFeedback = feedbackRef.current;

      // Determine who scored by comparing new values against the previous score
      const prevScores = scoresRef.current;
      const newYouScore = nextScores?.you ?? payload.you ?? 0;
      const newOpponentScore = nextScores?.opponent ?? payload.opponent ?? 0;
      const youScored = newYouScore > prevScores.you;
      const opponentScored = newOpponentScore > prevScores.opponent;
      if (youScored) correctAnswersRef.current += 1;
      if (newYouScore > prevScores.you) triggerScoreGlow("you");
      if (newOpponentScore > prevScores.opponent) triggerScoreGlow("opponent");
      if (previousFeedback.youStreak >= 2 && streakValue === 0 && previousFeedback.youStreak > streakValue) {
        pushMomentCallout("COMBO BREAKER", "rose", "you");
      }
      if (previousFeedback.opponentStreak >= 2 && opponentStreakValue === 0 && previousFeedback.opponentStreak > opponentStreakValue) {
        pushMomentCallout("COMBO BREAKER", "cyan", "opponent");
      }

      const rawHp = payload.hp;
      // Narrow to a typed object so TS knows `you` / `opponent` are numbers (not only when inlined).
      const authoritativeHp =
        rawHp != null && typeof rawHp.you === "number" && typeof rawHp.opponent === "number"
          ? { you: rawHp.you, opponent: rawHp.opponent }
          : null;
      // Server applies ultimates, bursts, mitigation, etc.; local calcDamage() only
      // approximates one slice — sync bars from authoritative HP whenever present.
      if (authoritativeHp) {
        setYouDamageTaken(Math.max(0, MAX_HP - authoritativeHp.you));
        setOpponentDamageTaken(Math.max(0, MAX_HP - authoritativeHp.opponent));
      }

      // HP damage tracking — apply damage when either player scores
      if (youScored) {
        // Instant feedback: correct answer tick
        soundManager.play("correct", { volume: 0.28, rate: 1.05 });
        pushQuestionFlash("correct");
        pushAnswerFeedback("correct", lastSubmittedAnswerRef.current);
        if (yourSpeedTier === "lightning") {
          pushCombatEvent("you", { text: "LIGHTNING", color: "#fde68a", className: "bg-amber-950/90 text-amber-100", duration: 0.95 });
        } else if (yourSpeedTier === "fast") {
          pushCombatEvent("you", { text: "FAST", color: "#bae6fd", className: "bg-sky-950/90 text-sky-100", duration: 0.9 });
        }
        const nowFx = Date.now();
        const pfx = payload as Record<string, number | undefined>;
        const overclockCombo = pfx.overclockCombo ?? 0;
        if (overclockCombo > 0) {
          triggerFlashBolt(Math.max(1, Math.round(overclockCombo / 100)));
          soundManager.play("overclockStack", { volume: 0.18, rate: 1.06, allowOverlap: true });
        }
        if ((payload.flashOverclockStacks ?? 0) > (ultimateRef.current.flashOverclockStacks ?? 0)) {
          pushCombatEvent("you", {
            text: `POWER x${payload.flashOverclockStacks}`,
            color: "#fde68a",
            className: "bg-amber-950/90 text-amber-100"
          });
        }
        const architectNodesGained = pfx.architectNodesGained ?? 0;
        if ((pfx.architectUntil ?? 0) > nowFx && architectNodesGained > 0) {
          triggerArchitectOrb();
          soundManager.play("overclockStack", { volume: 0.16, rate: 1.08, allowOverlap: true });
          pushCombatEvent("you", {
            text: "NODE +1",
            color: "#67e8f9",
            className: "bg-cyan-950/90 text-cyan-100"
          });
          if ((payload.architectNodes ?? 0) >= 5) {
            pushCombatEvent("you", {
              text: "SYSTEM READY",
              color: "#a5f3fc",
              className: "bg-cyan-950/90 text-cyan-100",
              duration: 1.15
            });
          }
        }
        if ((pfx.infernoPendingUntil ?? 0) > nowFx) {
          triggerInfernoVolley("you", pfx.novaBonusRemaining ?? 0);
          if ((payload.novaBonusRemaining ?? 0) > (ultimateRef.current.novaBonusRemaining ?? 0)) {
            pushCombatEvent("you", {
              text: `BURN x${payload.novaBonusRemaining}`,
              color: "#fda4af",
              className: "bg-rose-950/90 text-rose-100"
            });
          }
        }
        if ((pfx.titanOverpowerUntil ?? 0) > nowFx) {
          triggerTitanSlam();
          if ((pfx.titanLifestealApplied ?? 0) > 0) {
            triggerTitanHealRipple();
            soundManager.play("titanLifesteal", { volume: 0.18, rate: 0.96, allowOverlap: true });
            pushCombatEvent("you", {
              text: `+${pfx.titanLifestealApplied} HP`,
              color: "#86efac",
              className: "bg-emerald-950/90 text-emerald-100"
            });
          }
        }
        if ((payload.guardianMitigatedDamage ?? 0) > 0) {
          pushCombatEvent("opponent", {
            text: `MITIGATED ${payload.guardianMitigatedDamage}`,
            color: "#7dd3fc",
            className: "bg-cyan-950/90 text-cyan-100"
          });
          pushCombatEvent("opponent", {
            text: `STORED ${payload.guardianStoredDamage ?? 0}`,
            color: "#a5f3fc",
            className: "bg-cyan-950/90 text-cyan-100"
          });
        }
        const youPointsDelta = newYouScore - prevScores.you;
        const dmgDealt = calcDamage(youPointsDelta, yourSpeedTier, streakValue);
        const flashTierForOpp =
          overclockCombo > 0
            ? Math.max(1, Math.round(overclockCombo / 100))
            : yourSpeedTier === "lightning"
              ? 2
              : yourSpeedTier === "fast"
                ? 1
                : 0;
        if (dmgDealt > 0) {
          setOpponentDamageFlashTier(flashTierForOpp);
          if (opponentFlashTierClearRef.current) clearTimeout(opponentFlashTierClearRef.current);
          opponentFlashTierClearRef.current = setTimeout(() => {
            setOpponentDamageFlashTier(0);
            opponentFlashTierClearRef.current = null;
          }, 1000);
          const infernoStacks = Math.max(0, ultimate.novaBonusRemaining ?? 0);
          const isUltimateHit =
            ultimate.overclockUntil > Date.now() ||
            ultimate.infernoPendingUntil > Date.now();
          const type = classifyHit({ streak: streakValue, isUltimate: isUltimateHit });
          const infernoSpike = infernoStacks > 0 ? Math.min(1.45, 1 + infernoStacks * 0.07) : 1;
          const intensity = Math.min(1, intensityFromDamage(dmgDealt) * (type === "ultimate" ? 1.12 : 1) * infernoSpike);
          const delayMs = 80;
          const t = setTimeout(() => {
            setOpponentHitType(type);
            setOpponentHitIntensity(intensity);
            setLatestOpponentSpeedTier(yourSpeedTier);
            if (!authoritativeHp) {
              setOpponentDamageTaken((prev) => prev + dmgDealt);
            }
            setLatestOpponentDamage(dmgDealt);
            setOpponentHitKey((prev) => prev + 1);
            playHitSound(type, intensity);
          }, delayMs);
          hitDelayTimeoutsRef.current.add(t);
          setTimeout(() => hitDelayTimeoutsRef.current.delete(t), delayMs + 20);
        } else {
          setOpponentDamageFlashTier(0);
          if (opponentFlashTierClearRef.current) {
            clearTimeout(opponentFlashTierClearRef.current);
            opponentFlashTierClearRef.current = null;
          }
        }
      }
      if (opponentScored) {
        // Instant feedback: opponent also landed a correct answer
        soundManager.play("correct", { volume: 0.22, rate: 0.98 });
        const nowO = Date.now();
        const pfxO = payload as Record<string, number | undefined>;
        const scorerOc = (payload as { scorerOverclockCombo?: number }).scorerOverclockCombo ?? 0;
        const flashTierYou =
          scorerOc > 0
            ? Math.max(1, Math.round(scorerOc / 100))
            : opponentSpeedTier === "lightning"
              ? 2
              : opponentSpeedTier === "fast"
                ? 1
                : 0;
        const opponentArchitectNodesGained = pfxO.architectNodesGained ?? 0;
        if ((pfxO.opponentArchitectUntil ?? 0) > nowO && opponentArchitectNodesGained > 0) {
          pushCombatEvent("opponent", {
            text: "NODE +1",
            color: "#67e8f9",
            className: "bg-cyan-950/90 text-cyan-100"
          });
          if ((payload.opponentArchitectNodes ?? 0) >= 5) {
            pushCombatEvent("opponent", {
              text: "SYSTEM READY",
              color: "#a5f3fc",
              className: "bg-cyan-950/90 text-cyan-100",
              duration: 1.15
            });
          }
        }
        if ((payload.opponentFlashOverclockStacks ?? 0) > (ultimateRef.current.opponentFlashOverclockStacks ?? 0)) {
          pushCombatEvent("opponent", {
            text: `POWER x${payload.opponentFlashOverclockStacks}`,
            color: "#fde68a",
            className: "bg-amber-950/90 text-amber-100"
          });
          soundManager.play("overclockStack", { volume: 0.18, rate: 1.04, allowOverlap: true });
        }
        if ((pfxO.opponentInfernoPendingUntil ?? 0) > nowO) {
          triggerInfernoVolley("opponent", pfxO.opponentNovaBonusRemaining ?? 0);
          if ((payload.opponentNovaBonusRemaining ?? 0) > (ultimateRef.current.opponentNovaBonusRemaining ?? 0)) {
            pushCombatEvent("opponent", {
              text: `BURN x${payload.opponentNovaBonusRemaining}`,
              color: "#fda4af",
              className: "bg-rose-950/90 text-rose-100"
            });
          }
        }
        if ((pfxO.opponentTitanOverpowerUntil ?? 0) > nowO) {
          triggerTitanSlam();
          if ((pfxO.titanLifestealApplied ?? 0) > 0) {
            pushCombatEvent("opponent", {
              text: `+${pfxO.titanLifestealApplied} HP`,
              color: "#86efac",
              className: "bg-emerald-950/90 text-emerald-100"
            });
            soundManager.play("titanLifesteal", { volume: 0.16, rate: 0.94, allowOverlap: true });
          }
        }
        if ((payload.guardianMitigatedDamage ?? 0) > 0) {
          pushCombatEvent("you", {
            text: `MITIGATED ${payload.guardianMitigatedDamage}`,
            color: "#7dd3fc",
            className: "bg-cyan-950/90 text-cyan-100"
          });
          pushCombatEvent("you", {
            text: `STORED ${payload.guardianStoredDamage ?? 0}`,
            color: "#a5f3fc",
            className: "bg-cyan-950/90 text-cyan-100"
          });
        }
        const oppPointsDelta = newOpponentScore - prevScores.opponent;
        const dmgTaken = calcDamage(oppPointsDelta, opponentSpeedTier, opponentStreakValue);
        if (dmgTaken > 0) {
          setYouDamageFlashTier(flashTierYou);
          if (youFlashTierClearRef.current) clearTimeout(youFlashTierClearRef.current);
          youFlashTierClearRef.current = setTimeout(() => {
            setYouDamageFlashTier(0);
            youFlashTierClearRef.current = null;
          }, 1000);
          const infernoStacks = Math.max(0, ultimate.opponentNovaBonusRemaining ?? 0);
          const isUltimateHit =
            ultimate.opponentOverclockUntil > Date.now() ||
            ultimate.opponentInfernoPendingUntil > Date.now();
          const type = classifyHit({ streak: opponentStreakValue, isUltimate: isUltimateHit });
          const infernoSpike = infernoStacks > 0 ? Math.min(1.45, 1 + infernoStacks * 0.07) : 1;
          const intensity = Math.min(1, intensityFromDamage(dmgTaken) * (type === "ultimate" ? 1.12 : 1) * infernoSpike);
          const delayMs = 80;
          const t = setTimeout(() => {
            setYouHitType(type);
            setYouHitIntensity(intensity);
            setLatestYouSpeedTier(opponentSpeedTier);
            if (!authoritativeHp) {
              setYouDamageTaken((prev) => prev + dmgTaken);
            }
            setLatestYouDamage(dmgTaken);
            setYouHitKey((prev) => prev + 1);
            playHitSound(type, intensity);
          }, delayMs);
          hitDelayTimeoutsRef.current.add(t);
          setTimeout(() => hitDelayTimeoutsRef.current.delete(t), delayMs + 20);
        } else {
          setYouDamageFlashTier(0);
          if (youFlashTierClearRef.current) {
            clearTimeout(youFlashTierClearRef.current);
            youFlashTierClearRef.current = null;
          }
        }
      }
      const secondsRemaining = timerSecondsRef.current;
      const isCloseRace = Math.abs(newYouScore - newOpponentScore) <= CLOSE_SCORE_DELTA;
      const endgameBoost = isCloseRace ? 2 : 1;
      if (secondsRemaining <= FINAL_PHASE_SECONDS) {
        if (youScored) {
          setScoreImpactKey((previous) => ({
            ...previous,
            you: previous.you + endgameBoost
          }));
        }
        if (opponentScored) {
          setScoreImpactKey((previous) => ({
            ...previous,
            opponent: previous.opponent + endgameBoost
          }));
        }
      }
      if (secondsRemaining <= CLUTCH_SECONDS) {
        if (youScored) {
          setClutchMoment((previous) => ({ side: "you", key: previous.key + 1 }));
          soundManager.play("fast");
        } else if (opponentScored) {
          setClutchMoment((previous) => ({ side: "opponent", key: previous.key + 1 }));
          soundManager.play("fast");
        }
      }

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
        soundManager.play("fast", { volume: 0.2, rate: 1.12 });
      } else if (payload.opponentFastAnswer) {
        soundManager.play("fast", { volume: 0.18, rate: 1.05 });
      }

      // Light streak accent (only when entering 3+ streak)
      if (streakValue >= 3 && streakValue > previousFeedback.youStreak) {
        soundManager.play("streak", { volume: 0.24, rate: 1.04 });
      } else if (opponentStreakValue >= 3 && opponentStreakValue > previousFeedback.opponentStreak) {
        soundManager.play("streak", { volume: 0.22, rate: 1.0 });
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
      jamDurationMs?: number;
      secondsRemaining?: number;
      questionsRemaining?: number;
      damage?: number;
      marksConsumed?: number;
      hp?: { you?: number; opponent?: number };
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
      setUltimateActivating(false);
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
      const activationLabel =
        payload.by === "you"
          ? (payload.ultimateName ?? payload.type)
          : (payload.opponentUltimateName ?? payload.type);
      const activationText = `${activationLabel.toUpperCase()} ACTIVATED`;
      pushUltimateToast(activationText, payload.by);
      pushCombatEvent(payload.by === "you" ? "you" : "opponent", {
        text: activationText,
        color: payload.by === "you" ? "#e2e8f0" : "#fecdd3",
        className:
          payload.by === "you"
            ? "bg-slate-950/92 text-slate-100"
            : "bg-rose-950/92 text-rose-100",
        duration: 1
      });
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
        pushCombatEvent("you", {
          text: "JAMMED",
          color: "#c4b5fd",
          className: "bg-violet-950/90 text-violet-100"
        });
        soundManager.play("jammed", { volume: 0.18, rate: 1.0, allowOverlap: true });
      }

      if (payload.effect === "system_corrupt_active" && payload.target === "you") {
        const jamMs =
          typeof payload.jamDurationMs === "number"
            ? payload.jamDurationMs
            : payload.durationMs;
        if (jamMs && jamMs > 0) {
          setUltimate((previous) => ({
            ...previous,
            blackoutUntil: Math.max(previous.blackoutUntil, Date.now() + jamMs),
          }));
          setAnswer("");
        }
      }

      if (payload.effect === "perfect_strike" && payload.damage && payload.damage > 0 && payload.hp) {
        // Server-authoritative HP update for the strike burst.
        if (payload.target === "opponent") {
          if (typeof payload.hp.opponent === "number") {
            setOpponentHitType("ultimate");
            setOpponentHitIntensity(Math.min(1, 0.5 + (payload.marksConsumed ?? 0) * 0.06));
            setOpponentDamageTaken(Math.max(0, MAX_HP - payload.hp.opponent));
            setLatestOpponentDamage(Math.max(0, payload.damage));
            setOpponentHitKey((prev) => prev + 1);
            soundManager.play("hitUltimate", { volume: 0.28, rate: 1.06, allowOverlap: true });
            triggerScreenShake(Math.min(1, 0.6 + (payload.marksConsumed ?? 0) * 0.05));
          }
        } else if (payload.target === "you") {
          if (typeof payload.hp.you === "number") {
            setYouHitType("ultimate");
            setYouHitIntensity(Math.min(1, 0.5 + (payload.marksConsumed ?? 0) * 0.06));
            setYouDamageTaken(Math.max(0, MAX_HP - payload.hp.you));
            setLatestYouDamage(Math.max(0, payload.damage));
            setYouHitKey((prev) => prev + 1);
            soundManager.play("hitUltimate", { volume: 0.28, rate: 0.98, allowOverlap: true });
            triggerScreenShake(Math.min(1, 0.6 + (payload.marksConsumed ?? 0) * 0.05));
          }
        }
      }
    };

    const handleUltimateEnded = (payload: {
      by: "you" | "opponent";
      target: "you" | "opponent";
      type: string;
      effect: string;
      damage?: number;
      corruptionStacks?: number;
      hp?: { you?: number; opponent?: number };
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
      shockwaveDamage?: number;
    }) => {
      console.log("[client] ultimateEnded received", payload);
      setUltimateActivating(false);
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

      if (payload.effect === "aegis_domain_ended") {
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
        ultimateCueTimeoutRef.current = setTimeout(() => {
          setUltimateCue((previous) => (previous?.id === cueId ? null : previous));
        }, 620);

        if (payload.by === "you") {
          setYouUltimateFxType(normalizedType);
          setYouUltimateFxKey((value) => value + 1);
        } else {
          setOpponentUltimateFxType(normalizedType);
          setOpponentUltimateFxKey((value) => value + 1);
        }
      }

      if (payload.effect === "system_corrupt_ended") {
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
        ultimateCueTimeoutRef.current = setTimeout(() => {
          setUltimateCue((previous) => (previous?.id === cueId ? null : previous));
        }, 680);

        if (payload.by === "you") {
          setYouUltimateFxType(normalizedType);
          setYouUltimateFxKey((value) => value + 1);
        } else {
          setOpponentUltimateFxType(normalizedType);
          setOpponentUltimateFxKey((value) => value + 1);
        }
      }

      if (payload.effect === "perfect_strike") {
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
        ultimateCueTimeoutRef.current = setTimeout(() => {
          setUltimateCue((previous) => (previous?.id === cueId ? null : previous));
        }, 720);

        if (payload.by === "you") {
          setYouUltimateFxType(normalizedType);
          setYouUltimateFxKey((value) => value + 1);
        } else {
          setOpponentUltimateFxType(normalizedType);
          setOpponentUltimateFxKey((value) => value + 1);
        }
      }

      if (payload.effect === "break_hit") {
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
        ultimateCueTimeoutRef.current = setTimeout(() => {
          setUltimateCue((previous) => (previous?.id === cueId ? null : previous));
        }, 680);

        if (payload.by === "you") {
          setYouUltimateFxType(normalizedType);
          setYouUltimateFxKey((value) => value + 1);
        } else {
          setOpponentUltimateFxType(normalizedType);
          setOpponentUltimateFxKey((value) => value + 1);
        }
      }

      if (payload.effect === "system_corrupt_ended" && payload.damage && payload.damage > 0 && payload.hp) {
        // Server-authoritative HP update for corruption detonation.
        if (payload.target === "opponent") {
          // You detonated on opponent
          if (typeof payload.hp.opponent === "number") {
            setOpponentHitType("ultimate");
            setOpponentHitIntensity(Math.min(1, 0.42 + (payload.corruptionStacks ?? 0) * 0.08));
            setOpponentDamageTaken(Math.max(0, MAX_HP - payload.hp.opponent));
            setLatestOpponentDamage(Math.max(0, payload.damage));
            setOpponentHitKey((prev) => prev + 1);
            soundManager.play("hitUltimate", { volume: 0.26, rate: 1.02, allowOverlap: true });
          }
        } else if (payload.target === "you") {
          // Opponent detonated on you
          if (typeof payload.hp.you === "number") {
            setYouHitType("ultimate");
            setYouHitIntensity(Math.min(1, 0.42 + (payload.corruptionStacks ?? 0) * 0.08));
            setYouDamageTaken(Math.max(0, MAX_HP - payload.hp.you));
            setLatestYouDamage(Math.max(0, payload.damage));
            setYouHitKey((prev) => prev + 1);
            soundManager.play("hitUltimate", { volume: 0.26, rate: 0.98, allowOverlap: true });
          }
        }
      }

      if (payload.effect === "guardian_burst_release" && payload.damage && payload.damage > 0 && payload.hp) {
        const dmg = Math.max(0, Number(payload.damage) || 0);
        pushCombatEvent(payload.by === "you" ? "opponent" : "you", {
          text: `SHOCKWAVE -${dmg}`,
          color: "#7dd3fc",
          className: "bg-cyan-950/90 text-cyan-100",
          duration: 1.25
        });
        if (payload.by === "you" && typeof payload.hp.opponent === "number") {
          setOpponentHitType("ultimate");
          setOpponentHitIntensity(Math.min(1, 0.48 + dmg * 0.02));
          setOpponentDamageTaken(Math.max(0, MAX_HP - payload.hp.opponent));
          setLatestOpponentDamage(dmg);
          setOpponentHitKey((prev) => prev + 1);
          soundManager.play("hitUltimate", { volume: 0.3, rate: 1.0, allowOverlap: true });
          triggerScreenShake(Math.min(1, 0.55 + dmg * 0.015));
        } else if (payload.by === "opponent" && typeof payload.hp.you === "number") {
          setYouHitType("ultimate");
          setYouHitIntensity(Math.min(1, 0.48 + dmg * 0.02));
          setYouDamageTaken(Math.max(0, MAX_HP - payload.hp.you));
          setLatestYouDamage(dmg);
          setYouHitKey((prev) => prev + 1);
          soundManager.play("hitUltimate", { volume: 0.28, rate: 0.96, allowOverlap: true });
          triggerScreenShake(Math.min(1, 0.52 + dmg * 0.015));
        }

        const normalizedType = normalizeUltimateType("shield");
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
        ultimateCueTimeoutRef.current = setTimeout(() => {
          setUltimateCue((previous) => (previous?.id === cueId ? null : previous));
        }, 700);
        if (payload.by === "you") {
          setYouUltimateFxType(normalizedType);
          setYouUltimateFxKey((value) => value + 1);
        } else {
          setOpponentUltimateFxType(normalizedType);
          setOpponentUltimateFxKey((value) => value + 1);
        }
      }

      if (
        (payload.effect === "architect_manual_detonate" || payload.effect === "architect_auto_detonate") &&
        payload.damage &&
        payload.damage > 0 &&
        payload.hp
      ) {
        const dmg = Math.max(0, Number(payload.damage) || 0);
        pushCombatEvent(payload.by === "you" ? "opponent" : "you", {
          text: `SYSTEM RELEASE -${dmg}`,
          color: "#67e8f9",
          className: "bg-cyan-950/90 text-cyan-100",
          duration: 1.2
        });
        triggerArchitectBeam();
        soundManager.play("sequenceBurst", {
          volume: 0.22,
          rate: payload.by === "you" ? 1.02 : 0.96,
          allowOverlap: true
        });

        if (payload.by === "you" && typeof payload.hp.opponent === "number") {
          setOpponentHitType("ultimate");
          setOpponentHitIntensity(Math.min(1, 0.5 + dmg * 0.02));
          setOpponentDamageTaken(Math.max(0, MAX_HP - payload.hp.opponent));
          setLatestOpponentDamage(dmg);
          setOpponentHitKey((prev) => prev + 1);
        } else if (payload.by === "opponent" && typeof payload.hp.you === "number") {
          setYouHitType("ultimate");
          setYouHitIntensity(Math.min(1, 0.5 + dmg * 0.02));
          setYouDamageTaken(Math.max(0, MAX_HP - payload.hp.you));
          setLatestYouDamage(dmg);
          setYouHitKey((prev) => prev + 1);
        }
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
      pushCombatEvent(payload.target, {
        text: "BLOCKED",
        color: "#7dd3fc",
        className: "bg-cyan-950/90 text-cyan-100"
      });
      soundManager.play("shieldBlock");
    };

    const handleBurnTick = (payload: {
      by: "you" | "opponent";
      target: "you" | "opponent";
      damage?: number;
      burnStacks?: number;
      hp?: { you?: number; opponent?: number };
    } & Partial<UltimateState>) => {
      const damage = Math.max(0, payload.damage ?? 0);
      if (damage <= 0) {
        syncUltimateFromPayload(payload);
        return;
      }

      syncUltimateFromPayload(payload);
      soundManager.play("burnTick", { volume: 0.22, rate: 1.02, allowOverlap: true });
      const intensity = Math.min(1, 0.35 + (payload.burnStacks ?? 0) * 0.08);
      triggerBurnTickFlare(payload.target === "you" ? "you" : "opponent");
      pushCombatEvent(payload.target, {
        text: `BURN -${damage}`,
        color: "#fda4af",
        className: "bg-rose-950/90 text-rose-100"
      });

      if (payload.target === "you") {
        setYouHitType("ultimate");
        setYouHitIntensity(intensity);
        setLatestYouDamage(damage);
        setYouHitKey((prev) => prev + 1);
        if (typeof payload.hp?.you === "number") {
          setYouDamageTaken(Math.max(0, MAX_HP - payload.hp.you));
        } else {
          setYouDamageTaken((prev) => prev + damage);
        }
      } else {
        setOpponentHitType("ultimate");
        setOpponentHitIntensity(intensity);
        setLatestOpponentDamage(damage);
        setOpponentHitKey((prev) => prev + 1);
        if (typeof payload.hp?.opponent === "number") {
          setOpponentDamageTaken(Math.max(0, MAX_HP - payload.hp.opponent));
        } else {
          setOpponentDamageTaken((prev) => prev + damage);
        }
      }
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
        console.warn("[client] emotePlayed room mismatch; updating room ref", {
          currentRoomId: currentMatchRoomIdRef.current,
          payloadRoomId: payload.roomId
        });
        currentMatchRoomIdRef.current = payload.roomId;
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
      endCondition?: string;
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
      setUltimateActivating(false);
      setRoomStartPending(false);
      setCopyRoomPending(false);
      setLeavePending(false);
      setIsFinalPhase(false);
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
      setCurrentQuestionData(null);
      setTimeoutDecisionPrompt({ open: false, token: 0 });
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
      setYouCombatEvents([]);
      setOpponentCombatEvents([]);
      setUltimateToast(null);
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
      if (payload.endCondition === "ko") {
        soundManager.play(result === "loss" ? "koLose" : "koWin", { volume: 0.38, rate: 1.0, allowOverlap: true });
      } else if (result === "draw") {
        soundManager.play("tick", { volume: 0.22, rate: 0.9 });
      } else {
        soundManager.play(result === "loss" ? "lose" : "win", { volume: 0.34, rate: 1.0, allowOverlap: true });
      }

      // Claim match rewards — calculate client-side, persist for authenticated users
      {
        const isKo = payload.endCondition === "ko";
        const isAiMatch = !currentMatchRoomIdRef.current || currentMatchRoomIdRef.current.startsWith("ai-");
        const claimToken = matchTokenRef.current;
        import("@/lib/match-rewards").then(({ calculateMatchRewards, computeLevel }) => {
          const breakdown = calculateMatchRewards({
            result,
            correctAnswers: correctAnswersRef.current,
            peakStreak: peakYouStreakRef.current,
            isKo,
            isAiMatch,
          });
          const supabase = getSupabaseClient();
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session?.access_token || !claimToken) {
              // Guest: show rewards visually without persisting
              setMatchRewards({
                xpAwarded: breakdown.totalXp,
                coinsAwarded: breakdown.totalCoins,
                levelBefore: 1,
                levelAfter: 1,
                leveledUp: false,
                wallet: { xp: breakdown.totalXp, coins: breakdown.totalCoins, level: 1 },
                breakdown,
              });
              return;
            }
            fetch("/api/match-rewards/claim", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                matchToken: claimToken,
                result,
                correctAnswers: correctAnswersRef.current,
                peakStreak: peakYouStreakRef.current,
                isKo,
                isAiMatch,
              }),
            })
              .then((res) => {
                if (res.ok) return res.json();
                if (res.status === 409) return null; // already claimed, no-op
                return null;
              })
              .then((data) => {
                if (data && typeof data.xpAwarded === "number") {
                  setMatchRewards(data as import("@/lib/match-rewards").MatchRewardsClaimResponse);
                } else {
                  // API failed — still show client-side rewards (don't show wallet totals)
                  const { level } = computeLevel(breakdown.totalXp);
                  setMatchRewards({
                    xpAwarded: breakdown.totalXp,
                    coinsAwarded: breakdown.totalCoins,
                    levelBefore: level,
                    levelAfter: level,
                    leveledUp: false,
                    wallet: { xp: breakdown.totalXp, coins: breakdown.totalCoins, level },
                    breakdown,
                  });
                }
              })
              .catch(() => {
                // Silently ignore network errors
              });
          });
        }).catch(() => {
          // Dynamic import failed — skip rewards display
        });
      }
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
      setCurrentQuestionData(null);
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
      setYouCombatEvents([]);
      setOpponentCombatEvents([]);
      setUltimateToast(null);
      seenEmoteMessageIdsRef.current.clear();
      setRematchRequested(false);
      setOpponentRematchRequested(false);
      setRematchProgress({ requestedPlayers: 0, requiredPlayers: 2 });
      setIsFinalPhase(false);
      setScoreImpactKey({ you: 0, opponent: 0 });
      setClutchMoment({ key: 0, side: null });
      setGameResult({
        result: "loss",
        message: payload.message ?? "Opponent left the game",
        peakStreak: peakYouStreakRef.current,
        opponentPeakStreak: peakOpponentStreakRef.current
      });
      setStatus("opponent-left");
    };

    nextSocket.on("connect", handleConnect);
    nextSocket.on("disconnect", handleDisconnect);
    nextSocket.on("connect_error", handleConnectError);
    nextSocket.io.on("reconnect_attempt", handleReconnectAttempt);
    nextSocket.io.on("reconnect", handleReconnect);
    nextSocket.io.on("reconnect_failed", handleReconnectFailed);
    nextSocket.on("authRequired", handleAuthRequired);
    nextSocket.on("roomCreated", handleRoomCreated);
    nextSocket.on("roomJoined", handleRoomJoined);
    nextSocket.on("roomUpdated", handleRoomUpdated);
    nextSocket.on("roomError", handleRoomError);
    nextSocket.on("matchFound", handleMatchFound);
    nextSocket.on("countdown", handleCountdown);
    nextSocket.on("newQuestion", handleNewQuestion);
    nextSocket.on("timeoutDecisionPrompt", handleTimeoutDecisionPrompt);
    nextSocket.on("timeoutDecisionResolved", handleTimeoutDecisionResolved);
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
    nextSocket.on("burnTick", handleBurnTick);
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
      if (ultimateActivateTimeoutRef.current) {
        clearTimeout(ultimateActivateTimeoutRef.current);
        ultimateActivateTimeoutRef.current = null;
      }
      nextSocket.off("connect", handleConnect);
      nextSocket.off("disconnect", handleDisconnect);
      nextSocket.off("connect_error", handleConnectError);
      nextSocket.io.off("reconnect_attempt", handleReconnectAttempt);
      nextSocket.io.off("reconnect", handleReconnect);
      nextSocket.io.off("reconnect_failed", handleReconnectFailed);
      nextSocket.off("authRequired", handleAuthRequired);
      nextSocket.off("roomCreated", handleRoomCreated);
      nextSocket.off("roomJoined", handleRoomJoined);
      nextSocket.off("roomUpdated", handleRoomUpdated);
      nextSocket.off("roomError", handleRoomError);
      nextSocket.off("matchFound", handleMatchFound);
      nextSocket.off("countdown", handleCountdown);
      nextSocket.off("newQuestion", handleNewQuestion);
      nextSocket.off("timeoutDecisionPrompt", handleTimeoutDecisionPrompt);
      nextSocket.off("timeoutDecisionResolved", handleTimeoutDecisionResolved);
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
      nextSocket.off("burnTick", handleBurnTick);
      nextSocket.off("emotePlayed", handleEmotePlayed);
      nextSocket.off("opponentTyping", handleOpponentTyping);
      nextSocket.off("gameOver", handleGameOver);
      nextSocket.off("rematchStatus", handleRematchStatus);
      nextSocket.off("opponentLeft", handleOpponentLeft);
      nextSocket.removeAllListeners();
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [difficulty, normalizedRoomCode, retryKey, roomJoinMode, router, topic]);

  const isOpponentNeuralJamVictim = ultimate.jammed;
  const isNeuralBurstLocked = neuralInputUnlockAt > Date.now();

  const submitAnswer = (rawValue?: string) => {
    const trimmedAnswer = (rawValue ?? answer).trim();

    if (!socket || !trimmedAnswer || status !== "playing" || eliminated.you) {
      return;
    }

    if (isNeuralBurstLocked || isOpponentNeuralJamVictim || titanRecoveryLocked) {
      return;
    }

    if (ultimate.blackoutUntil > Date.now()) {
      return;
    }

    // Reset typing throttle so next question triggers fresh emit
    lastTypingEmitRef.current = 0;

    const isCorruptActive =
      ultimate.shadowCorruptUntil > Date.now() || ultimate.opponentShadowCorruptUntil > Date.now();
    const emitSubmit = () => {
      console.log(`[client] submitAnswer emitted -> ${trimmedAnswer} token=${currentQuestionTokenRef.current}`);
      lastSubmittedAnswerRef.current = trimmedAnswer;
      socket.emit("submitAnswer", { answer: trimmedAnswer, token: currentQuestionTokenRef.current });
      setAnswer("");
    };

    if (!isCorruptActive) {
      emitSubmit();
      return;
    }

    // Subtle input interference: tiny randomized latency (no blocking, no scrambling).
    const delayMs = 60 + Math.floor(Math.random() * 90);
    window.setTimeout(emitSubmit, delayMs);
  };

  const handleSkipQuestionTimeout = () => {
    if (!socket || !timeoutDecisionPrompt.open) return;
    if (isNeuralBurstLocked) {
      return;
    }
    if (ultimate.blackoutUntil > Date.now()) {
      return;
    }
    socket.emit("timeoutDecision", {
      action: "change",
      token: timeoutDecisionPrompt.token
    });
  };

  /**
   * Throttled handler for answer input changes.
   * Emits playerTyping at most once per 3 s while the input has content.
   * Never emits when the input is cleared (opponent sees nothing = cleared).
   */
  const handleAnswerChange = (value: string) => {
    if (ultimate.blackoutUntil > Date.now()) {
      return;
    }

    if (isNeuralBurstLocked || isOpponentNeuralJamVictim || titanRecoveryLocked) {
      return;
    }

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

  const handleOptionSubmit = (option: string) => {
    if (!option) return;
    submitAnswer(option);
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
    setLeavePending(true);
    if (socket && roomLobby) {
      socket.emit("leaveRoom");
    }
    currentMatchRoomIdRef.current = null;
    router.push("/");
  };

  const handleReturnToLobby = () => {
    if (leavePending) {
      return;
    }
    setLeavePending(true);
    if (socket && roomLobby) {
      socket.emit("leaveRoom");
    }
    currentMatchRoomIdRef.current = null;
    router.push("/");
  };

  const handleStartRoomMatch = () => {
    if (!socket || !roomLobby?.isHost || !roomLobby.canStart || roomStartPending) {
      return;
    }

    setRoomStartPending(true);
    socket.emit("startRoomMatch");
  };

  const handleCopyRoomCode = async () => {
    if (!roomLobby?.roomCode || copyRoomPending) {
      return;
    }

    try {
      setCopyRoomPending(true);
      await navigator.clipboard.writeText(roomLobby.roomCode);
      setRoomNotice("Room code copied.");
      setTimeout(() => setRoomNotice(null), 1200);
    } catch {
      setRoomErrorMessage("Could not copy room code.");
      setRoomNotice(null);
    } finally {
      setCopyRoomPending(false);
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

    const architectRelease =
      ultimate.type === "perfect_sequence" &&
      ultimate.architectUntil > Date.now();

    if ((!ultimate.ready && !architectRelease) || !ultimate.implemented || youEliminated || ultimateActivating) {
      return;
    }

    setUltimateActivating(true);
    if (ultimateActivateTimeoutRef.current) {
      clearTimeout(ultimateActivateTimeoutRef.current);
    }
    ultimateActivateTimeoutRef.current = setTimeout(() => {
      setUltimateActivating(false);
      ultimateActivateTimeoutRef.current = null;
    }, 1400);
    soundManager.play("uiClick", { volume: 0.14, rate: 1.0 });
    const id = yourAvatarId;
    if (!architectRelease) {
      soundManager.play(
        id === "flash"
          ? "ultActivateFlash"
          : id === "guardian"
            ? "ultActivateGuardian"
            : id === "inferno"
              ? "ultActivateInferno"
              : id === "architect"
                ? "ultActivateArchitect"
                : id === "titan"
                  ? "ultActivateTitan"
                  : "ultActivateShadow",
        { volume: 0.28, rate: 1.0, allowOverlap: true }
      );
    } else {
      soundManager.play("sequenceBurst", { volume: 0.22, rate: 1.0, allowOverlap: true });
    }
    if (id === "titan") {
      triggerScreenShake(0.42);
    }
    socket.emit("activateUltimate");
  };

  const EMOTE_COOLDOWN_MS = 1500;
  const EMOTE_BURST_WINDOW_MS = 5000;
  const EMOTE_BURST_LIMIT = 3;

  const handleSendEmote = (emoteId: string) => {
    const canSend = status === "playing" || status === "countdown" || status === "finished";
    if (!socket || !canSend || emoteCooldownUntil > Date.now()) {
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
    // Keep the emote picker open so players can immediately see they pressed
    // an emote (and optionally press another after cooldown).
    socket.emit("sendEmote", { emoteId, clientMessageId });
  };

  // Filter the emote bar to only show emotes in the player's equipped pack
  const availableEmotes = useMemo(() => {
    const pack = getEmotePack(yourEmotePack);
    const packIds = new Set(pack.emoteIds);
    return EMOTES.filter((emote) => packIds.has(emote.id));
  }, [yourEmotePack]);

  const isFinished = status === "finished";
  const isCountdown = status === "countdown";
  const isRoomLobby = status === "room-lobby";
  const isOpponentLeft = status === "opponent-left";
  const isWaitingState = status === "connecting" || status === "waiting";
  const isActiveGameplay = status === "playing";
  const isInMatchShell = isActiveGameplay || isCountdown;
  const compactGameplay = isInMatchShell && viewportState.compact;
  const crampedGameplay = isInMatchShell && viewportState.cramped;
  const keyboardOpenDuringGameplay = isActiveGameplay && viewportState.keyboardOpen;
  const constrainedGameplay = crampedGameplay || keyboardOpenDuringGameplay;
  const reduceBattleMotion = viewportState.reducedMotion || (isInMatchShell && (compactGameplay || crampedGameplay));
  const emotesEnabled = status === "playing" || status === "countdown" || status === "finished";
  const youEliminated = eliminated.you;
  const opponentEliminated = eliminated.opponent;

  // Derived HP values — client-side health bar visualization
  const youHP = Math.max(0, MAX_HP - youDamageTaken);
  const opponentHP = Math.max(0, MAX_HP - opponentDamageTaken);
  const toDisplayHp = (value: number) => Math.max(0, Math.min(DISPLAY_MAX_HP, (value / MAX_HP) * DISPLAY_MAX_HP));
  const youDisplayHP = toDisplayHp(youHP);
  const opponentDisplayHP = toDisplayHp(opponentHP);
  const youLowHp = isActiveGameplay && youDisplayHP > 0 && youDisplayHP <= LOW_HP_THRESHOLD;
  const opponentLowHp = isActiveGameplay && opponentDisplayHP > 0 && opponentDisplayHP <= LOW_HP_THRESHOLD;
  const bothClutchHp =
    isActiveGameplay && youDisplayHP > 0 && opponentDisplayHP > 0 && youDisplayHP <= CLUTCH_HP && opponentDisplayHP <= CLUTCH_HP;
  const latestYouRawDamage = latestYouDamage;
  const latestOpponentRawDamage = latestOpponentDamage;
  const showHP = isInMatchShell || isFinished;
  const emoteCoolingDown = emoteCooldownUntil > Date.now();
  const isJamActive = ultimate.blackoutUntil > Date.now();
  const isNeuralJamSilenced = isNeuralBurstLocked || ultimate.jammed;
  const titanRecoveryLocked = ultimate.titanRecoveryUntil > Date.now();
  const inputsLocked = isJamActive || isNeuralJamSilenced || titanRecoveryLocked;
  /** Timeout UI: only burst + blackout — full Shadow window still allows "stay" so the strip cannot deadlock. */
  const timeoutNeuralBurstLocked = isJamActive || isNeuralBurstLocked;
  const canSkipQuestion =
    timeoutDecisionPrompt.open && !timeoutNeuralBurstLocked && !youEliminated && !feedback.youAnsweredCurrent;
  const skipQuestionButton = timeoutDecisionPrompt.open ? (
    <Button
      type="button"
      variant="secondary"
      className="h-10 w-fit self-end rounded-xl border-amber-300/35 bg-amber-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-amber-100 hover:border-amber-200/60 hover:bg-amber-400/15"
      disabled={!canSkipQuestion}
      aria-label="Skip question and lose HP"
      onClick={handleSkipQuestionTimeout}
    >
      Skip question
      {isNeuralBurstLocked && !isJamActive ? (
        <span className="pointer-events-none absolute inset-0 rounded-xl bg-violet-950/55 bg-[repeating-linear-gradient(0deg,transparent_0px,transparent_2px,rgba(167,139,250,0.07)_2px,rgba(167,139,250,0.07)_4px)]" />
      ) : null}
    </Button>
  ) : null;

  useEffect(() => {
    if (!isActiveGameplay) return;
    const flags = lowHpCalloutRefs.current;
    if (bothClutchHp && !flags.clutch) {
      flags.clutch = true;
      pushMomentCallout("CLUTCH?", "violet", "center");
      return;
    }
    if (youDisplayHP > 0 && youDisplayHP <= LAST_STAND_HP && !flags.youLastStand) {
      flags.youLastStand = true;
      pushMomentCallout("LAST STAND", "rose", "you");
    }
    if (opponentDisplayHP > 0 && opponentDisplayHP <= LAST_STAND_HP && !flags.opponentLastStand) {
      flags.opponentLastStand = true;
      pushMomentCallout("LAST STAND", "amber", "opponent");
    }
    if (opponentDisplayHP > 0 && opponentDisplayHP <= FINISH_THEM_HP && !flags.finishThem) {
      flags.finishThem = true;
      pushMomentCallout("FINISH THEM", "amber", "opponent");
    }
  }, [isActiveGameplay, youDisplayHP, opponentDisplayHP, bothClutchHp]);
  const isSystemCorruptActive =
    ultimate.shadowCorruptUntil > Date.now() || ultimate.opponentShadowCorruptUntil > Date.now();
  const isTitanOverpowerActive = ultimate.titanOverpowerUntil > Date.now();
  const isRapidFireActive = ultimate.overclockUntil > Date.now();
  const isInfernoActive = ultimate.infernoPendingUntil > Date.now();
  const isOpponentRapidFireActive = ultimate.opponentOverclockUntil > Date.now();
  const isGuardianShieldActive = ultimate.fortressUntil > Date.now();
  const isOpponentGuardianShieldActive =
    ultimate.opponentFortressUntil > Date.now();
  const isArchitectActive = ultimate.architectUntil > Date.now();
  const canUseUltimate =
    isActiveGameplay &&
    ultimate.implemented &&
    !youEliminated &&
    !ultimateActivating &&
    (
      (ultimate.ready && !ultimate.used) ||
      (ultimate.type === "perfect_sequence" && ultimate.architectUntil > Date.now())
    );
  const architectCanRelease =
    ultimate.type === "perfect_sequence" &&
    ultimate.architectUntil > Date.now();

  // Close mobile workpad sheet when inputs lock or game ends
  useEffect(() => {
    if (inputsLocked || !isActiveGameplay) setWorkpadSheetOpen(false);
  }, [inputsLocked, isActiveGameplay]);

  // Keep the answer input always ready in live matches.
  useEffect(() => {
    if (status !== "playing") return;
    if (eliminated.you) return;
    if (feedback.youAnsweredCurrent) return;
    if (isNeuralBurstLocked || isOpponentNeuralJamVictim || titanRecoveryLocked) return;
    const t = setTimeout(() => focusAnswerInput(), 40);
    return () => clearTimeout(t);
  }, [
    status,
    eliminated.you,
    feedback.youAnsweredCurrent,
    focusPulseKey,
    neuralInputUnlockAt,
    isNeuralBurstLocked,
    isOpponentNeuralJamVictim,
    titanRecoveryLocked
  ]);

  useEffect(() => {
    if (!neuralInputUnlockAt) return;
    const ms = neuralInputUnlockAt - Date.now();
    if (ms <= 0) {
      setNeuralInputUnlockAt(0);
      return;
    }
    const id = window.setTimeout(() => setNeuralInputUnlockAt(0), ms + 30);
    return () => clearTimeout(id);
  }, [neuralInputUnlockAt]);

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
  const isCloseScore = Math.abs(scores.you - scores.opponent) <= CLOSE_SCORE_DELTA;
  const isFinalSeconds = isActiveGameplay && timer.secondsLeft <= CLUTCH_SECONDS;
  const showFinalPhase = isActiveGameplay && isFinalPhase;
  const now = Date.now();
  const finalResult =
    gameResult?.result ??
    (scores.you === scores.opponent ? "draw" : scores.you > scores.opponent ? "win" : "loss");

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
      ? { text: "⚫ Blackout — Submits Blocked", color: "text-violet-200",  large: false }
      : isNeuralJamSilenced
      ? { text: "🟣 Neural Jam — Inputs Locked", color: "text-violet-200", large: false }
      : titanRecoveryLocked
      ? { text: "🗿 Recovering...", color: "text-amber-200", large: false }
      : isSystemCorruptActive
      ? {
          text: "🟣 Opponent Corrupted",
          color: "text-violet-200",
          large: false
        }
      : isTitanOverpowerActive
      ? {
          text: "🗿 Colossus Mode Active",
          color: "text-orange-200",
          large: false
        }
      : isArchitectActive
      ? {
          text: ultimate.architectReady ? "⚙ Perfect System Ready" : "⚙ Perfect System Active",
          color: "text-cyan-200",
          large: false
        }
      : isRapidFireActive
      ? {
          text: "⚡ Overclock Active",
          color: "text-amber-200",
          large: false
        }
      : isInfernoActive
      ? { text: "🔥 Burn Applied", color: "text-rose-300", large: false }
      : isGuardianShieldActive
      ? { text: "🛡️ Shield Active", color: "text-teal-200", large: false }
      : youEliminated
      ? { text: "Eliminated ✕",                    color: "text-rose-300",    large: false }
      : feedback.youAnsweredCurrent
      ? { text: "Waiting...",                       color: "text-slate-400",   large: false }
      : showFinalPhase
      ? { text: isFinalSeconds ? "⚠ Final Seconds" : "⚠ Final 10 Seconds",   color: "text-rose-200", large: false }
      : null
    : null;

  const secondaryStatus = (() => {
    if (!isActiveGameplay) return null;
    const parts = [
      isOpponentRapidFireActive &&
        `⚡ Opp. Overclock${ultimate.opponentFlashOverclockStacks > 0 ? ` x${ultimate.opponentFlashOverclockStacks}` : ""}`,
      isOpponentGuardianShieldActive &&
        `🛡️ Opp. Reflect Bastion (${ultimate.opponentFortressBlocksRemaining} stored)`,
      !youEliminated && opponentEliminated && "Opponent Eliminated",
    ].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join("  ·  ") : null;
  })();

  const getStreakLabel = (streak: number) => {
    const tier = getStreakTier(streak);
    if (!tier) return null;
    return tier.label === "COMBO" ? `x${streak} COMBO` : tier.label;
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
    <div className="q-card-subtle rounded-xl p-2">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400/70">
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
                  ? "border-indigo-300/20 bg-slate-900/70 text-textSecondary"
                  : "border-slate-500/20 bg-slate-950/48 text-slate-400/70"
              } ${clickable ? "active:scale-[0.975]" : "cursor-default opacity-70 saturate-50"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60`}
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
      const total = vfx.durationMs ?? 8000;
      const progress = active ? Math.max(0, Math.min(1, (until - now) / total)) : 0;
      const combo = side === "you" ? ultimate.flashBonusRemaining : ultimate.opponentFlashBonusRemaining;
      return {
        label: active ? "⚡ Overclock Active" : "Overclock",
        sublabel: active
          ? combo > 0
            ? `Combo x${combo} · +${combo} bonus damage`
            : "Combo chain armed"
          : "Stand by",
        progress: active ? progress : null,
        accent: "bg-amber-300"
      };
    }

    if (normalizedType === "system_corrupt") {
      const until = side === "you" ? ultimate.opponentShadowCorruptUntil : ultimate.shadowCorruptUntil;
      const active = until > now;
      const total = vfx.durationMs ?? 5000;
      const seconds = active ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
      const progress = active ? Math.max(0, Math.min(1, (until - now) / total)) : 0;
      return {
        label: active ? "🟣 Neural Jam Active" : "Neural Jam",
        sublabel: active ? `${seconds}s remaining` : "Stand by",
        progress: active ? progress : null,
        accent: "bg-violet-400"
      };
    }

    if (normalizedType === "perfect_sequence") {
      const until = side === "you" ? ultimate.architectUntil : ultimate.opponentArchitectUntil;
      const nodes = side === "you" ? ultimate.architectNodes : ultimate.opponentArchitectNodes;
      const ready = side === "you" ? ultimate.architectReady : ultimate.opponentArchitectReady;
      const active = until > now;
      const total = vfx.durationMs ?? 10000;
      const progress = active ? Math.max(0, Math.min(1, (until - now) / total)) : 0;
      return {
        label: active ? "⚙ Perfect System Active" : "Perfect System",
        sublabel: active
          ? `${Math.max(0, nodes)}/5 nodes${ready ? " · SYSTEM READY" : ""}`
          : "Stand by",
        progress: active ? progress : null,
        accent: "bg-cyan-300"
      };
    }

    if (normalizedType === "overpower") {
      const until = side === "you" ? ultimate.titanOverpowerUntil : ultimate.opponentTitanOverpowerUntil;
      const recovering = side === "you" ? ultimate.titanRecovering : ultimate.opponentTitanRecovering;
      const reduction = side === "you" ? ultimate.titanDamageReduction : ultimate.opponentTitanDamageReduction;
      const active = until > now;
      const total = vfx.durationMs ?? 10000;
      const progress = active ? Math.max(0, Math.min(1, (until - now) / total)) : 0;
      return {
        label: active ? "🗿 Colossus Mode Active" : "Colossus Mode",
        sublabel: active
          ? `${recovering ? "Recovering · " : ""}Resist ${Math.round(Math.max(0, reduction) * 100)}% · Lifesteal`
          : "Stand by",
        progress: active ? progress : null,
        accent: "bg-orange-300"
      };
    }

    if (normalizedType === "shield") {
      const until = side === "you" ? ultimate.fortressUntil : ultimate.opponentFortressUntil;
      const stored = side === "you" ? ultimate.fortressBlocksRemaining : ultimate.opponentFortressBlocksRemaining;
      const active = until > now;
      const total = vfx.durationMs ?? 10000;
      const progress = active ? Math.max(0, Math.min(1, (until - now) / total)) : 0;
      return {
        label: active ? "🛡️ Shield Active" : "Aegis Domain",
        sublabel: active ? `Damage reduced · Stored ${stored}` : "Stand by",
        progress: active ? progress : null,
        accent: "bg-cyan-400"
      };
    }

    const until = side === "you" ? ultimate.infernoPendingUntil : ultimate.opponentInfernoPendingUntil;
    const stacks = side === "you" ? ultimate.novaBonusRemaining : ultimate.opponentNovaBonusRemaining;
    const active = until > now;
    const total = vfx.durationMs ?? 6000;
    const progress = active ? Math.max(0, Math.min(1, (until - now) / total)) : 0;
    return {
      label: active ? "🔥 Burn Applied" : "Blaze Surge",
      sublabel: active ? `Burn stacks x${Math.max(0, stacks)}` : "Stand by",
      progress: active ? progress : null,
      accent: "bg-rose-400"
    };
  };

  const localUltimateStatus = getUltimateStatus(ultimate.type, "you");
  const opponentUltimateStatus = getUltimateStatus(ultimate.opponentType, "opponent");
  const youUltimateActivationKey = ultimateCue?.by === "you" ? ultimateCue.id : 0;

  // Dedicated in-match layout (competitive HUD + sticky action bar).
  if (isInMatchShell) {
    return (
      <section className="q-match-lock fixed inset-0 z-10 overflow-hidden text-white">
        {/* Overlays */}
        <GameOverOverlay result={null} />
        <BattlefieldEffects
          reduced={reduceBattleMotion}
          compact={compactGameplay || crampedGameplay || viewportState.mobileLayout}
          dimmed={workpadOpen || workpadSheetOpen || viewportState.tabletLandscape}
          particleCount={
            viewportState.mobileLayout ? 6
            : compactGameplay || crampedGameplay ? 9
            : viewportState.tabletLandscape ? 12
            : 18
          }
          animationSpeed={showFinalPhase ? 1.25 : 0.85}
          rippleIntensity={showFinalPhase || ultimateCue ? 1.18 : 0.82}
          hitPulseKey={youHitKey + opponentHitKey}
          questionPulseKey={questionFlash?.key ?? questionMotionKey}
          ultimatePulseKey={ultimateCue?.id ?? 0}
        />
        <UltimateActivationOverlay cue={ultimateCue} />
        <UltimateCombatFxLayer
          ultimate={ultimateFxSnapshot}
          combatFx={combatFx}
          neuralInputUnlockAt={neuralInputUnlockAt}
          reduced={reduceBattleMotion}
        />
        {isSystemCorruptActive && !reduceBattleMotion ? (
          <motion.div
            key={`corrupt-ui-${Math.max(ultimate.shadowCorruptUntil, ultimate.opponentShadowCorruptUntil)}`}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[2rem]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.03, 0.09, 0.05, 0.08, 0.03], x: [0, 0.6, -0.6, 0.6, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
            style={{
              background:
                "repeating-linear-gradient(180deg, rgba(2,6,23,0.05) 0px, rgba(2,6,23,0.05) 7px, rgba(167,139,250,0.06) 7px, rgba(167,139,250,0.06) 9px)",
              mixBlendMode: "screen"
            }}
          />
        ) : null}
        {/* Emote bubbles (HUD layout doesn't render PlayerPanels) */}
        <div
          className={cn(
            "pointer-events-none absolute left-0 right-0 top-16 z-30 flex items-start justify-between gap-3 px-3 sm:px-5",
            crampedGameplay && "hidden"
          )}
        >
          <div className="relative h-14 w-[46%] max-w-sm">
            <EmoteDisplay items={youEmoteItems} />
          </div>
          <div className="relative h-14 w-[46%] max-w-sm">
            <EmoteDisplay items={opponentEmoteItems} />
          </div>
        </div>
        <AnimatePresence>
          {socketRecovery.active ? (
            <motion.div
              key="socket-recovery"
              className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-50 -translate-x-1/2 rounded-full border border-amber-300/35 bg-slate-950/94 px-4 py-2 text-center text-[11px] font-black uppercase tracking-[0.18em] text-amber-100 shadow-[0_14px_34px_rgba(2,6,23,0.55)]"
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {socketRecovery.message || "Reconnecting..."}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {ultimateToast ? (
            <motion.div
              key={`ultimate-toast-${ultimateToast.id}`}
              className={cn(
                "pointer-events-none absolute left-1/2 z-40 -translate-x-1/2",
                crampedGameplay ? "top-20" : "top-24"
              )}
              initial={{ opacity: 0, y: -8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <span
                className={`inline-flex rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] shadow-[0_12px_30px_rgba(2,6,23,0.45)] ${
                  ultimateToast.by === "you"
                    ? "border-cyan-300/35 bg-slate-950/92 text-cyan-100"
                    : "border-rose-300/35 bg-slate-950/92 text-rose-100"
                }`}
              >
                {ultimateToast.text}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence>
          {momentCallout ? (
            <motion.div
              key={`moment-${momentCallout.key}`}
              className={cn(
                "pointer-events-none absolute z-40 rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] shadow-[0_14px_36px_rgba(2,6,23,0.48)]",
                momentCallout.side === "you"
                  ? "left-[12%] top-[34%]"
                  : momentCallout.side === "opponent"
                    ? "right-[12%] top-[34%]"
                    : "left-1/2 top-[31%] -translate-x-1/2",
                momentCallout.tone === "rose" && "border-rose-300/45 bg-rose-950/88 text-rose-100",
                momentCallout.tone === "amber" && "border-amber-300/45 bg-amber-950/88 text-amber-100",
                momentCallout.tone === "violet" && "border-violet-300/45 bg-violet-950/88 text-violet-100",
                momentCallout.tone === "cyan" && "border-cyan-300/45 bg-cyan-950/88 text-cyan-100"
              )}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={reduceBattleMotion ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: [10, 0, -4, -12], scale: [0.9, 1.04, 1, 0.96] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.05, ease: "easeOut" }}
            >
              {momentCallout.text}
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: `linear-gradient(90deg, ${youLowHp ? "rgba(127,29,29,0.22)" : "transparent"} 0%, transparent 24%, transparent 76%, ${opponentLowHp ? "rgba(127,29,29,0.22)" : "transparent"} 100%)`,
          }}
        />

        <div
          className={cn(
            "relative z-10 flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden overscroll-y-contain"
          )}
        >
          {/* Top HUD */}
          <div
            className={cn(
              "shrink-0 px-3 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] sm:px-5 sm:pb-2.5 sm:pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]",
              compactGameplay && "pb-1.5 pt-2 sm:pb-2",
              keyboardOpenDuringGameplay && "hidden"
            )}
          >
            <div className={cn("q-card relative rounded-[1.55rem] p-2 sm:p-3", crampedGameplay && "sm:p-2.5")}>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[1.55rem] opacity-70"
                style={{
                  background:
                    "radial-gradient(ellipse at 28% 35%, rgba(56,189,248,0.12) 0%, transparent 56%), radial-gradient(ellipse at 72% 35%, rgba(251,113,133,0.12) 0%, transparent 56%)",
                }}
              />

              <div
                className={cn(
                  "relative grid items-stretch gap-2 md:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)] md:gap-3",
                  crampedGameplay && "gap-1.5 md:grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)]"
                )}
              >
                <MatchChampionCard
                  variant="battle"
                  hp={youDisplayHP}
                  maxHp={DISPLAY_MAX_HP}
                  model={{
                    side: "you",
                    playerName: yourName,
                    avatarId: yourAvatarId,
                    ultimateType: normalizeUltimateType(ultimate.type),
                    ultimateName: ultimate.name,
                    charge: ultimate.charge,
                    ready: ultimate.ready,
                    used: ultimate.used,
                    implemented: ultimate.implemented,
                    overclockUntil: ultimate.overclockUntil,
                    blackoutUntil: ultimate.blackoutUntil,
                    titanOverpowerUntil: ultimate.titanOverpowerUntil,
                    architectUntil: ultimate.architectUntil,
                    architectMarks: ultimate.architectMarks,
                    architectSequenceStreak: ultimate.architectSequenceStreak,
                    architectReady: ultimate.architectReady,
                    titanRecoveryUntil: ultimate.titanRecoveryUntil,
                    titanDamageReduction: ultimate.titanDamageReduction,
                    fortressUntil: ultimate.fortressUntil,
                    fortressBlocksRemaining: ultimate.fortressBlocksRemaining,
                    fortressStoredDamage: ultimate.fortressStoredDamage,
                    infernoPending: ultimate.infernoPending,
                    infernoPendingUntil: ultimate.infernoPendingUntil,
                    infernoStacks: ultimate.novaBonusRemaining,
                    flashOverclockStacks: ultimate.flashOverclockStacks,
                    ultimateQuestionsLeft: ultimate.ultimateQuestionsLeft,
                    jammed: ultimate.jammed || neuralInputUnlockAt > Date.now(),
                    burning:
                      ultimate.opponentInfernoPendingUntil > Date.now() &&
                      ultimate.opponentNovaBonusRemaining > 0,
                    streakCount: feedback.youStreak,
                    lowHp: youLowHp,
                    attackPulseKey: opponentHitKey,
                    attackEffect: yourHitEffect,
                    combatEvents: youCombatEvents,
                    damageFloat:
                      typeof latestYouRawDamage === "number" &&
                      latestYouRawDamage > 0 &&
                      youHitKey > 0
                        ? {
                            hitKey: youHitKey,
                            amount: latestYouRawDamage,
                            flashTier: youDamageFlashTier,
                            speedTier: latestYouSpeedTier,
                            hitEffect: opponentHitEffect,
                          }
                        : null,
                  }}
                />

                <div className={cn("flex min-h-[3.1rem] items-center justify-center md:min-h-full", crampedGameplay && "min-h-[2.8rem]")}>
                  <div className="flex w-full flex-col items-center gap-2">
                    <SoundToggle muted={muted} onToggle={handleToggleSound} />
                    <div className={cn("q-card-subtle w-full rounded-2xl px-2.5 py-1.5 text-center sm:px-3 sm:py-2", crampedGameplay && "sm:px-2.5 sm:py-1.5")}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-textSecondary/70">Duel</p>
                      <div className="mt-1 flex items-baseline justify-center gap-2">
                        <span className={cn("text-xl font-black tabular-nums text-sky-200 sm:text-3xl", crampedGameplay && "sm:text-2xl")}>{scores.you}</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.34em] text-textSecondary/60 sm:text-xs">VS</span>
                        <span className={cn("text-xl font-black tabular-nums text-rose-200 sm:text-3xl", crampedGameplay && "sm:text-2xl")}>{scores.opponent}</span>
                      </div>
                      <div className="mt-1 inline-flex rounded-full border border-sky-300/18 bg-sky-500/10 px-3 py-1 text-[10px] font-black tracking-[0.24em] text-sky-200 sm:mt-1.5 sm:text-xs">
                        {timerLabel}
                      </div>
                    </div>
                  </div>
                </div>

                <MatchChampionCard
                  variant="battle"
                  hp={opponentDisplayHP}
                  maxHp={DISPLAY_MAX_HP}
                  model={{
                    side: "opponent",
                    playerName: opponentName,
                    avatarId: opponentAvatarId,
                    ultimateType: normalizeUltimateType(ultimate.opponentType),
                    ultimateName: ultimate.opponentName,
                    charge: ultimate.opponentCharge,
                    ready: ultimate.opponentReady,
                    used: ultimate.opponentUsed,
                    implemented: ultimate.opponentImplemented,
                    overclockUntil: ultimate.opponentOverclockUntil,
                    blackoutUntil: ultimate.opponentBlackoutUntil,
                    titanOverpowerUntil: ultimate.opponentTitanOverpowerUntil,
                    architectUntil: ultimate.opponentArchitectUntil,
                    architectMarks: ultimate.opponentArchitectMarks,
                    architectSequenceStreak: ultimate.opponentArchitectSequenceStreak,
                    architectReady: ultimate.opponentArchitectReady,
                    titanRecoveryUntil: ultimate.opponentTitanRecoveryUntil,
                    titanDamageReduction: ultimate.opponentTitanDamageReduction,
                    fortressUntil: ultimate.opponentFortressUntil,
                    fortressBlocksRemaining: ultimate.opponentFortressBlocksRemaining,
                    fortressStoredDamage: ultimate.opponentFortressStoredDamage,
                    infernoPending: ultimate.opponentInfernoPending,
                    infernoPendingUntil: ultimate.opponentInfernoPendingUntil,
                    infernoStacks: ultimate.opponentNovaBonusRemaining,
                    flashOverclockStacks: ultimate.opponentFlashOverclockStacks,
                    ultimateQuestionsLeft: ultimate.opponentUltimateQuestionsLeft,
                    jammed: ultimate.opponentJammed,
                    burning:
                      ultimate.infernoPendingUntil > Date.now() &&
                      ultimate.novaBonusRemaining > 0,
                    streakCount: feedback.opponentStreak,
                    lowHp: opponentLowHp,
                    attackPulseKey: youHitKey,
                    attackEffect: opponentHitEffect,
                    combatEvents: opponentCombatEvents,
                    damageFloat:
                      typeof latestOpponentRawDamage === "number" &&
                      latestOpponentRawDamage > 0 &&
                      opponentHitKey > 0
                        ? {
                            hitKey: opponentHitKey,
                            amount: latestOpponentRawDamage,
                            flashTier: opponentDamageFlashTier,
                            speedTier: latestOpponentSpeedTier,
                            hitEffect: yourHitEffect,
                          }
                        : null,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Main gameplay area — question + answers in left col, workpad in right col */}
          <div className="flex min-h-0 flex-1 overflow-hidden">

            {/* Left / sole col: question card then answer form, scrollable */}
            <div
              className={cn(
                "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-6 sm:px-5 sm:pt-8",
                compactGameplay && "pt-3 sm:pt-4",
                constrainedGameplay && "pt-2 sm:pt-2",
                keyboardOpenDuringGameplay && "pb-2 pt-1"
              )}
            >
              {/* Question card — always at the top of the column */}
              <motion.div
                animate={reduceBattleMotion ? undefined : animState.questionShakeControls}
                className="mx-auto w-full max-w-2xl"
              >
                <motion.div
                  key={`question-card-${questionMotionKey}`}
                  className={cn(
                    "q-card-strong relative overflow-hidden rounded-[1.5rem] p-4 text-center sm:p-6",
                    compactGameplay && "p-3 sm:p-4",
                    constrainedGameplay && "p-2.5 sm:p-3",
                    questionFlash?.kind === "correct" && "ring-2 ring-emerald-300/55",
                    questionFlash?.kind === "wrong" && "ring-2 ring-rose-300/55"
                  )}
                  initial={reduceBattleMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
                  animate={
                    reduceBattleMotion
                      ? undefined
                      : {
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          boxShadow:
                            questionFlash?.kind === "correct"
                              ? "0 0 34px rgba(52,211,153,0.22), 0 18px 52px rgba(2,6,23,0.5)"
                              : questionFlash?.kind === "wrong"
                                ? "0 0 34px rgba(251,113,133,0.22), 0 18px 52px rgba(2,6,23,0.5)"
                                : showFinalPhase
                                  ? "0 0 30px rgba(251,113,133,0.16), 0 18px 52px rgba(2,6,23,0.5)"
                                  : "0 18px 52px rgba(2,6,23,0.5)",
                        }
                  }
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <motion.div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    animate={{
                      opacity: showFinalPhase ? [0.08, isFinalSeconds ? 0.22 : 0.16, 0.08] : 0.04,
                    }}
                    transition={{ duration: isFinalSeconds ? 0.55 : 1.2, repeat: showFinalPhase ? Number.POSITIVE_INFINITY : 0, ease: "easeInOut" }}
                    style={{
                      background:
                        questionFlash?.kind === "correct"
                          ? "radial-gradient(ellipse at center, rgba(52,211,153,0.24) 0%, transparent 66%)"
                          : questionFlash?.kind === "wrong"
                            ? "radial-gradient(ellipse at center, rgba(251,113,133,0.24) 0%, transparent 66%)"
                            : "radial-gradient(ellipse at center, rgba(56,189,248,0.10) 0%, transparent 70%)",
                    }}
                  />
                  <AnimatePresence>
                    {answerFeedback ? (
                      <motion.div
                        key={answerFeedback.key}
                        className={cn(
                          "pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] shadow-[0_12px_30px_rgba(2,6,23,0.45)] sm:text-xs",
                          answerFeedback.kind === "correct"
                            ? "border-emerald-300/45 bg-emerald-950/88 text-emerald-100"
                            : "border-rose-300/45 bg-rose-950/88 text-rose-100"
                        )}
                        initial={{ opacity: 0, y: 8, scale: 0.9 }}
                        animate={{ opacity: [0, 1, 1, 0], y: [8, 0, -8, -16], scale: [0.9, 1.02, 1, 0.96] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.78, ease: "easeOut" }}
                      >
                        {answerFeedback.text}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                  <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-textSecondary/70">
                    {isCountdown ? "Countdown" : "Question"}
                  </p>
                  <div className="mt-3 flex items-center justify-center">
                    {isCountdown ? (
                      <CountdownDisplay value={countdownValue} />
                    ) : (
                      <QuestionContent
                        question={currentQuestionData}
                        fallbackPrompt={currentQuestion}
                        compact
                        fitViewport
                        promptClassName={
                          constrainedGameplay
                            ? "text-lg font-black tracking-tight text-white sm:text-xl md:text-2xl"
                            : compactGameplay
                              ? "text-lg font-black tracking-tight text-white sm:text-2xl md:text-3xl"
                              : "text-xl font-black tracking-tight text-white sm:text-3xl md:text-4xl"
                        }
                      />
                    )}
                  </div>
                  {(primaryStatus || secondaryStatus) ? (
                    <div className={cn("mt-3", constrainedGameplay && "mt-2")}>
                      {primaryStatus ? (
                        <p className={`text-xs font-black uppercase tracking-[0.22em] ${primaryStatus.color}`}>
                          {primaryStatus.text}
                        </p>
                      ) : null}
                      {secondaryStatus ? (
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {secondaryStatus}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <FrostBurst active={animState.frostBurstActive} />
                  <SnowfallOverlay active={animState.snowfallActive} reduced={reduceBattleMotion} />
                </motion.div>
              </motion.div>

              {/* Answer form — directly below question, same column */}
              {isActiveGameplay ? (
                <div
                  className={cn(
                    "mx-auto mt-4 w-full sm:mt-5",
                    compactGameplay && "mt-3 sm:mt-3",
                    constrainedGameplay && "mt-2 sm:mt-2",
                    viewportState.tabletLandscape ? "max-w-none" : "max-w-2xl"
                  )}
                >
                  <div className={cn("mb-1.5 flex items-center justify-start", constrainedGameplay && "hidden")}>
                    <EmoteBar
                      emotes={availableEmotes}
                      open={emoteBarOpen && emotesEnabled}
                      onToggle={() => setEmoteBarOpen((o) => !o)}
                      onSend={handleSendEmote}
                      coolingDown={emoteCoolingDown}
                      cooldownUntil={emoteCooldownUntil}
                      disabled={!emotesEnabled}
                    />
                  </div>
                  <form className={cn("flex w-full flex-col gap-2", crampedGameplay && "gap-1.5")} onSubmit={handleSubmit}>
                    {isNeuralJamSilenced ? (
                      <div className="flex items-center">
                        <span className="rounded-full border border-violet-300/35 bg-violet-500/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-violet-100">
                          JAMMED
                        </span>
                      </div>
                    ) : null}

                    {/* Inline workpad — non-mobile, non-tablet-landscape only */}
                    {!viewportState.mobileLayout && !viewportState.tabletLandscape ? (
                      <WorkingScratchpad
                        displayMode="inline-collapsible"
                        answerInputLocked={inputsLocked}
                        onOpenChange={setWorkpadOpen}
                      />
                    ) : null}

                    {Array.isArray(currentQuestionData?.options) && currentQuestionData.options.length > 0 ? (
                      <div className={cn(
                        "grid gap-2",
                        viewportState.tabletLandscape ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2",
                        compactGameplay && "grid-cols-2 gap-1.5"
                      )}>
                        {currentQuestionData.options.map((option, idx) => {
                          const isFeedbackOption = answerFeedback?.option === option;
                          return (
                            <Button
                              key={`${option}-${idx}`}
                              type="button"
                              variant="secondary"
                              className={cn(
                                "relative min-h-[48px] w-full justify-start overflow-hidden py-3 text-left text-sm shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_12px_28px_rgba(2,6,23,0.38)] hover:border-cyan-300/45 hover:shadow-[0_0_24px_rgba(34,211,238,0.14),0_14px_30px_rgba(2,6,23,0.44)] sm:min-h-[2.75rem] sm:py-2",
                                compactGameplay && "min-h-[42px] px-2.5 py-2 text-center text-xs sm:min-h-[2.6rem] sm:text-sm",
                                isFeedbackOption && answerFeedback.kind === "correct" && "border-emerald-300/70 bg-emerald-500/18 text-emerald-50 shadow-[0_0_24px_rgba(52,211,153,0.2)]",
                                isFeedbackOption && answerFeedback.kind === "wrong" && "border-rose-300/70 bg-rose-500/18 text-rose-50 shadow-[0_0_24px_rgba(251,113,133,0.2)]"
                              )}
                              disabled={inputsLocked || youEliminated || feedback.youAnsweredCurrent}
                              onClick={() => handleOptionSubmit(option)}
                            >
                              {option}
                              {isFeedbackOption ? (
                                <motion.span
                                  className="pointer-events-none absolute inset-0"
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: [0, 0.42, 0] }}
                                  transition={{ duration: 0.42, ease: "easeOut" }}
                                  style={{
                                    background: answerFeedback.kind === "correct"
                                      ? "linear-gradient(90deg, transparent 0%, rgba(52,211,153,0.55) 48%, transparent 100%)"
                                      : "linear-gradient(90deg, transparent 0%, rgba(251,113,133,0.55) 48%, transparent 100%)",
                                  }}
                                />
                              ) : null}
                              {isNeuralJamSilenced && !isJamActive ? (
                                <span className="pointer-events-none absolute inset-0 bg-violet-950/55 bg-[repeating-linear-gradient(0deg,transparent_0px,transparent_2px,rgba(167,139,250,0.07)_2px,rgba(167,139,250,0.07)_4px)]" />
                              ) : null}
                            </Button>
                          );
                        })}
                      </div>
                    ) : null}

                    {!(Array.isArray(currentQuestionData?.options) && currentQuestionData.options.length > 0) ? (
                      <div className={cn("flex items-stretch gap-2", compactGameplay && "flex-col")}>
                        <input
                          ref={answerInputRef}
                          type="text"
                          autoFocus
                          value={answer}
                          onChange={(event) => handleAnswerChange(event.target.value)}
                          placeholder={
                            isJamActive
                              ? "Signal jam active - prep your answer..."
                              : isNeuralJamSilenced
                                ? isOpponentNeuralJamVictim
                                  ? "Neural jam — opponent locked your inputs..."
                                  : "Neural jam — inputs unlock shortly..."
                                : youEliminated
                                  ? "Eliminated"
                                  : feedback.youAnsweredCurrent
                                    ? "Waiting..."
                                    : currentQuestionData?.inputMode === "text"
                                      ? "Type text or symbol answer..."
                                      : "Type answer..."
                          }
                          disabled={inputsLocked || youEliminated || feedback.youAnsweredCurrent}
                          autoCapitalize="off"
                          autoCorrect="off"
                          spellCheck={false}
                          enterKeyHint="go"
                          className={cn(
                            "neon-input min-h-[48px] min-w-0 flex-1 rounded-2xl px-4 py-3 text-base transition-[border-color,box-shadow,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-60 sm:h-12 sm:py-2",
                            compactGameplay && "min-h-[44px] py-2.5 sm:h-11 sm:py-2",
                            answerFeedback?.kind === "correct" && "border-emerald-300/65 shadow-[0_0_22px_rgba(52,211,153,0.18)]",
                            answerFeedback?.kind === "wrong" && "border-rose-300/65 shadow-[0_0_22px_rgba(251,113,133,0.18)]"
                          )}
                        />
                        <Button
                          className={cn(
                            "min-h-[48px] w-[7.5rem] shrink-0 sm:h-12",
                            compactGameplay && "min-h-[44px] w-full sm:h-11"
                          )}
                          type="submit"
                          disabled={!answer.trim() || inputsLocked || youEliminated || feedback.youAnsweredCurrent}
                        >
                          Submit
                        </Button>
                      </div>
                    ) : null}

                    <div className={cn(constrainedGameplay && "hidden")}>
                      {skipQuestionButton}
                    </div>

                    {/* Abilities row */}
                    <div
                      className={cn(
                        "grid gap-2",
                        POWERUPS_ENABLED ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2",
                        compactGameplay && "grid-cols-1"
                      )}
                    >
                      {POWERUPS_ENABLED ? (
                        <button
                          type="button"
                          onClick={() => { if (feedback.youPowerUpAvailable) handleUsePowerUp(feedback.youPowerUpAvailable); }}
                          disabled={!feedback.youPowerUpAvailable || feedback.youPowerUpUsed || youEliminated || feedback.youAnsweredCurrent}
                          className={`h-11 w-full rounded-2xl border px-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 ${
                            feedback.youPowerUpAvailable && !feedback.youPowerUpUsed
                              ? "border-sky-300/35 bg-sky-500/10 text-sky-100 hover:border-sky-300/55 active:scale-[0.99]"
                              : feedback.youPowerUpUsed
                                ? "border-white/[0.05] bg-slate-950/38 text-slate-500"
                                : "border-white/[0.05] bg-slate-950/30 text-slate-500"
                          }`}
                          aria-label="Power-up"
                        >
                          {feedback.youPowerUpAvailable ? (
                            (() => {
                              const meta = getPowerUpMeta(feedback.youPowerUpAvailable);
                              return (
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-[11px] font-black uppercase tracking-[0.18em]">
                                      {meta?.icon ?? "✨"} {meta?.name ?? "Power-Up"}
                                    </p>
                                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                      {feedback.youPowerUpUsed ? "Used" : "Ready"}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-300">Tap</span>
                                </div>
                              );
                            })()
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] font-black uppercase tracking-[0.18em]">✨ Power-Up</p>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">None</p>
                            </div>
                          )}
                        </button>
                      ) : null}

                      {/* Mobile workpad toggle button */}
                      {viewportState.mobileLayout && !constrainedGameplay ? (
                        <button
                          type="button"
                          disabled={inputsLocked}
                          onClick={() => setWorkpadSheetOpen(true)}
                          className="h-11 w-full rounded-2xl border border-indigo-300/28 bg-slate-900/55 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200 transition-all hover:border-cyan-300/45 disabled:cursor-not-allowed disabled:opacity-45"
                          aria-label="Open workpad"
                        >
                          ✏ Workpad
                        </button>
                      ) : null}

                      {/* Mobile: compact ultimate */}
                      <div className="sm:hidden">
                        <UltimateAbilityButton
                          type={ultimate.type}
                          ultimateName={ultimate.name}
                          charge={ultimate.charge}
                          ready={ultimate.ready}
                          used={ultimate.used}
                          implemented={ultimate.implemented}
                          activating={ultimateActivating}
                          disabled={!canUseUltimate}
                          onActivate={handleActivateUltimate}
                          activationBurstKey={youUltimateActivationKey}
                          activeWindow={architectCanRelease}
                          actionLabel={architectCanRelease ? "Use Perfect System now" : undefined}
                          statusOverride={architectCanRelease ? (ultimate.architectReady ? "AUTO AT 5" : "FIRE NOW") : undefined}
                          size="compact"
                          className="h-11"
                        />
                      </div>
                      {/* sm+: regular ultimate */}
                      <div className="hidden sm:block">
                        <UltimateAbilityButton
                          type={ultimate.type}
                          ultimateName={ultimate.name}
                          charge={ultimate.charge}
                          ready={ultimate.ready}
                          used={ultimate.used}
                          implemented={ultimate.implemented}
                          activating={ultimateActivating}
                          disabled={!canUseUltimate}
                          onActivate={handleActivateUltimate}
                          activationBurstKey={youUltimateActivationKey}
                          activeWindow={architectCanRelease}
                          actionLabel={architectCanRelease ? "Use Perfect System now" : undefined}
                          statusOverride={architectCanRelease ? (ultimate.architectReady ? "AUTO AT 5" : "FIRE NOW") : undefined}
                          size="regular"
                        />
                      </div>
                    </div>
                  </form>
                </div>
              ) : null}
            </div>

            {/* Right col: workpad — tablet landscape + active gameplay only */}
            {viewportState.tabletLandscape && isActiveGameplay ? (
              <div
                className="shrink-0 overflow-hidden border-l border-slate-700/25 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3"
                style={{ width: "clamp(300px, 35%, 360px)" }}
              >
                <WorkingScratchpad
                  displayMode="always-open"
                  answerInputLocked={inputsLocked}
                  onOpenChange={setWorkpadOpen}
                  className="h-full"
                />
              </div>
            ) : null}
          </div>

          {/* Mobile workpad bottom-sheet overlay (fixed, sits above everything) */}
          {isActiveGameplay ? (
            <AnimatePresence>
              {viewportState.mobileLayout && workpadSheetOpen && (
                <motion.div
                  key="workpad-sheet"
                  className="fixed inset-0 z-50 flex flex-col justify-end"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <div
                    className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
                    onClick={() => setWorkpadSheetOpen(false)}
                  />
                  <motion.div
                    className="relative z-10 flex flex-col rounded-t-3xl border-t border-indigo-300/20 bg-[rgba(3,8,24,0.97)] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3"
                    style={{ height: "55dvh", minHeight: "280px", maxHeight: "80dvh" }}
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Workpad</p>
                      <button
                        type="button"
                        onClick={() => setWorkpadSheetOpen(false)}
                        className="rounded-lg border border-indigo-300/30 bg-slate-900/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-200 hover:border-rose-300/50 hover:text-rose-200"
                      >
                        Close
                      </button>
                    </div>
                    <div className="min-h-0 flex-1">
                      <WorkingScratchpad
                        displayMode="standalone"
                        answerInputLocked={inputsLocked}
                        className="h-full"
                      />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="neon-panel-strong relative mx-auto w-full min-w-0 max-w-5xl rounded-2xl p-3 sm:rounded-[2rem] sm:p-5 md:p-7 lg:p-8">
      {/* Game-over overlays (win glow / lose vignette) */}
      <GameOverOverlay result={isFinished ? (gameResult?.result ?? null) : null} />
      <UltimateActivationOverlay cue={ultimateCue} />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] rounded-[2rem]"
        animate={{
          opacity: showFinalPhase ? (isFinalSeconds ? 0.42 : 0.28) : 0,
          scale: showFinalPhase ? [1, 1.01, 1] : 1
        }}
        transition={{
          opacity: { duration: 0.24, ease: "easeOut" },
          scale: {
            duration: isFinalSeconds ? 0.55 : 1.15,
            repeat: showFinalPhase ? Number.POSITIVE_INFINITY : 0,
            repeatType: "mirror",
            ease: "easeInOut"
          }
        }}
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(248,113,113,0.08) 0%, rgba(15,23,42,0.36) 64%, rgba(2,6,23,0.5) 100%)"
        }}
      />
      <AnimatePresence>
        {clutchMoment.key > 0 && clutchMoment.side ? (
          <motion.div
            key={`clutch-${clutchMoment.key}`}
            className="pointer-events-none absolute inset-0 z-[2] rounded-[2rem]"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: [0, 0.4, 0], scale: [0.98, 1.01, 1] }}
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
            className="pointer-events-none absolute left-1/2 top-6 z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold text-rose-300"
            initial={{ opacity: 0, y: -10, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.94 }}
            transition={{ duration: 0.22 }}
          >
            Streak Broken 💔
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end">
        <SoundToggle muted={muted} onToggle={handleToggleSound} />
      </div>

      <div className="relative z-10 flex flex-col gap-4 sm:gap-5 lg:gap-6">
        <div className="space-y-2.5 sm:space-y-3">
          <div className="flex min-h-[1.5rem] flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.2em] text-sky-300">
            <span>Topic: {topicLabel}</span>
            <span>Difficulty: {difficultyLabel}</span>
            <span className={showFinalPhase ? "text-rose-300" : undefined}>Time: {timerLabel}</span>
          </div>

          <h1 className="min-h-[2.5rem] text-2xl font-black tracking-tight text-white sm:min-h-[3rem] sm:text-3xl md:min-h-[3.5rem] md:text-4xl lg:text-5xl">
            {statusHeading[status]}
          </h1>

          <p className="min-h-[1.5rem] text-sm text-slate-300 sm:min-h-[1.75rem] sm:text-base md:text-lg">{statusCopy[status]}</p>
          <div className="mt-2 min-h-[2.75rem]">
            <EmoteBar
              emotes={availableEmotes}
              open={emoteBarOpen && emotesEnabled}
              onToggle={() => setEmoteBarOpen((o) => !o)}
              onSend={handleSendEmote}
              coolingDown={emoteCoolingDown}
              cooldownUntil={emoteCooldownUntil}
              disabled={!emotesEnabled}
            />
          </div>
        </div>

        {/* Player panels */}
        {isWaitingState ? (
          <motion.div
            className="neon-panel-soft relative grid gap-3 rounded-3xl p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] md:items-stretch md:gap-4 md:p-5 lg:p-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            {/* Subtle shimmer */}
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl"
              initial={{ opacity: 0.25 }}
              animate={{ opacity: [0.16, 0.28, 0.16] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{
                background:
                  "radial-gradient(ellipse at 30% 20%, rgba(56,189,248,0.18) 0%, transparent 55%), radial-gradient(ellipse at 70% 60%, rgba(167,139,250,0.10) 0%, transparent 60%)"
              }}
            />

            {/* You (ready) */}
            <div className="relative grid min-h-[22rem] grid-rows-[auto_2.5rem_minmax(8.5rem,auto)] gap-2 sm:min-h-[23rem] sm:gap-3">
              <PlayerPanel
                label={yourName}
                score={scores.you}
                rating={ratings.you}
                eliminated={youEliminated}
                streakLabel={null}
                streakLevel={null}
                streakEffect={yourStreakEffect}
                fastActive={false}
                highlighted
                pulseKey={feedback.youPulseKey}
                scoreGlowKey={animState.youScoreGlowKey}
                shieldBlockFlashKey={0}
                powerUpGlowKey={0}
                ultimateFxKey={0}
                ultimateFxType={null}
                hp={undefined}
                hitKey={0}
                latestDamage={null}
              />

              <div className="min-h-[2.5rem] flex items-center justify-center" aria-hidden="true">
                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.16)]">
                  READY
                </span>
              </div>

              <div className="q-card-subtle rounded-2xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-textSecondary/70">Matchmaking</p>
                <p className="mt-2 text-sm text-slate-200">Searching for an opponent…</p>
                <motion.p
                  className="mt-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400"
                  animate={{ opacity: [0.35, 1, 0.35] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  Finding match
                  <span className="inline-block w-6 text-left">
                    <motion.span
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      ...
                    </motion.span>
                  </span>
                </motion.p>
              </div>
            </div>

            {/* VS element (dimmed) */}
            <motion.div
              className="flex items-center justify-center self-center pb-0 text-xs font-semibold uppercase tracking-[0.35em] text-textSecondary sm:text-sm"
              initial={{ opacity: 0.35, scale: 0.92 }}
              animate={{ opacity: [0.35, 0.55, 0.35], scale: [0.92, 1, 0.92] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              vs
            </motion.div>

            {/* Opponent placeholder */}
            <motion.div
              className="relative grid min-h-[22rem] grid-rows-[auto_2.5rem_minmax(8.5rem,auto)] gap-2 sm:min-h-[23rem] sm:gap-3"
              initial={{ opacity: 0.7 }}
              animate={{ opacity: [0.55, 0.85, 0.55] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="q-card-subtle relative w-full min-h-[11.5rem] rounded-2xl p-3 text-center sm:min-h-[12.25rem] sm:p-4">
                <p className="truncate px-1 text-xs uppercase tracking-[0.2em] text-slate-400/70">
                  Searching for opponent…
                </p>
                <div className="mt-3 flex items-center justify-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-500/20 bg-slate-950/55 text-3xl text-slate-200">
                    ?
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-slate-500/70" />
                  <motion.div
                    className="h-2 w-2 rounded-full bg-slate-500/70"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
                  />
                  <motion.div
                    className="h-2 w-2 rounded-full bg-slate-500/70"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                  />
                </div>
              </div>

              <div className="min-h-[2.5rem]" aria-hidden="true" />
              <div className="q-card-subtle rounded-2xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-textSecondary/70">Opponent</p>
                <p className="mt-2 text-sm text-slate-300">Searching…</p>
              </div>
            </motion.div>
          </motion.div>
        ) : (
          <div
            className="neon-panel-soft grid gap-3 rounded-3xl p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] md:items-stretch md:gap-4 md:p-5 lg:p-6"
          >
            {/* You */}
            <div className="relative grid min-h-[22rem] grid-rows-[auto_2.5rem_minmax(8.5rem,auto)] gap-2 sm:min-h-[23rem] sm:gap-3">
              <PlayerPanel
                label={yourName}
                score={scores.you}
                rating={ratings.you}
                eliminated={youEliminated}
                avatar={yourAvatar}
                streakLabel={isActiveGameplay ? yourStreakLabel : null}
                streakLevel={isActiveGameplay ? yourStreakLevel : null}
                streakEffect={yourStreakEffect}
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
                hp={showHP ? youDisplayHP : undefined}
                maxHp={DISPLAY_MAX_HP}
                hitKey={youHitKey}
                latestDamage={latestYouRawDamage}
                hitType={youHitType}
                hitIntensity={youHitIntensity}
                damageFlashTier={youDamageFlashTier}
                hitEffect={opponentHitEffect}
                ultimateReady={ultimate.ready && !ultimate.used && ultimate.implemented}
                ultReadyCueKey={ultReadyCueKey.you}
                overclockUntil={ultimate.overclockUntil}
                blackoutUntil={ultimate.blackoutUntil}
                shadowCorruptUntil={ultimate.shadowCorruptUntil}
                shadowCorruptStacks={ultimate.shadowCorruptStacks}
                architectUntil={ultimate.architectUntil}
                architectMarks={ultimate.architectMarks}
                architectSequenceStreak={ultimate.architectSequenceStreak}
                opponentArchitectUntil={ultimate.opponentArchitectUntil}
                opponentArchitectMarks={ultimate.opponentArchitectMarks}
                opponentArchitectSequenceStreak={ultimate.opponentArchitectSequenceStreak}
                titanOverpowerUntil={ultimate.titanOverpowerUntil}
                titanStreak={ultimate.titanStreak}
                titanBreakArmed={ultimate.titanBreakArmed}
                opponentTitanOverpowerUntil={ultimate.opponentTitanOverpowerUntil}
                opponentTitanStreak={ultimate.opponentTitanStreak}
                opponentTitanBreakArmed={ultimate.opponentTitanBreakArmed}
                fortressUntil={ultimate.fortressUntil}
                fortressBlocksRemaining={ultimate.fortressBlocksRemaining}
                infernoPendingUntil={ultimate.infernoPendingUntil}
                infernoStacks={ultimate.novaBonusRemaining}
                ultimateQuestionsLeft={ultimate.ultimateQuestionsLeft}
                ultimateName={ultimate.name}
              />
              <AnimatePresence>
                {scoreImpactKey.you > 0 ? (
                  <motion.div
                    key={`score-you-${scoreImpactKey.you}`}
                    className="pointer-events-none absolute inset-0 z-10 rounded-3xl"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: [0, isCloseScore ? 0.48 : 0.34, 0], scale: [0.98, 1.01, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: isCloseScore ? 0.34 : 0.28, ease: "easeOut" }}
                    style={{
                      background:
                        "radial-gradient(ellipse at 25% 35%, rgba(56,189,248,0.46) 0%, rgba(56,189,248,0.12) 34%, transparent 68%)"
                    }}
                  />
                ) : null}
              </AnimatePresence>
              {/* Symmetry spacer - matches OpponentPresence min-height in opponent column */}
              <div className="min-h-[2.5rem]" aria-hidden="true" />
              <div className="space-y-2">
                <MatchChampionCard
                  model={{
                    side: "you",
                    playerName: yourName,
                    avatarId: yourAvatarId,
                    ultimateType: normalizeUltimateType(ultimate.type),
                    ultimateName: ultimate.name,
                    charge: ultimate.charge,
                    ready: ultimate.ready,
                    used: ultimate.used,
                    implemented: ultimate.implemented,
                    overclockUntil: ultimate.overclockUntil,
                    blackoutUntil: ultimate.blackoutUntil,
                    fortressUntil: ultimate.fortressUntil,
                    fortressBlocksRemaining: ultimate.fortressBlocksRemaining,
                    infernoPending: ultimate.infernoPending,
                    infernoPendingUntil: ultimate.infernoPendingUntil,
                    infernoStacks: ultimate.novaBonusRemaining,
                    flashOverclockStacks: ultimate.flashOverclockStacks,
                    ultimateQuestionsLeft: ultimate.ultimateQuestionsLeft,
                  }}
                />

                <UltimateAbilityButton
                  type={ultimate.type}
                  ultimateName={ultimate.name}
                  charge={ultimate.charge}
                  ready={ultimate.ready}
                  used={ultimate.used}
                  implemented={ultimate.implemented}
                  activating={ultimateActivating}
                  disabled={!canUseUltimate}
                  onActivate={handleActivateUltimate}
                  activationBurstKey={youUltimateActivationKey}
                  activeWindow={architectCanRelease}
                  actionLabel={architectCanRelease ? "Use Perfect System now" : undefined}
                  statusOverride={architectCanRelease ? (ultimate.architectReady ? "AUTO AT 5" : "FIRE NOW") : undefined}
                />
              </div>
              <FloatingLabel items={youFloatingItems} />
              <EmoteDisplay items={youEmoteItems} />
            </div>

            <motion.div
              className="flex items-center justify-center self-center pb-0 text-xs font-semibold uppercase tracking-[0.35em] text-textSecondary sm:text-sm"
              initial={{ opacity: 0.45, scale: 0.9 }}
              animate={{ opacity: [0.45, 1, 0.65], scale: [0.9, 1.18, 1] }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            >
              vs
            </motion.div>

            {/* Opponent */}
            <motion.div
              className="relative grid min-h-[22rem] grid-rows-[auto_2.5rem_minmax(8.5rem,auto)] gap-2 sm:min-h-[23rem] sm:gap-3"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <PlayerPanel
                label={opponentName}
                score={scores.opponent}
                rating={ratings.opponent}
                eliminated={opponentEliminated}
                avatar={opponentAvatar}
                streakLabel={isActiveGameplay ? opponentStreakLabel : null}
                streakLevel={isActiveGameplay ? opponentStreakLevel : null}
                streakEffect={opponentStreakEffect}
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
                hp={showHP ? opponentDisplayHP : undefined}
                maxHp={DISPLAY_MAX_HP}
                hitKey={opponentHitKey}
                latestDamage={latestOpponentRawDamage}
                hitType={opponentHitType}
                hitIntensity={opponentHitIntensity}
                damageFlashTier={opponentDamageFlashTier}
                hitEffect={yourHitEffect}
                ultimateReady={ultimate.opponentReady && !ultimate.opponentUsed && ultimate.opponentImplemented}
                ultReadyCueKey={ultReadyCueKey.opponent}
                overclockUntil={ultimate.opponentOverclockUntil}
                blackoutUntil={ultimate.opponentBlackoutUntil}
                shadowCorruptUntil={ultimate.opponentShadowCorruptUntil}
                shadowCorruptStacks={ultimate.opponentShadowCorruptStacks}
                architectUntil={ultimate.opponentArchitectUntil}
                architectMarks={ultimate.opponentArchitectMarks}
                architectSequenceStreak={ultimate.opponentArchitectSequenceStreak}
                opponentArchitectUntil={ultimate.architectUntil}
                opponentArchitectMarks={ultimate.architectMarks}
                opponentArchitectSequenceStreak={ultimate.architectSequenceStreak}
                titanOverpowerUntil={ultimate.opponentTitanOverpowerUntil}
                titanStreak={ultimate.opponentTitanStreak}
                titanBreakArmed={ultimate.opponentTitanBreakArmed}
                opponentTitanOverpowerUntil={ultimate.titanOverpowerUntil}
                opponentTitanStreak={ultimate.titanStreak}
                opponentTitanBreakArmed={ultimate.titanBreakArmed}
                fortressUntil={ultimate.opponentFortressUntil}
                fortressBlocksRemaining={ultimate.opponentFortressBlocksRemaining}
                infernoPendingUntil={ultimate.opponentInfernoPendingUntil}
                infernoStacks={ultimate.opponentNovaBonusRemaining}
                ultimateQuestionsLeft={ultimate.opponentUltimateQuestionsLeft}
                ultimateName={ultimate.opponentName}
              />
              <AnimatePresence>
                {scoreImpactKey.opponent > 0 ? (
                  <motion.div
                    key={`score-opp-${scoreImpactKey.opponent}`}
                    className="pointer-events-none absolute inset-0 z-10 rounded-3xl"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: [0, isCloseScore ? 0.48 : 0.34, 0], scale: [0.98, 1.01, 1] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: isCloseScore ? 0.34 : 0.28, ease: "easeOut" }}
                    style={{
                      background:
                        "radial-gradient(ellipse at 75% 35%, rgba(251,113,133,0.46) 0%, rgba(251,113,133,0.12) 34%, transparent 68%)"
                    }}
                  />
                ) : null}
              </AnimatePresence>
              <OpponentPresence
                activity={opponentActivity}
                opponentAnswered={feedback.opponentAnsweredCurrent}
                youAnswered={feedback.youAnsweredCurrent}
                isActive={isActiveGameplay}
              />
              <MatchChampionCard
                model={{
                  side: "opponent",
                  playerName: opponentName,
                  avatarId: opponentAvatarId,
                  ultimateType: normalizeUltimateType(ultimate.opponentType),
                  ultimateName: ultimate.opponentName,
                  charge: ultimate.opponentCharge,
                  ready: ultimate.opponentReady,
                  used: ultimate.opponentUsed,
                  implemented: ultimate.opponentImplemented,
                  overclockUntil: ultimate.opponentOverclockUntil,
                  blackoutUntil: ultimate.opponentBlackoutUntil,
                  fortressUntil: ultimate.opponentFortressUntil,
                  fortressBlocksRemaining: ultimate.opponentFortressBlocksRemaining,
                  infernoPending: ultimate.opponentInfernoPending,
                  infernoPendingUntil: ultimate.opponentInfernoPendingUntil,
                  infernoStacks: ultimate.opponentNovaBonusRemaining,
                  flashOverclockStacks: ultimate.opponentFlashOverclockStacks,
                  ultimateQuestionsLeft: ultimate.opponentUltimateQuestionsLeft,
                }}
              />
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
            </motion.div>
          </div>
        )}

        {isRoomLobby && roomLobby ? (
          <div className="q-card-strong rounded-[1.75rem] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400/70">Room Code</p>
                <p className="mt-1 font-mono text-2xl font-black tracking-[0.28em] text-sky-200 sm:text-3xl">
                  {formatRoomCode(roomLobby.roomCode)}
                </p>
              </div>
              <Button
                variant="secondary"
                className="px-4 py-2 text-sm"
                onClick={handleCopyRoomCode}
                loading={copyRoomPending}
                loadingText="Copying..."
              >
                Copy Code
              </Button>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <p>Topic: <span className="font-semibold text-white">{formatTopicLabel(getSafeTopic(roomLobby.topic))}</span></p>
              <p>Difficulty: <span className="font-semibold text-white">{roomLobby.difficulty}</span></p>
            </div>

            <div className="q-card-subtle mt-4 rounded-xl px-3 py-2.5 text-sm text-slate-300">
              <span
                className={`mr-2 inline-block h-2 w-2 rounded-full ${
                  roomReady ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                }`}
              />
              {roomReady ? "Both players ready." : "Waiting for another player to join..."}
            </div>

            <div className="mt-4 space-y-2">
              {roomLobby.players.map((player) => (
                <div key={player.socketId} className="q-card-subtle flex items-center justify-between rounded-xl px-3 py-2.5">
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
                disabled={!roomLobby.isHost || !roomLobby.canStart || roomStartPending}
                loading={roomStartPending}
                loadingText="Starting..."
              >
                {roomLobby.isHost
                  ? roomLobby.canStart
                    ? "Start Match"
                    : "Waiting for Player"
                  : "Host Starts Match"}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleReturnToLobby}
                disabled={leavePending}
                loading={leavePending}
                loadingText="Leaving..."
              >
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
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={handleReturnToLobby}
                disabled={leavePending}
                loading={leavePending}
                loadingText="Leaving..."
              >
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
              <Button
                variant="secondary"
                className="w-full"
                onClick={handleReturnToLobby}
                disabled={leavePending}
                loading={leavePending}
                loadingText="Leaving..."
              >
                Return to Lobby
              </Button>
            </div>
          </div>
        ) : !isFinished ? (
          <>
            {/* Question card — shake wrapper + frost burst overlay */}
            <motion.div animate={animState.questionShakeControls}>
              <div className="neon-panel relative rounded-[1.75rem] p-4 text-center transition-all duration-300 sm:p-6">
                {isActiveGameplay ? (
                  <motion.div
                    className={`absolute right-3 top-3 rounded-full border px-2 py-1 text-sm font-black tracking-[0.15em] sm:right-5 sm:top-5 sm:px-4 sm:py-2 sm:text-lg sm:tracking-[0.2em] ${
                      showFinalPhase
                        ? "border-rose-400/70 bg-rose-950/70 text-rose-100 shadow-[0_0_18px_rgba(248,113,113,0.35)]"
                        : "border-indigo-300/20 bg-slate-950/30 text-cyan-100"
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
                ) : null}
                <p className={`text-sm uppercase tracking-[0.3em] text-textSecondary ${isActiveGameplay ? "pr-14 sm:pr-0" : ""}`}>
                  {isCountdown ? "Countdown" : isWaitingState ? "Match Status" : "Current Question"}
                </p>

                <div className="mt-3 flex min-h-[6.5rem] items-center justify-center sm:min-h-[7.5rem]">
                  {isCountdown ? (
                    <CountdownDisplay value={countdownValue} />
                  ) : (
                    <div className="max-h-[9rem] w-full overflow-hidden">
                      {isWaitingState ? (
                        <p className="text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl">
                          {statusHeading[status]}
                        </p>
                      ) : (
                        <QuestionContent
                          question={currentQuestionData}
                          fallbackPrompt={currentQuestion}
                          compact
                          promptClassName="text-xl font-black tracking-tight text-white sm:text-3xl md:text-5xl"
                        />
                      )}
                    </div>
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
              {/* Live match uses the dedicated fixed in-match layout above. */}
              <div aria-hidden="true" className="h-[9.5rem]" />
            </div>
          </>
        ) : (
          /* Game over - loss gets a subtle downward drift */
          <motion.div
            initial={{ y: 0 }}
            animate={finalResult === "loss" ? { y: [0, 6, 0] } : {}}
            transition={{ duration: 1.3, delay: 0.5, ease: "easeInOut" }}
          >
            <MatchResultPanel
              result={finalResult}
              scores={scores}
              yourName={yourName}
              opponentName={opponentName}
              yourAvatar={yourAvatar}
              opponentAvatar={opponentAvatar}
              ratingChange={gameResult?.ratingChange}
              newRatings={gameResult?.newRatings}
              peakStreak={gameResult?.peakStreak ?? peakYouStreakRef.current}
              opponentPeakStreak={gameResult?.opponentPeakStreak ?? peakOpponentStreakRef.current}
              rematchRequested={rematchRequested}
              statusText={rematchStatusText.trim() || undefined}
              primaryActionLabel={rematchCtaLabel}
              primaryActionDisabled={rematchRequested || leavePending}
              secondaryActionLabel={leavePending ? "Leaving..." : "Change Topic"}
              matchRewards={matchRewards}
              onRematch={handlePlayAgain}
              onChangeTopic={handleChangeTopic}
            />
          </motion.div>
        )}
      </div>
    </section>
  );
}

