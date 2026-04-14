"use client";

import { io, type Socket } from "socket.io-client";

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
    powerUpAvailable?: "freeze" | "shield" | null;
    opponentPowerUpAvailable?: "freeze" | "shield" | null;
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
  }) => void;
  powerUpUsed: (payload: {
    type: "freeze";
    by: "you" | "opponent";
    target: "you" | "opponent";
    durationMs: number;
    powerUpAvailable?: "freeze" | "shield" | null;
    opponentPowerUpAvailable?: "freeze" | "shield" | null;
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
  }) => void;
  shieldActivated: (payload: {
    by: "you" | "opponent";
    powerUpAvailable?: "freeze" | "shield" | null;
    opponentPowerUpAvailable?: "freeze" | "shield" | null;
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
  }) => void;
  shieldBlocked: (payload: {
    by: "you" | "opponent";
    target: "you" | "opponent";
    blockedType: "freeze";
    powerUpAvailable?: "freeze" | "shield" | null;
    opponentPowerUpAvailable?: "freeze" | "shield" | null;
    shieldActive?: boolean;
    opponentShieldActive?: boolean;
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
  submitAnswer: (answer: string) => void;
  requestRematch: () => void;
  usePowerUp: (payload: { type: "freeze" | "shield" }) => void;
  sendEmote: (payload: { emoteId: string }) => void;
};

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const createGameSocket = (): GameSocket => {
  if (!socketUrl) {
    throw new Error("NEXT_PUBLIC_SERVER_URL is not set and no browser origin fallback is available.");
  }

  return io(socketUrl, {
    // Try WebSocket first; fall back to HTTP long-polling for networks that block WS.
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1500
  });
};
