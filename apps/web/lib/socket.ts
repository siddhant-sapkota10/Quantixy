"use client";

import { io, type Socket } from "socket.io-client";
import type { PowerUpId } from "@/lib/powerups";

// NEXT_PUBLIC_SERVER_URL must be set in Vercel (production) env vars.
// For local dev it falls back to localhost:3001 via .env.local.
const socketUrl =
  process.env.NEXT_PUBLIC_SERVER_URL ??
  (typeof window !== "undefined" ? window.location.origin : undefined);

if (typeof window !== "undefined") {
  console.log("[socket] server URL →", socketUrl ?? "(none — check NEXT_PUBLIC_SERVER_URL)");
}

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
  }) => void;
  timerUpdate: (payload: {
    secondsLeft: number;
  }) => void;
  countdown: (payload: {
    value: string;
  }) => void;
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
  roomError: (payload: {
    message: string;
  }) => void;
  newQuestion: (payload: { question?: string } | string) => void;
  incorrectAnswer: () => void;
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
    youAnswered?: boolean;
    opponentAnswered?: boolean;
    powerUpAvailable?: PowerUpId | null;
    opponentPowerUpAvailable?: PowerUpId | null;
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
    slowedUntil?: number;
    opponentSlowedUntil?: number;
    doublePointsUntil?: number;
    opponentDoublePointsUntil?: number;
  }) => void;
  questionState: (payload: {
    youAnswered: boolean;
    opponentAnswered: boolean;
    winner: "you" | "opponent" | null;
  }) => void;
  powerUpUsed: (payload: {
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
  }) => void;
  shieldActivated: (payload: {
    by: "you" | "opponent";
    powerUpAvailable?: PowerUpId | null;
    opponentPowerUpAvailable?: PowerUpId | null;
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
    slowedUntil?: number;
    opponentSlowedUntil?: number;
    doublePointsUntil?: number;
    opponentDoublePointsUntil?: number;
  }) => void;
  shieldBlocked: (payload: {
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
  }) => void;
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
  opponentLeft: (payload: {
    message?: string;
  }) => void;
  emoteReceived: (payload: {
    emoteId: string;
    sender: "opponent" | "you";
  }) => void;
};

export type ClientToServerEvents = {
  joinQueue: (payload: { topic: string; difficulty: string; accessToken?: string }) => void;
  createRoom: (payload: { topic: string; difficulty: string; accessToken?: string }) => void;
  joinRoom: (payload: { roomCode: string; accessToken?: string }) => void;
  startRoomMatch: () => void;
  leaveRoom: () => void;
  submitAnswer: (answer: string) => void;
  requestRematch: () => void;
  usePowerUp: (payload: { type: PowerUpId }) => void;
  sendEmote: (payload: { emoteId: string }) => void;
};

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const createGameSocket = (): GameSocket => {
  if (!socketUrl) {
    throw new Error("NEXT_PUBLIC_SERVER_URL is not set and no browser origin fallback is available.");
  }

  return io(socketUrl, {
    // Start with HTTP long-polling so the Engine.IO session handshake always succeeds
    // through Render's proxy, then automatically upgrade to WebSocket.
    // "websocket" first skips the handshake and fails on most reverse proxies.
    transports: ["polling", "websocket"],
    autoConnect: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
    timeout: 20000
  });
};
