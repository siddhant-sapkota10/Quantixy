"use client";

import { io, type Socket } from "socket.io-client";
import type { PowerUpId } from "@/lib/powerups";

const socketUrl =
  process.env.NEXT_PUBLIC_SERVER_URL ??
  (typeof window !== "undefined" ? window.location.origin : undefined);

if (typeof window !== "undefined") {
  console.log("[socket] server URL ->", socketUrl ?? "(none - check NEXT_PUBLIC_SERVER_URL)");
}

type UltimateStatePayload = {
  ultimateType?: string;
  ultimateName?: string;
  ultimateDescription?: string;
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
  overclockUntil?: number;
  opponentOverclockUntil?: number;
  fortressUntil?: number;
  opponentFortressUntil?: number;
  fortressBlocksRemaining?: number;
  opponentFortressBlocksRemaining?: number;
  flashBonusRemaining?: number;
  opponentFlashBonusRemaining?: number;
  novaBonusRemaining?: number;
  opponentNovaBonusRemaining?: number;
  infernoPending?: boolean;
  opponentInfernoPending?: boolean;
};

export type ServerToClientEvents = {
  authRequired: (payload: { message?: string }) => void;
  matchFound: (payload: {
    roomId?: string;
    room?: string;
    roomInfo?: { id?: string; name?: string };
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
  } & UltimateStatePayload) => void;
  timerUpdate: (payload: { secondsLeft: number } & UltimateStatePayload) => void;
  countdown: (payload: { value: string }) => void;
  roomCreated: (payload: {
    roomCode: string;
    topic: string;
    difficulty: string;
    status: "waiting" | "ready" | "in-game" | "finished";
    isHost: boolean;
    canStart: boolean;
    players: Array<{
      socketId: string;
      name: string;
      avatar: string;
      isHost: boolean;
    }>;
  }) => void;
  roomJoined: (payload: {
    roomCode: string;
    topic: string;
    difficulty: string;
    status: "waiting" | "ready" | "in-game" | "finished";
    isHost: boolean;
    canStart: boolean;
    players: Array<{
      socketId: string;
      name: string;
      avatar: string;
      isHost: boolean;
    }>;
  }) => void;
  roomUpdated: (payload: {
    roomCode: string;
    topic: string;
    difficulty: string;
    status: "waiting" | "ready" | "in-game" | "finished";
    isHost: boolean;
    canStart: boolean;
    players: Array<{
      socketId: string;
      name: string;
      avatar: string;
      isHost: boolean;
    }>;
  }) => void;
  roomError: (payload: { message: string }) => void;
  newQuestion: (payload: { question?: string; token?: number } | string) => void;
  incorrectAnswer: (payload: { strikes: number; eliminated: boolean }) => void;
  opponentStrike: (payload: { opponentStrikes: number; opponentEliminated: boolean }) => void;
  liveLeaderboard: (payload: {
    entries: Array<{
      socketId: string;
      name: string;
      avatar: string;
      score: number;
      strikes: number;
      eliminated: boolean;
    }>;
    scores?: { you: number; opponent: number };
    strikes?: { you: number; opponent: number };
    eliminated?: { you: boolean; opponent: boolean };
    updatedAt: number;
  } & UltimateStatePayload) => void;
  pointScored: (payload: {
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
    youAnswered?: boolean;
    opponentAnswered?: boolean;
    powerUpAvailable?: PowerUpId | null;
    opponentPowerUpAvailable?: PowerUpId | null;
    powerUpsAvailable?: PowerUpId[];
    opponentPowerUpsAvailable?: PowerUpId[];
    powerUpsUsed?: PowerUpId[];
    opponentPowerUpsUsed?: PowerUpId[];
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
    slowedUntil?: number;
    opponentSlowedUntil?: number;
    doublePointsUntil?: number;
    opponentDoublePointsUntil?: number;
    hintText?: string;
    hintUntil?: number;
  } & UltimateStatePayload) => void;
  questionState: (payload: {
    youAnswered: boolean;
    opponentAnswered: boolean;
    winner: "you" | "opponent" | null;
    youEliminated?: boolean;
    opponentEliminated?: boolean;
  } & UltimateStatePayload) => void;
  ultimateApplied: (payload: {
    by: "you" | "opponent";
    target: "you" | "opponent";
    type: string;
    effect: string;
    durationMs?: number;
    questionsRemaining?: number;
  } & UltimateStatePayload) => void;
  ultimateEnded: (payload: {
    by: "you" | "opponent";
    target: "you" | "opponent";
    type: string;
    effect: string;
  } & UltimateStatePayload) => void;
  powerUpUsed: (payload: {
    type: PowerUpId;
    by: "you" | "opponent";
    target: "you" | "opponent";
    durationMs?: number;
    removedEffects?: string[];
    blockedBy?: string;
    powerUpAvailable?: PowerUpId | null;
    opponentPowerUpAvailable?: PowerUpId | null;
    powerUpsAvailable?: PowerUpId[];
    opponentPowerUpsAvailable?: PowerUpId[];
    powerUpsUsed?: PowerUpId[];
    opponentPowerUpsUsed?: PowerUpId[];
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
    slowedUntil?: number;
    opponentSlowedUntil?: number;
    doublePointsUntil?: number;
    opponentDoublePointsUntil?: number;
    hintText?: string;
    hintUntil?: number;
  } & UltimateStatePayload) => void;
  shieldActivated: (payload: {
    by: "you" | "opponent";
    powerUpAvailable?: PowerUpId | null;
    opponentPowerUpAvailable?: PowerUpId | null;
    powerUpsAvailable?: PowerUpId[];
    opponentPowerUpsAvailable?: PowerUpId[];
    powerUpsUsed?: PowerUpId[];
    opponentPowerUpsUsed?: PowerUpId[];
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
    slowedUntil?: number;
    opponentSlowedUntil?: number;
    doublePointsUntil?: number;
    opponentDoublePointsUntil?: number;
    hintText?: string;
    hintUntil?: number;
  } & UltimateStatePayload) => void;
  shieldBlocked: (payload: {
    by: "you" | "opponent";
    target: "you" | "opponent";
    blockedType: "freeze";
    powerUpAvailable?: PowerUpId | null;
    opponentPowerUpAvailable?: PowerUpId | null;
    powerUpsAvailable?: PowerUpId[];
    opponentPowerUpsAvailable?: PowerUpId[];
    powerUpsUsed?: PowerUpId[];
    opponentPowerUpsUsed?: PowerUpId[];
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
    slowedUntil?: number;
    opponentSlowedUntil?: number;
    doublePointsUntil?: number;
    opponentDoublePointsUntil?: number;
    hintText?: string;
    hintUntil?: number;
  } & UltimateStatePayload) => void;
  gameOver: (payload: {
    winnerId?: string;
    winnerName?: string;
    winner?: string;
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
  }) => void;
  rematchStatus: (payload: {
    youRequested: boolean;
    opponentRequested: boolean;
    requiredPlayers: number;
    requestedPlayers: number;
  }) => void;
  opponentLeft: (payload: { message?: string }) => void;
  emotePlayed: (payload: {
    roomId: string;
    emoteId: string;
    senderSocketId: string;
    clientMessageId: string;
    sentAt: number;
  }) => void;
  /** Opponent started typing an answer — used to drive the presence indicator. */
  opponentTyping: () => void;
};

export type ClientToServerEvents = {
  joinQueue: (payload: { topic: string; difficulty: string; accessToken?: string }) => void;
  createRoom: (payload: { topic: string; difficulty: string; accessToken?: string }) => void;
  joinRoom: (payload: { roomCode: string; accessToken?: string }) => void;
  startRoomMatch: () => void;
  leaveRoom: () => void;
  submitAnswer: (payload: { answer: string; token: number }) => void;
  requestRematch: () => void;
  usePowerUp: (payload: { type: PowerUpId }) => void;
  activateUltimate: () => void;
  sendEmote: (payload: { emoteId: string; clientMessageId: string }) => void;
  /** Notify server that local player is actively typing — forwarded to opponent. */
  playerTyping: () => void;
};

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const createGameSocket = (): GameSocket => {
  if (!socketUrl) {
    throw new Error("NEXT_PUBLIC_SERVER_URL is not set and no browser origin fallback is available.");
  }

  return io(socketUrl, {
    // Prefer WebSocket over long-polling.  WebSocket upgrades are a single
    // HTTP request with an Upgrade header; there is no back-and-forth polling
    // cycle, so a momentary server hiccup is far less likely to surface as a
    // CORS error.  Polling is kept as a fallback for restrictive networks.
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  });
};
