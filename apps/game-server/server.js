require("dotenv").config({ path: __dirname + "/.env" });

const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { URL } = require("node:url");
const EMOTES = require("../../packages/shared/emotes.json");
const AVATARS = require("../../packages/shared/avatars.json");
const POWER_UPS = require("../../packages/shared/powerups.json");
const { verifyAccessToken } = require("./lib/supabase");
const {
  generateQuestion,
  isValidDifficulty,
  isValidTopic,
  normalizeAnswer
} = require("./lib/question-generators");
const {
  DEFAULT_RATING,
  findOrCreatePlayerFromAuthUser,
  getOrCreateRating,
  getLeaderboard,
  getProfileSummary,
  saveMatch,
  updateRatingsAfterMatch
} = require("./lib/persistence");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3001);

const DEFAULT_ALLOWED_ORIGINS = [
  "https://math-battle-web.vercel.app",
  "http://localhost:3000",
  "http://192.168.1.102:3000"
];
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const RESOLVED_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS;
const ALLOW_VERCEL_PREVIEWS = process.env.CORS_ALLOW_VERCEL_PREVIEWS === "true";

console.log("MATHBATTLE BACKEND LIVE VERSION A2");
console.log("[server] PORT =", PORT);
console.log("[server] ALLOWED_ORIGINS =", RESOLVED_ALLOWED_ORIGINS);
console.log("[server] CORS_ALLOW_VERCEL_PREVIEWS =", ALLOW_VERCEL_PREVIEWS);
const MATCH_DURATION_MS = 60000;
const TIMER_UPDATE_INTERVAL_MS = 1000;
const FREEZE_DURATION_MS = 1600;
const SLOW_DURATION_MS = 1000;
const POWER_UP_COOLDOWN_MS = 3500;
const MAX_POWER_UP_USES_PER_MATCH = POWER_UPS.length;
const EMOTE_COOLDOWN_MS = 1500;
const EMOTE_BURST_WINDOW_MS = 5000;
const EMOTE_BURST_LIMIT = 3;
const COUNTDOWN_STEPS = ["3", "2", "1", "GO"];
const COUNTDOWN_INTERVAL_MS = 1000;
const FAST_ANSWER_MS = 2000;
const K_FACTOR = 32;
const ULTIMATE_MAX_CHARGE = 100;
const ULTIMATE_TIME_CHARGE_PER_SECOND = 1.4;
const ULTIMATE_CORRECT_CHARGE = 18;
const ULTIMATE_STREAK_BONUS_CHARGE = 6;
const ULTIMATE_DEFAULT_DURATION_MS = 6000;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const topicQueues = new Map();
const activeGames = new Map();
const customRooms = new Map();
const VALID_EMOTE_IDS = new Set(EMOTES.map((emote) => emote.id));
const POWER_UP_BY_ID = new Map(POWER_UPS.map((powerUp) => [powerUp.id, powerUp]));
const POWER_UP_IDS = POWER_UPS.map((powerUp) => powerUp.id);
const AVATAR_BY_ID = new Map(AVATARS.map((avatar) => [avatar.id, avatar]));
let roomCounter = 1;

function getAllowedOrigin(request) {
  const requestOrigin = request.headers.origin ?? "";

  if (!requestOrigin) {
    return RESOLVED_ALLOWED_ORIGINS[0] ?? "*";
  }

  if (RESOLVED_ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }

  if (ALLOW_VERCEL_PREVIEWS) {
    try {
      const parsed = new URL(requestOrigin);
      if (parsed.protocol === "https:" && parsed.hostname.endsWith(".vercel.app")) {
        return requestOrigin;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function sendJson(request, response, statusCode, payload) {
  const allowedOrigin = getAllowedOrigin(request);
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };

  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(payload));
}

async function handleHttpRequest(request, response) {
  if (!request.url) {
    sendJson(request, response, 400, { error: "Invalid request URL" });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? `localhost:${PORT}`}`);

  if (request.method === "OPTIONS") {
    sendJson(request, response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/leaderboard") {
    try {
      const topic = url.searchParams.get("topic") ?? undefined;
      const rows = await getLeaderboard(topic);

      sendJson(request, response, 200, {
        topic: topic ?? "all",
        leaderboard: rows
      });
    } catch (error) {
      console.error("[server] leaderboard fetch failed", error);
      sendJson(request, response, 500, { error: "Failed to load leaderboard" });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/profile") {
    let authUserId = null;

    try {
      const authHeader = request.headers.authorization ?? "";
      const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

      if (!accessToken) {
        sendJson(request, response, 401, { error: "Missing access token" });
        return;
      }

      const authUser = await verifyAccessToken(accessToken);
      authUserId = authUser.id;
      console.log("[server] profile fetch received", { authUserId });
      const profile = await getProfileSummary(authUser.id);

      if (!profile) {
        console.warn("[server] profile not found", { authUserId });
        sendJson(request, response, 404, { error: "Profile not found" });
        return;
      }

      sendJson(request, response, 200, profile);
    } catch (error) {
      console.error("[server] profile fetch failed", { authUserId, error });
      sendJson(request, response, 500, { error: "Failed to load profile" });
    }
    return;
  }

  sendJson(request, response, 404, { error: "Not found" });
}

const httpServer = createServer((request, response) => {
  void handleHttpRequest(request, response);
});

const io = new Server(httpServer, {
  cors: {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (RESOLVED_ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      if (ALLOW_VERCEL_PREVIEWS) {
        try {
          const parsed = new URL(origin);
          if (parsed.protocol === "https:" && parsed.hostname.endsWith(".vercel.app")) {
            callback(null, true);
            return;
          }
        } catch {
          callback(new Error("Invalid origin"), false);
          return;
        }
      }

      callback(new Error(`Origin not allowed: ${origin}`), false);
    },
    methods: ["GET", "POST"],
    credentials: false
  }
});

function sanitizeUsername(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
}

function getGuestName(socketId) {
  return `Guest-${socketId.slice(0, 4)}`;
}

function normalizeRoomCode(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

function generateRoomCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let code = "";

    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      const randomIndex = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
      code += ROOM_CODE_ALPHABET[randomIndex];
    }

    if (!customRooms.has(code)) {
      return code;
    }
  }

  return null;
}

function calculateEloChange(playerRating, opponentRating, actualScore) {
  const expectedScore = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
  return Math.round(K_FACTOR * (actualScore - expectedScore));
}

function ensureQuestionAtIndex(game, index) {
  while (game.questionBank.length <= index) {
    const question = generateQuestion(game.topic, game.difficulty, game.roomId);
    game.questionBank.push(question);
  }

  return game.questionBank[index];
}

function clearCountdown(game) {
  if (game.countdownInterval) {
    clearInterval(game.countdownInterval);
    game.countdownInterval = null;
  }
}

function clearMatchTimer(game) {
  if (game.matchTimerInterval) {
    clearInterval(game.matchTimerInterval);
    game.matchTimerInterval = null;
  }
}

function clearPlayerQuestionTimer(game, socketId) {
  if (game.questionTimeouts[socketId]) {
    clearTimeout(game.questionTimeouts[socketId]);
    game.questionTimeouts[socketId] = null;
  }
}

function clearAllQuestionTimers(game) {
  for (const player of game.players) {
    clearPlayerQuestionTimer(game, player.socketId);
  }
}

function clearUltimateTimeoutMap(game, key) {
  for (const player of game.players) {
    const timeoutHandle = game[key]?.[player.socketId];
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      game[key][player.socketId] = null;
    }
  }
}

function clearUltimateEffects(game) {
  clearUltimateTimeoutMap(game, "titanTimeout");
  clearUltimateTimeoutMap(game, "blackoutTimeout");
  game.titanUntil = buildTitanUntilMap(game.players);
  game.blackoutUntil = buildBlackoutUntilMap(game.players);
  game.overclockUntil = buildOverclockUntilMap(game.players);
  game.fortressUntil = buildFortressUntilMap(game.players);
  game.flashBonusRemaining = buildFlashBonusRemainingMap(game.players);
  game.novaBonusRemaining = buildNovaBonusRemainingMap(game.players);
  game.fortressBlocksRemaining = buildFortressBlocksMap(game.players);
  game.infernoPending = buildInfernoPendingMap(game.players);
}

function buildScoreMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildPowerUpInventoryMap(players) {
  const initialInventory = Object.fromEntries(POWER_UP_IDS.map((powerUpId) => [powerUpId, true]));
  return Object.fromEntries(
    players.map((player) => [player.socketId, { ...initialInventory }])
  );
}

function buildPowerUpUsedListMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, []]));
}

function buildUltimateChargeMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildUltimateReadyMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, false]));
}

function buildUltimateUsedMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, false]));
}

function buildTitanUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildBlackoutUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildOverclockUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildFortressUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildFlashBonusRemainingMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildNovaBonusRemainingMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildFortressBlocksMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildInfernoPendingMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, false]));
}

function buildUltimateEffectTimeoutMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, null]));
}

function buildStrikeMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildEliminatedMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, false]));
}

function buildFreezeMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildShieldMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, false]));
}

function buildSlowMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildDoublePointsMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildHintTextMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, ""]));
}

function buildHintUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildPowerUpCooldownMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildPowerUpUsesMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildPlayerQuestionState(players) {
  return Object.fromEntries(
    players.map((player) => [
      player.socketId,
      {
        index: 0,
        answered: false,
        questionSentAt: null,
        currentQuestion: null,
        generation: 0
      }
    ])
  );
}

function buildEmoteCooldownMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function clearMatchEffects(game) {
  game.powerUpInventory = buildPowerUpInventoryMap(game.players);
  game.powerUpUsedList = buildPowerUpUsedListMap(game.players);
  game.freezeUntil = buildFreezeMap(game.players);
  game.shieldActive = buildShieldMap(game.players);
  game.slowUntil = buildSlowMap(game.players);
  game.doublePointsUntil = buildDoublePointsMap(game.players);
  game.hintText = buildHintTextMap(game.players);
  game.hintUntil = buildHintUntilMap(game.players);
  game.powerUpCooldownUntil = buildPowerUpCooldownMap(game.players);
  game.powerUpUsesCount = buildPowerUpUsesMap(game.players);
  game.emoteCooldownUntil = buildEmoteCooldownMap(game.players);
  game.emoteTimestamps = Object.fromEntries(game.players.map((p) => [p.socketId, []]));
  clearUltimateEffects(game);
}

function buildTimerPayload(game) {
  if (!game.endsAt) {
    return { secondsLeft: Math.ceil(MATCH_DURATION_MS / 1000) };
  }

  return {
    secondsLeft: Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000))
  };
}

function getOpponent(game, socketId) {
  return game.players.find((player) => player.socketId !== socketId) ?? null;
}

function buildRoomLobbyPayload(room, socketId) {
  const isHost = room.hostSocketId === socketId;

  return {
    roomCode: room.roomCode,
    topic: room.topic,
    difficulty: room.difficulty,
    status: room.status,
    isHost,
    canStart: isHost && room.players.length === 2 && room.status !== "in-game",
    players: room.players.map((player) => ({
      socketId: player.socketId,
      name: player.name,
      avatar: player.avatar,
      isHost: player.socketId === room.hostSocketId
    }))
  };
}

function emitRoomUpdated(room) {
  for (const player of room.players) {
    io.to(player.socketId).emit("roomUpdated", buildRoomLobbyPayload(room, player.socketId));
  }
}

function isActiveUntil(value) {
  return typeof value === "number" && value > Date.now();
}

function getAvatarUltimateConfig(avatarId) {
  return AVATAR_BY_ID.get(avatarId) ?? AVATAR_BY_ID.get("flash");
}

function normalizeAvatarId(value) {
  if (AVATAR_BY_ID.has(value)) {
    return value;
  }

  if (typeof value === "string") {
    const legacyValue = value.toLowerCase();
    if (legacyValue === "titan" || legacyValue === "aegis" || legacyValue === "frost") {
      return "guardian";
    }
    if (legacyValue === "volt") {
      return "flash";
    }
    if (legacyValue === "nova") {
      return "inferno";
    }
  }

  return "flash";
}

function getUltimateTypeForPlayer(game, socketId) {
  const player = game.players.find((entry) => entry.socketId === socketId);
  return getAvatarUltimateConfig(player?.avatar)?.ultimateId ?? "rapid_fire";
}

function getUltimateDisplayNameForPlayer(game, socketId) {
  const player = game.players.find((entry) => entry.socketId === socketId);
  return getAvatarUltimateConfig(player?.avatar)?.ultimateName ?? "Rapid Fire";
}

function getUltimateDescriptionForPlayer(game, socketId) {
  const player = game.players.find((entry) => entry.socketId === socketId);
  return getAvatarUltimateConfig(player?.avatar)?.ultimateDescription ?? "";
}

function getUltimateDurationMs(ultimateType) {
  const avatar = AVATARS.find((entry) => entry.ultimateId === ultimateType);
  return avatar?.ultimateMeta?.durationMs ?? ULTIMATE_DEFAULT_DURATION_MS;
}

function getUltimateMeta(ultimateType) {
  const avatar = AVATARS.find((entry) => entry.ultimateId === ultimateType);
  return avatar?.ultimateMeta ?? {};
}

function getUltimateChargeMultiplier(game, socketId) {
  const player = game.players.find((entry) => entry.socketId === socketId);
  return getAvatarUltimateConfig(player?.avatar)?.ultimateMeta?.chargeMultiplier ?? 1;
}

function isUltimateImplemented(ultimateType) {
  return Boolean(AVATARS.find((avatar) => avatar.ultimateId === ultimateType));
}

function buildPlayerUltimateState(game, socketId) {
  const opponent = getOpponent(game, socketId);
  const opponentId = opponent?.socketId;
  const yourUltimateType = getUltimateTypeForPlayer(game, socketId);
  const opponentUltimateType = opponentId ? getUltimateTypeForPlayer(game, opponentId) : "rapid_fire";

  return {
    ultimateType: yourUltimateType,
    ultimateName: getUltimateDisplayNameForPlayer(game, socketId),
    ultimateDescription: getUltimateDescriptionForPlayer(game, socketId),
    ultimateCharge: game.ultimateCharge[socketId] ?? 0,
    ultimateReady: !!game.ultimateReady[socketId],
    ultimateUsed: !!game.ultimateUsed[socketId],
    ultimateImplemented: isUltimateImplemented(yourUltimateType),
    opponentUltimateType,
    opponentUltimateName: opponentId ? getUltimateDisplayNameForPlayer(game, opponentId) : "Unknown",
    opponentUltimateCharge: opponentId ? game.ultimateCharge[opponentId] ?? 0 : 0,
    opponentUltimateReady: opponentId ? !!game.ultimateReady[opponentId] : false,
    opponentUltimateUsed: opponentId ? !!game.ultimateUsed[opponentId] : false,
    opponentUltimateImplemented: isUltimateImplemented(opponentUltimateType),
    titanUntil: game.titanUntil[socketId] ?? 0,
    opponentTitanUntil: opponentId ? game.titanUntil[opponentId] ?? 0 : 0,
    blackoutUntil: game.blackoutUntil[socketId] ?? 0,
    opponentBlackoutUntil: opponentId ? game.blackoutUntil[opponentId] ?? 0 : 0,
    overclockUntil: game.overclockUntil[socketId] ?? 0,
    opponentOverclockUntil: opponentId ? game.overclockUntil[opponentId] ?? 0 : 0,
    fortressUntil: game.fortressUntil[socketId] ?? 0,
    opponentFortressUntil: opponentId ? game.fortressUntil[opponentId] ?? 0 : 0,
    fortressBlocksRemaining: game.fortressBlocksRemaining[socketId] ?? 0,
    opponentFortressBlocksRemaining: opponentId ? game.fortressBlocksRemaining[opponentId] ?? 0 : 0,
    flashBonusRemaining: game.flashBonusRemaining[socketId] ?? 0,
    opponentFlashBonusRemaining: opponentId ? game.flashBonusRemaining[opponentId] ?? 0 : 0,
    novaBonusRemaining: game.novaBonusRemaining[socketId] ?? 0,
    opponentNovaBonusRemaining: opponentId ? game.novaBonusRemaining[opponentId] ?? 0 : 0,
    infernoPending: !!game.infernoPending[socketId],
    opponentInfernoPending: opponentId ? !!game.infernoPending[opponentId] : false
  };
}

function increaseUltimateCharge(game, socketId, baseAmount) {
  if (game.ultimateUsed[socketId]) {
    return;
  }

  const multiplier = getUltimateChargeMultiplier(game, socketId);
  const delta = Math.max(0, baseAmount * multiplier);
  const nextCharge = Math.min(ULTIMATE_MAX_CHARGE, (game.ultimateCharge[socketId] ?? 0) + delta);
  game.ultimateCharge[socketId] = nextCharge;
  game.ultimateReady[socketId] = nextCharge >= ULTIMATE_MAX_CHARGE;
}

function getDurationForPowerUp(type) {
  const configuredDuration = POWER_UP_BY_ID.get(type)?.durationMs;

  if (Number.isFinite(configuredDuration)) {
    return configuredDuration;
  }

  if (type === "freeze") {
    return FREEZE_DURATION_MS;
  }

  if (type === "double_points") {
    return 0;
  }

  return 0;
}

function getAvailablePowerUps(game, socketId) {
  const inventory = game.powerUpInventory[socketId] ?? {};
  return POWER_UP_IDS.filter((powerUpId) => inventory[powerUpId]);
}

function hasPowerUp(game, socketId, type) {
  return Boolean(game.powerUpInventory[socketId]?.[type]);
}

function consumePowerUp(game, socketId, type) {
  if (!hasPowerUp(game, socketId, type)) {
    return false;
  }

  game.powerUpInventory[socketId][type] = false;
  game.powerUpUsedList[socketId] = [...(game.powerUpUsedList[socketId] ?? []), type];
  game.powerUpUsesCount[socketId] = (game.powerUpUsesCount[socketId] ?? 0) + 1;
  game.powerUpCooldownUntil[socketId] = Date.now() + POWER_UP_COOLDOWN_MS;
  return true;
}

function buildQuestionHint(question) {
  const answer = String(question?.answer ?? "").trim();
  if (!answer) {
    return "No hint available.";
  }

  if (answer.length === 1) {
    return `Hint: answer is a single character and starts with "${answer[0]}".`;
  }

  return `Hint: starts with "${answer[0]}" and has ${answer.length} characters.`;
}

function clearHintState(game, socketId) {
  game.hintText[socketId] = "";
  game.hintUntil[socketId] = 0;
}

function isProtectedByFortress(game, socketId) {
  return (
    isActiveUntil(game.fortressUntil[socketId]) &&
    (game.fortressBlocksRemaining[socketId] ?? 0) > 0
  );
}

function consumeIncomingProtection(game, socketId) {
  if (isProtectedByFortress(game, socketId)) {
    game.fortressBlocksRemaining[socketId] = Math.max(0, (game.fortressBlocksRemaining[socketId] ?? 0) - 1);
    return "guardian_shield";
  }

  if (game.shieldActive[socketId]) {
    game.shieldActive[socketId] = false;
    return "shield";
  }

  return null;
}

function buildPlayerPowerState(game, socketId) {
  const opponent = getOpponent(game, socketId);
  const opponentId = opponent?.socketId;
  const available = getAvailablePowerUps(game, socketId);
  const opponentAvailable = opponentId ? getAvailablePowerUps(game, opponentId) : [];

  return {
    powerUpAvailable: available[0] ?? null,
    opponentPowerUpAvailable: opponentAvailable[0] ?? null,
    powerUpsAvailable: available,
    opponentPowerUpsAvailable: opponentAvailable,
    powerUpsUsed: game.powerUpUsedList[socketId] ?? [],
    opponentPowerUpsUsed: opponentId ? game.powerUpUsedList[opponentId] ?? [] : [],
    shieldActive: !!game.shieldActive[socketId],
    opponentShieldActive: opponentId ? !!game.shieldActive[opponentId] : false,
    slowedUntil: game.slowUntil[socketId] ?? 0,
    opponentSlowedUntil: opponentId ? game.slowUntil[opponentId] ?? 0 : 0,
    doublePointsUntil: game.doublePointsUntil[socketId] ?? 0,
    opponentDoublePointsUntil: opponentId ? game.doublePointsUntil[opponentId] ?? 0 : 0,
    hintText: game.hintText[socketId] ?? "",
    hintUntil: game.hintUntil[socketId] ?? 0,
    ...buildPlayerUltimateState(game, socketId)
  };
}

function emitLiveLeaderboard(roomId) {
  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  const entries = game.players
    .map((player) => ({
      socketId: player.socketId,
      name: player.name,
      avatar: player.avatar,
      score: game.scores[player.socketId] ?? 0,
      strikes: game.strikes[player.socketId] ?? 0,
      eliminated: !!game.eliminated[player.socketId]
    }))
    .sort((a, b) => {
      if (a.eliminated !== b.eliminated) {
        return a.eliminated ? 1 : -1;
      }

      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.strikes - b.strikes;
    });

  for (const player of game.players) {
    const opponent = getOpponent(game, player.socketId);
    if (!opponent) {
      continue;
    }

    io.to(player.socketId).emit("liveLeaderboard", {
      entries,
      scores: {
        you: game.scores[player.socketId] ?? 0,
        opponent: game.scores[opponent.socketId] ?? 0
      },
      strikes: {
        you: game.strikes[player.socketId] ?? 0,
        opponent: game.strikes[opponent.socketId] ?? 0
      },
      eliminated: {
        you: !!game.eliminated[player.socketId],
        opponent: !!game.eliminated[opponent.socketId]
      },
      ...buildPlayerPowerState(game, player.socketId),
      updatedAt: Date.now()
    });
  }
}

function emitQuestionState(roomId) {
  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  for (const player of game.players) {
    const opponent = getOpponent(game, player.socketId);

    if (!opponent) {
      continue;
    }

    const youState = game.playerQuestionState[player.socketId];
    const opponentState = game.playerQuestionState[opponent.socketId];
    const sameQuestion = youState?.index === opponentState?.index;
    const winnerSocketId = sameQuestion ? game.questionWinnersByIndex[youState?.index ?? -1] : null;
    const winner =
      !winnerSocketId
        ? null
        : winnerSocketId === player.socketId
          ? "you"
          : "opponent";

    io.to(player.socketId).emit("questionState", {
      youAnswered: !!youState?.answered,
      opponentAnswered: sameQuestion ? !!opponentState?.answered : false,
      winner,
      youEliminated: !!game.eliminated[player.socketId],
      opponentEliminated: !!game.eliminated[opponent.socketId],
      ...buildPlayerUltimateState(game, player.socketId)
    });
  }
}

function resetGameState(game) {
  game.questionBank = [];
  game.questionWinnersByIndex = {};
  game.playerQuestionState = buildPlayerQuestionState(game.players);
  game.questionTimeouts = Object.fromEntries(game.players.map((player) => [player.socketId, null]));
  game.startedAt = null;
  game.endsAt = null;
  game.phase = "countdown";
  game.scores = buildScoreMap(game.players);
  game.strikes = buildStrikeMap(game.players);
  game.eliminated = buildEliminatedMap(game.players);
  game.streaks = buildScoreMap(game.players);
  game.ultimateCharge = buildUltimateChargeMap(game.players);
  game.ultimateReady = buildUltimateReadyMap(game.players);
  game.ultimateUsed = buildUltimateUsedMap(game.players);
  game.titanUntil = buildTitanUntilMap(game.players);
  game.blackoutUntil = buildBlackoutUntilMap(game.players);
  game.overclockUntil = buildOverclockUntilMap(game.players);
  game.fortressUntil = buildFortressUntilMap(game.players);
  game.fortressBlocksRemaining = buildFortressBlocksMap(game.players);
  game.flashBonusRemaining = buildFlashBonusRemainingMap(game.players);
  game.novaBonusRemaining = buildNovaBonusRemainingMap(game.players);
  game.infernoPending = buildInfernoPendingMap(game.players);
  game.titanTimeout = buildUltimateEffectTimeoutMap(game.players);
  game.blackoutTimeout = buildUltimateEffectTimeoutMap(game.players);
  game.powerUpInventory = buildPowerUpInventoryMap(game.players);
  game.powerUpUsedList = buildPowerUpUsedListMap(game.players);
  game.freezeUntil = buildFreezeMap(game.players);
  game.shieldActive = buildShieldMap(game.players);
  game.slowUntil = buildSlowMap(game.players);
  game.doublePointsUntil = buildDoublePointsMap(game.players);
  game.hintText = buildHintTextMap(game.players);
  game.hintUntil = buildHintUntilMap(game.players);
  game.powerUpCooldownUntil = buildPowerUpCooldownMap(game.players);
  game.powerUpUsesCount = buildPowerUpUsesMap(game.players);
  game.emoteCooldownUntil = buildEmoteCooldownMap(game.players);
  game.emoteTimestamps = Object.fromEntries(game.players.map((player) => [player.socketId, []]));
  clearAllQuestionTimers(game);
  clearMatchTimer(game);
  game.rematchRequests = new Set();
}

function emitNewQuestionToPlayer(roomId, socketId) {
  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  if (game.phase !== "countdown" && game.phase !== "playing") {
    return;
  }

  const questionState = game.playerQuestionState[socketId];

  if (!questionState) {
    return;
  }

  if (game.eliminated[socketId]) {
    return;
  }

  const question = ensureQuestionAtIndex(game, questionState.index);
  if (!question) {
    return;
  }

  clearHintState(game, socketId);
  questionState.currentQuestion = question;
  questionState.answered = false;
  questionState.questionSentAt = Date.now();
  questionState.generation += 1;
  game.phase = "playing";
  clearPlayerQuestionTimer(game, socketId);

  const payload = { question: question.prompt, token: questionState.generation };
  console.log(`[server] newQuestion emitted -> room=${roomId} player=${socketId} token=${questionState.generation}`, payload);
  io.to(socketId).emit("newQuestion", payload);
  emitQuestionState(roomId);
}

function startMatchTimer(roomId) {
  const game = activeGames.get(roomId);

  if (!game || game.startedAt) {
    return;
  }

  game.startedAt = Date.now();
  game.endsAt = game.startedAt + MATCH_DURATION_MS;
  for (const player of game.players) {
    io.to(player.socketId).emit("timerUpdate", {
      ...buildTimerPayload(game),
      ...buildPlayerUltimateState(game, player.socketId)
    });
  }

  game.matchTimerInterval = setInterval(() => {
    const activeGame = activeGames.get(roomId);

    if (!activeGame) {
      clearMatchTimer(game);
      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((activeGame.endsAt - Date.now()) / 1000));
    for (const player of activeGame.players) {
      if (!activeGame.eliminated[player.socketId]) {
        increaseUltimateCharge(activeGame, player.socketId, ULTIMATE_TIME_CHARGE_PER_SECOND);
      }

      io.to(player.socketId).emit("timerUpdate", {
        secondsLeft,
        ...buildPlayerUltimateState(activeGame, player.socketId)
      });
    }

    if (secondsLeft <= 0) {
      clearMatchTimer(activeGame);
      finishGame(roomId);
    }
  }, TIMER_UPDATE_INTERVAL_MS);
}

function startCountdown(roomId) {
  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  clearCountdown(game);
  clearAllQuestionTimers(game);
  game.phase = "countdown";

  let stepIndex = 0;

  const emitStep = () => {
    const value = COUNTDOWN_STEPS[stepIndex];

    if (!value) {
      clearCountdown(game);
      startMatchTimer(roomId);
      for (const player of game.players) {
        emitNewQuestionToPlayer(roomId, player.socketId);
      }
      return;
    }

    console.log(`[server] countdown emitted -> room=${roomId}`, { value });
    io.to(roomId).emit("countdown", { value });
    stepIndex += 1;
  };

  emitStep();
  game.countdownInterval = setInterval(() => {
    if (!activeGames.has(roomId)) {
      clearCountdown(game);
      return;
    }

    emitStep();
  }, COUNTDOWN_INTERVAL_MS);
}

async function finishGame(roomId, options = {}) {
  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  if (game.phase === "finished") {
    return;
  }

  const forcedWinnerSocketId =
    typeof options.forceWinnerSocketId === "string" ? options.forceWinnerSocketId : null;
  const reason = typeof options.reason === "string" ? options.reason : null;

  clearCountdown(game);
  clearAllQuestionTimers(game);
  clearMatchEffects(game);
  game.phase = "finished";
  game.rematchRequests = new Set();
  clearMatchTimer(game);

  const playerOne = game.players[0];
  const playerTwo = game.players[1];

  if (!playerOne || !playerTwo) {
    return;
  }

  const playerOneScore = game.scores[playerOne.socketId] ?? 0;
  const playerTwoScore = game.scores[playerTwo.socketId] ?? 0;
  const forcedWinner =
    forcedWinnerSocketId === playerOne.socketId
      ? playerOne
      : forcedWinnerSocketId === playerTwo.socketId
        ? playerTwo
        : null;
  const isDraw = !forcedWinner && playerOneScore === playerTwoScore;
  const winner = forcedWinner
    ? forcedWinner
    : isDraw
      ? null
      : playerOneScore > playerTwoScore
        ? playerOne
        : playerTwo;
  const loser = isDraw ? null : winner?.socketId === playerOne.socketId ? playerTwo : playerOne;
  const playerOneActualScore = isDraw ? 0.5 : winner?.socketId === playerOne.socketId ? 1 : 0;
  const playerTwoActualScore = isDraw ? 0.5 : winner?.socketId === playerTwo.socketId ? 1 : 0;
  const playerOneDelta = calculateEloChange(playerOne.rating, playerTwo.rating, playerOneActualScore);
  const playerTwoDelta = calculateEloChange(playerTwo.rating, playerOne.rating, playerTwoActualScore);
  const nextPlayerOneRating = playerOne.rating + playerOneDelta;
  const nextPlayerTwoRating = playerTwo.rating + playerTwoDelta;
  const message = reason
    ? reason
    : isDraw
      ? `Draw ${playerOneScore}-${playerTwoScore}.`
      : `${winner?.name ?? "Player"} defeats ${loser?.name ?? "Opponent"} ${Math.max(playerOneScore, playerTwoScore)}-${Math.min(playerOneScore, playerTwoScore)}.`;

  try {
    await Promise.all([
      updateRatingsAfterMatch({
        topic: game.topic,
        playerOneId: playerOne.playerId,
        playerTwoId: playerTwo.playerId,
        playerOneRating: nextPlayerOneRating,
        playerTwoRating: nextPlayerTwoRating
      }),
      saveMatch({
        topic: game.topic,
        player1Id: playerOne.playerId,
        player2Id: playerTwo.playerId,
        player1Score: playerOneScore,
        player2Score: playerTwoScore,
        winnerPlayerId: winner?.playerId ?? null,
        player1RatingChange: playerOneDelta,
        player2RatingChange: playerTwoDelta
      })
    ]);
  } catch (error) {
    console.error("[server] failed to persist match result", error);
  }

  game.players = game.players.map((player) => {
    if (player.socketId === playerOne.socketId) {
      return { ...player, rating: nextPlayerOneRating };
    }

    if (player.socketId === playerTwo.socketId) {
      return { ...player, rating: nextPlayerTwoRating };
    }

    return player;
  });

  console.log(`[server] gameOver emitted -> room=${roomId}`, {
    winnerSocketId: winner?.socketId ?? null,
    message,
    scores: { playerOneScore, playerTwoScore }
  });

  for (const player of game.players) {
    const opponent = game.players.find((entry) => entry.socketId !== player.socketId);

    if (!opponent) {
      continue;
    }

    io.to(player.socketId).emit("gameOver", {
      winnerId: winner?.playerId ?? null,
      winnerName: winner?.name ?? null,
      result: isDraw ? "draw" : player.socketId === winner?.socketId ? "win" : "loss",
      message,
      opponentName: opponent.name,
      scores: {
        you: game.scores[player.socketId] ?? 0,
        opponent: game.scores[opponent.socketId] ?? 0
      },
      ratingChange: {
        you: player.socketId === playerOne.socketId ? playerOneDelta : playerTwoDelta,
        opponent: player.socketId === playerOne.socketId ? playerTwoDelta : playerOneDelta
      },
      newRatings: {
        you: player.socketId === playerOne.socketId ? nextPlayerOneRating : nextPlayerTwoRating,
        opponent: player.socketId === playerOne.socketId ? nextPlayerTwoRating : nextPlayerOneRating
      }
    });
  }

  if (game.customRoomCode) {
    const customRoom = customRooms.get(game.customRoomCode);

    if (customRoom) {
      customRoom.status = "finished";
      emitRoomUpdated(customRoom);
    }
  }
}

function handleCorrectAnswer(roomId, playerSocketId, pointsAwarded = 1) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  const questionState = game.playerQuestionState[playerSocketId];

  if (!questionState || questionState.answered || game.eliminated[playerSocketId]) {
    return;
  }

  questionState.answered = true;
  clearPlayerQuestionTimer(game, playerSocketId);
  const questionIndex = questionState.index;
  const existingWinner = game.questionWinnersByIndex[questionIndex] ?? null;
  const isFirstCorrect = !existingWinner;
  const fastAnswer =
    isFirstCorrect &&
    typeof questionState.questionSentAt === "number" &&
    Date.now() - questionState.questionSentAt <= FAST_ANSWER_MS;
  let awardedPoints = 0;

  if (isFirstCorrect) {
    game.questionWinnersByIndex[questionIndex] = playerSocketId;
    handleMissedQuestion(roomId, playerSocketId);
    awardedPoints = pointsAwarded;

    if (game.infernoPending[playerSocketId]) {
      awardedPoints = Math.max(awardedPoints, 2);
      game.infernoPending[playerSocketId] = false;
    }

    if (isActiveUntil(game.overclockUntil[playerSocketId])) {
      awardedPoints += 1;
    }

    game.scores[playerSocketId] = (game.scores[playerSocketId] ?? 0) + awardedPoints;
    game.streaks[playerSocketId] = (game.streaks[playerSocketId] ?? 0) + 1;
    const streakBonus = game.streaks[playerSocketId] >= 3 ? ULTIMATE_STREAK_BONUS_CHARGE : 0;
    increaseUltimateCharge(game, playerSocketId, ULTIMATE_CORRECT_CHARGE + streakBonus);
  }

  const playerOneSocketId = game.players[0].socketId;
  const playerTwoSocketId = game.players[1].socketId;
  const scorerSocketId = playerSocketId;

  if (isFirstCorrect) {
    console.log(`[server] pointScored emitted -> room=${roomId}`, {
      scorer: playerSocketId,
      questionIndex,
      scores: game.scores,
      streaks: game.streaks,
      fastAnswer
    });

    io.to(playerOneSocketId).emit("pointScored", {
      scores: {
        you: game.scores[playerOneSocketId],
        opponent: game.scores[playerTwoSocketId]
      },
      streak: game.streaks[playerOneSocketId],
      opponentStreak: game.streaks[playerTwoSocketId],
      fastAnswer: scorerSocketId === playerOneSocketId ? fastAnswer : false,
      opponentFastAnswer: scorerSocketId === playerTwoSocketId ? fastAnswer : false,
      pointsAwarded: scorerSocketId === playerOneSocketId ? awardedPoints : 0,
      strikes: game.strikes[playerOneSocketId] ?? 0,
      opponentStrikes: game.strikes[playerTwoSocketId] ?? 0,
      youEliminated: !!game.eliminated[playerOneSocketId],
      opponentEliminated: !!game.eliminated[playerTwoSocketId],
      youAnswered: false,
      opponentAnswered: false,
      ...buildPlayerPowerState(game, playerOneSocketId)
    });

    io.to(playerTwoSocketId).emit("pointScored", {
      scores: {
        you: game.scores[playerTwoSocketId],
        opponent: game.scores[playerOneSocketId]
      },
      streak: game.streaks[playerTwoSocketId],
      opponentStreak: game.streaks[playerOneSocketId],
      fastAnswer: scorerSocketId === playerTwoSocketId ? fastAnswer : false,
      opponentFastAnswer: scorerSocketId === playerOneSocketId ? fastAnswer : false,
      pointsAwarded: scorerSocketId === playerTwoSocketId ? awardedPoints : 0,
      strikes: game.strikes[playerTwoSocketId] ?? 0,
      opponentStrikes: game.strikes[playerOneSocketId] ?? 0,
      youEliminated: !!game.eliminated[playerTwoSocketId],
      opponentEliminated: !!game.eliminated[playerOneSocketId],
      youAnswered: false,
      opponentAnswered: false,
      ...buildPlayerPowerState(game, playerTwoSocketId)
    });
  }

  questionState.index += 1;
  emitNewQuestionToPlayer(roomId, playerSocketId);
  emitQuestionState(roomId);
  emitLiveLeaderboard(roomId);
}

function handleIncorrectAnswer(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (game.eliminated[playerSocketId]) {
    return;
  }

  game.strikes[playerSocketId] = (game.strikes[playerSocketId] ?? 0) + 1;
  game.streaks[playerSocketId] = 0;

  const opponent = getOpponent(game, playerSocketId);
  const isEliminated = (game.strikes[playerSocketId] ?? 0) >= 3;

  if (isEliminated) {
    game.eliminated[playerSocketId] = true;
    const playerState = game.playerQuestionState[playerSocketId];

    if (playerState) {
      playerState.answered = true;
    }
    clearPlayerQuestionTimer(game, playerSocketId);
  }

  io.to(playerSocketId).emit("incorrectAnswer", {
    strikes: game.strikes[playerSocketId] ?? 0,
    eliminated: isEliminated
  });

  if (opponent) {
    io.to(opponent.socketId).emit("opponentStrike", {
      opponentStrikes: game.strikes[playerSocketId] ?? 0,
      opponentEliminated: isEliminated
    });
  }

  emitQuestionState(roomId);
  emitLiveLeaderboard(roomId);

  if (isEliminated && opponent) {
    void finishGame(roomId, {
      forceWinnerSocketId: opponent.socketId,
      reason: `${opponent.name} wins by elimination.`
    });
  }
}

function handleMissedQuestion(roomId, scorerSocketId) {
  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  const scorerState = game.playerQuestionState[scorerSocketId];
  const scorerIndex = scorerState?.index;

  for (const player of game.players) {
    if (player.socketId === scorerSocketId) {
      continue;
    }

    const playerState = game.playerQuestionState[player.socketId];

    if (typeof scorerIndex !== "number" || playerState?.index !== scorerIndex) {
      continue;
    }

    // Reset the opponent's streak for failing to answer first.
    game.streaks[player.socketId] = 0;

    // Immediately close this question for the opponent so they cannot submit
    // a stale answer after the question has been claimed. We mark it answered,
    // advance their index, and push the next question right now — all in the
    // same synchronous tick so no late submit can slip through.
    playerState.answered = true;
    playerState.index += 1;
    emitNewQuestionToPlayer(roomId, player.socketId);
  }
}

function removeFromQueues(socketId) {
  for (const [topic, queue] of topicQueues.entries()) {
    topicQueues.set(
      topic,
      queue.filter((entry) => entry.socketId !== socketId)
    );
  }
}

function removeFromCustomRoom(socket, options = {}) {
  const roomCode = socket.data.customRoomCode;

  if (!roomCode) {
    return;
  }

  const room = customRooms.get(roomCode);
  socket.data.customRoomCode = undefined;

  if (!room) {
    return;
  }

  room.players = room.players.filter((player) => player.socketId !== socket.id);

  if (room.players.length === 0) {
    customRooms.delete(roomCode);
    return;
  }

  if (!room.players.some((player) => player.socketId === room.hostSocketId)) {
    room.hostSocketId = room.players[0].socketId;
  }

  if (room.status !== "in-game") {
    room.status = room.players.length === 2 ? "ready" : "waiting";
  }

  emitRoomUpdated(room);

  if (options.notifyRemaining && room.players[0]) {
    io.to(room.players[0].socketId).emit("roomError", {
      message: "The other player left the room."
    });
  }
}

function removeFromGame(socket) {
  const roomId = socket.data.roomId;

  if (!roomId) {
    return;
  }

  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  clearCountdown(game);
  clearAllQuestionTimers(game);
  clearMatchEffects(game);

  const remainingPlayer = game.players.find((player) => player.socketId !== socket.id);
  const customRoomCode = game.customRoomCode;

  if (remainingPlayer) {
    console.log(`[server] opponentLeft emitted -> room=${roomId}`, {
      remainingPlayerId: remainingPlayer.socketId
    });
    io.to(remainingPlayer.socketId).emit("opponentLeft", {
      message: "Opponent left the game"
    });

    const remainingSocket = io.sockets.sockets.get(remainingPlayer.socketId);

    if (remainingSocket) {
      remainingSocket.leave(roomId);
      remainingSocket.data.roomId = undefined;
      if (customRoomCode) {
        remainingSocket.data.customRoomCode = customRoomCode;
      }
    }
  }

  activeGames.delete(roomId);
  socket.leave(roomId);
  socket.data.roomId = undefined;

  if (!customRoomCode) {
    return;
  }

  const customRoom = customRooms.get(customRoomCode);

  if (!customRoom) {
    return;
  }

  customRoom.players = customRoom.players.filter((player) => player.socketId === remainingPlayer?.socketId);

  if (!remainingPlayer) {
    customRooms.delete(customRoomCode);
    return;
  }

  customRoom.hostSocketId = remainingPlayer.socketId;
  customRoom.status = "waiting";
  emitRoomUpdated(customRoom);
}

async function resolveSocketPlayer(socket, topic, accessToken) {
  const authUser = await verifyAccessToken(accessToken);
  const player = await findOrCreatePlayerFromAuthUser(authUser);
  const rating = await getOrCreateRating(player.id, topic);

  return {
    socketId: socket.id,
    playerId: player.id,
    name: player.display_name ?? player.username,
    rating: rating.rating,
    avatar: normalizeAvatarId(player.avatar_id)
  };
}

function createActiveGame(players, topic, difficulty, customRoomCode = null) {
  const roomId = customRoomCode ? `custom-${customRoomCode}` : `room-${roomCounter++}`;
  const game = {
    roomId,
    topic,
    difficulty,
    customRoomCode,
    players,
    questionBank: [],
    questionWinnersByIndex: {},
    playerQuestionState: buildPlayerQuestionState(players),
    questionTimeouts: Object.fromEntries(players.map((player) => [player.socketId, null])),
    startedAt: null,
    endsAt: null,
    phase: "waiting",
    scores: buildScoreMap(players),
    strikes: buildStrikeMap(players),
    eliminated: buildEliminatedMap(players),
    streaks: buildScoreMap(players),
    ultimateCharge: buildUltimateChargeMap(players),
    ultimateReady: buildUltimateReadyMap(players),
    ultimateUsed: buildUltimateUsedMap(players),
    titanUntil: buildTitanUntilMap(players),
    blackoutUntil: buildBlackoutUntilMap(players),
    overclockUntil: buildOverclockUntilMap(players),
    fortressUntil: buildFortressUntilMap(players),
    fortressBlocksRemaining: buildFortressBlocksMap(players),
    flashBonusRemaining: buildFlashBonusRemainingMap(players),
    novaBonusRemaining: buildNovaBonusRemainingMap(players),
    infernoPending: buildInfernoPendingMap(players),
    titanTimeout: buildUltimateEffectTimeoutMap(players),
    blackoutTimeout: buildUltimateEffectTimeoutMap(players),
    powerUpInventory: buildPowerUpInventoryMap(players),
    powerUpUsedList: buildPowerUpUsedListMap(players),
    freezeUntil: buildFreezeMap(players),
    shieldActive: buildShieldMap(players),
    slowUntil: buildSlowMap(players),
    doublePointsUntil: buildDoublePointsMap(players),
    hintText: buildHintTextMap(players),
    hintUntil: buildHintUntilMap(players),
    powerUpCooldownUntil: buildPowerUpCooldownMap(players),
    powerUpUsesCount: buildPowerUpUsesMap(players),
    emoteCooldownUntil: buildEmoteCooldownMap(players),
    rematchRequests: new Set(),
    countdownInterval: null,
    matchTimerInterval: null
  };

  activeGames.set(roomId, game);

  for (const playerEntry of players) {
    const playerSocket = io.sockets.sockets.get(playerEntry.socketId);

    if (!playerSocket) {
      continue;
    }

    playerSocket.join(roomId);
    playerSocket.data.roomId = roomId;
    if (customRoomCode) {
      playerSocket.data.customRoomCode = customRoomCode;
    }
    playerSocket.data.topic = topic;
    playerSocket.data.difficulty = difficulty;
  }

  console.log(`[server] matchFound emitted -> room=${roomId}`, {
    players: players.map((entry) => entry.socketId),
    topic,
    customRoomCode
  });

  io.to(players[0].socketId).emit("matchFound", {
    roomId,
    yourName: players[0].name,
    opponentName: players[1].name,
    difficulty,
    yourAvatar: players[0].avatar,
    opponentAvatar: players[1].avatar,
    ratings: {
      you: players[0].rating,
      opponent: players[1].rating
    },
    ...buildPlayerPowerState(game, players[0].socketId)
  });

  io.to(players[1].socketId).emit("matchFound", {
    roomId,
    yourName: players[1].name,
    opponentName: players[0].name,
    difficulty,
    yourAvatar: players[1].avatar,
    opponentAvatar: players[0].avatar,
    ratings: {
      you: players[1].rating,
      opponent: players[0].rating
    },
    ...buildPlayerPowerState(game, players[1].socketId)
  });

  emitLiveLeaderboard(roomId);

  startCountdown(roomId);
}

function leaveCurrentState(socket) {
  removeFromQueues(socket.id);

  if (socket.data.roomId) {
    removeFromGame(socket);
  }

  if (socket.data.customRoomCode) {
    removeFromCustomRoom(socket);
  }
}

async function queuePlayer(socket, topic, difficulty, accessToken) {
  leaveCurrentState(socket);
  socket.data.topic = topic;
  socket.data.difficulty = difficulty;
  const queuedPlayer = await resolveSocketPlayer(socket, topic, accessToken);
  const queueKey = `${topic}:${difficulty}`;
  const queue = topicQueues.get(queueKey) ?? [];

  queue.push(queuedPlayer);
  topicQueues.set(queueKey, queue);

  if (queue.length < 2) {
    return;
  }

  const players = queue.splice(0, 2);
  topicQueues.set(queueKey, queue);
  createActiveGame(players, topic, difficulty, null);
}

async function createCustomRoom(socket, topic, difficulty, accessToken) {
  leaveCurrentState(socket);

  const roomCode = generateRoomCode();

  if (!roomCode) {
    socket.emit("roomError", {
      message: "Could not create a room right now. Please try again."
    });
    return;
  }

  const hostPlayer = await resolveSocketPlayer(socket, topic, accessToken);
  const room = {
    roomCode,
    hostSocketId: socket.id,
    topic,
    difficulty,
    status: "waiting",
    players: [hostPlayer]
  };

  customRooms.set(roomCode, room);
  socket.data.customRoomCode = roomCode;
  socket.data.topic = topic;
  socket.data.difficulty = difficulty;

  const payload = buildRoomLobbyPayload(room, socket.id);
  socket.emit("roomCreated", payload);
  emitRoomUpdated(room);
}

async function joinCustomRoom(socket, roomCodeInput, accessToken) {
  const roomCode = normalizeRoomCode(roomCodeInput);

  if (roomCode.length !== ROOM_CODE_LENGTH) {
    socket.emit("roomError", { message: "Enter a valid room code." });
    return;
  }

  const room = customRooms.get(roomCode);

  if (!room) {
    socket.emit("roomError", { message: "Room not found." });
    return;
  }

  if (room.status === "in-game") {
    socket.emit("roomError", { message: "Room is currently in-game." });
    return;
  }

  if (!room.players.some((player) => player.socketId === socket.id) && room.players.length >= 2) {
    socket.emit("roomError", { message: "Room is full." });
    return;
  }

  leaveCurrentState(socket);

  let joiningPlayer = room.players.find((player) => player.socketId === socket.id);

  if (!joiningPlayer) {
    joiningPlayer = await resolveSocketPlayer(socket, room.topic, accessToken);
    room.players.push(joiningPlayer);
  }

  room.status = room.players.length === 2 ? "ready" : "waiting";
  socket.data.customRoomCode = roomCode;
  socket.data.topic = room.topic;
  socket.data.difficulty = room.difficulty;

  socket.emit("roomJoined", buildRoomLobbyPayload(room, socket.id));
  emitRoomUpdated(room);
}

function startCustomRoomMatch(socket) {
  const roomCode = socket.data.customRoomCode;

  if (!roomCode) {
    socket.emit("roomError", { message: "You are not in a custom room." });
    return;
  }

  const room = customRooms.get(roomCode);

  if (!room) {
    socket.emit("roomError", { message: "Room no longer exists." });
    socket.data.customRoomCode = undefined;
    return;
  }

  if (room.hostSocketId !== socket.id) {
    socket.emit("roomError", { message: "Only the host can start the match." });
    return;
  }

  if (room.players.length < 2) {
    socket.emit("roomError", { message: "Waiting for a second player." });
    return;
  }

  const bothConnected = room.players.every((player) => io.sockets.sockets.has(player.socketId));

  if (!bothConnected) {
    room.players = room.players.filter((player) => io.sockets.sockets.has(player.socketId));
    room.status = room.players.length === 2 ? "ready" : "waiting";
    emitRoomUpdated(room);
    socket.emit("roomError", { message: "Waiting for a second player." });
    return;
  }

  room.status = "in-game";
  emitRoomUpdated(room);
  createActiveGame(room.players.slice(0, 2), room.topic, room.difficulty, room.roomCode);
}

function useFreezePowerUp(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (!hasPowerUp(game, playerSocketId, "freeze")) {
    return;
  }

  const opponent = getOpponent(game, playerSocketId);

  if (!opponent) {
    return;
  }

  if (isActiveUntil(game.freezeUntil[opponent.socketId]) || isActiveUntil(game.slowUntil[opponent.socketId])) {
    return;
  }

  if (!consumePowerUp(game, playerSocketId, "freeze")) {
    return;
  }

  const blockedByProtection = consumeIncomingProtection(game, opponent.socketId);
  if (blockedByProtection) {
    const blockedType = blockedByProtection === "guardian_shield" ? "guardian_shield" : "shield";

    io.to(playerSocketId).emit("powerUpUsed", {
      type: "freeze",
      by: "you",
      target: "opponent",
      blockedBy: blockedType,
      ...buildPlayerPowerState(game, playerSocketId)
    });

    io.to(opponent.socketId).emit("powerUpUsed", {
      type: "freeze",
      by: "opponent",
      target: "you",
      blockedBy: blockedType,
      ...buildPlayerPowerState(game, opponent.socketId)
    });

    io.to(playerSocketId).emit("shieldBlocked", {
      by: "opponent",
      target: "opponent",
      blockedType: "freeze",
      ...buildPlayerPowerState(game, playerSocketId)
    });

    io.to(opponent.socketId).emit("shieldBlocked", {
      by: "you",
      target: "you",
      blockedType: "freeze",
      ...buildPlayerPowerState(game, opponent.socketId)
    });

    return;
  }

  const durationMs = getDurationForPowerUp("freeze");
  game.freezeUntil[opponent.socketId] = Date.now() + durationMs;

  console.log(`[server] powerUpUsed emitted -> room=${roomId}`, {
    type: "freeze",
    by: playerSocketId,
    target: opponent.socketId
  });

  io.to(playerSocketId).emit("powerUpUsed", {
    type: "freeze",
    by: "you",
    target: "opponent",
    durationMs,
    ...buildPlayerPowerState(game, playerSocketId)
  });

  io.to(opponent.socketId).emit("powerUpUsed", {
    type: "freeze",
    by: "opponent",
    target: "you",
    durationMs,
    ...buildPlayerPowerState(game, opponent.socketId)
  });
}

function useShieldPowerUp(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (!hasPowerUp(game, playerSocketId, "shield") || game.shieldActive[playerSocketId]) {
    return;
  }

  const opponent = getOpponent(game, playerSocketId);
  if (!consumePowerUp(game, playerSocketId, "shield")) {
    return;
  }

  game.shieldActive[playerSocketId] = true;

  io.to(playerSocketId).emit("shieldActivated", {
    by: "you",
    ...buildPlayerPowerState(game, playerSocketId)
  });

  if (opponent) {
    io.to(opponent.socketId).emit("shieldActivated", {
      by: "opponent",
      ...buildPlayerPowerState(game, opponent.socketId)
    });
  }
}

function useDoublePointsPowerUp(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (!hasPowerUp(game, playerSocketId, "double_points")) {
    return;
  }

  if (!consumePowerUp(game, playerSocketId, "double_points")) {
    return;
  }

  game.doublePointsUntil[playerSocketId] = Date.now() + 60000;

  const opponent = getOpponent(game, playerSocketId);
  io.to(playerSocketId).emit("powerUpUsed", {
    type: "double_points",
    by: "you",
    target: "you",
    durationMs: getDurationForPowerUp("double_points"),
    ...buildPlayerPowerState(game, playerSocketId)
  });

  if (opponent) {
    io.to(opponent.socketId).emit("powerUpUsed", {
      type: "double_points",
      by: "opponent",
      target: "opponent",
      durationMs: getDurationForPowerUp("double_points"),
      ...buildPlayerPowerState(game, opponent.socketId)
    });
  }
}

function useHintPowerUp(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (!hasPowerUp(game, playerSocketId, "hint")) {
    return;
  }

  const questionState = game.playerQuestionState[playerSocketId];
  const currentQuestion = questionState?.currentQuestion;
  if (!currentQuestion) {
    return;
  }

  if (!consumePowerUp(game, playerSocketId, "hint")) {
    return;
  }

  const durationMs = getDurationForPowerUp("hint");
  game.hintText[playerSocketId] = buildQuestionHint(currentQuestion);
  game.hintUntil[playerSocketId] = Date.now() + durationMs;

  io.to(playerSocketId).emit("powerUpUsed", {
    type: "hint",
    by: "you",
    target: "you",
    durationMs,
    hintText: game.hintText[playerSocketId],
    ...buildPlayerPowerState(game, playerSocketId)
  });
}

function useCleansePowerUp(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (!hasPowerUp(game, playerSocketId, "cleanse")) {
    return;
  }

  const hadFreeze = isActiveUntil(game.freezeUntil[playerSocketId]);
  const hadSlow = isActiveUntil(game.slowUntil[playerSocketId]);
  const hadBlackout = isActiveUntil(game.blackoutUntil[playerSocketId]);

  if (!hadFreeze && !hadSlow && !hadBlackout) {
    return;
  }

  if (!consumePowerUp(game, playerSocketId, "cleanse")) {
    return;
  }

  game.freezeUntil[playerSocketId] = 0;
  game.slowUntil[playerSocketId] = 0;
  game.blackoutUntil[playerSocketId] = 0;

  const opponent = getOpponent(game, playerSocketId);

  io.to(playerSocketId).emit("powerUpUsed", {
    type: "cleanse",
    by: "you",
    target: "you",
    removedEffects: [hadFreeze ? "freeze" : null, hadSlow ? "slow" : null, hadBlackout ? "blackout" : null].filter(Boolean),
    ...buildPlayerPowerState(game, playerSocketId)
  });

  if (opponent) {
    io.to(opponent.socketId).emit("powerUpUsed", {
      type: "cleanse",
      by: "opponent",
      target: "opponent",
      ...buildPlayerPowerState(game, opponent.socketId)
    });
  }
}

function emitUltimateApplied(game, roomId, playerSocketId, opponentSocketId, payloadForYou, payloadForOpponent) {
  io.to(playerSocketId).emit("ultimateApplied", {
    ...payloadForYou,
    ...buildPlayerPowerState(game, playerSocketId)
  });

  io.to(opponentSocketId).emit("ultimateApplied", {
    ...payloadForOpponent,
    ...buildPlayerPowerState(game, opponentSocketId)
  });

  emitLiveLeaderboard(roomId);
}

function emitUltimateEnded(game, playerSocketId, opponentSocketId, payloadForYou, payloadForOpponent) {
  io.to(playerSocketId).emit("ultimateEnded", {
    ...payloadForYou,
    ...buildPlayerPowerState(game, playerSocketId)
  });

  io.to(opponentSocketId).emit("ultimateEnded", {
    ...payloadForOpponent,
    ...buildPlayerPowerState(game, opponentSocketId)
  });
}

function emitRematchStatus(game) {
  const requestedPlayers = game.rematchRequests.size;
  const requiredPlayers = game.players.length;

  for (const player of game.players) {
    const opponent = getOpponent(game, player.socketId);
    io.to(player.socketId).emit("rematchStatus", {
      youRequested: game.rematchRequests.has(player.socketId),
      opponentRequested: opponent ? game.rematchRequests.has(opponent.socketId) : false,
      requiredPlayers,
      requestedPlayers
    });
  }
}

function useAvatarUltimate(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (game.eliminated[playerSocketId]) {
    return;
  }

  if (game.ultimateUsed[playerSocketId] || !game.ultimateReady[playerSocketId]) {
    return;
  }

  const opponent = getOpponent(game, playerSocketId);
  if (!opponent || game.eliminated[opponent.socketId]) {
    return;
  }

  const ultimateType = getUltimateTypeForPlayer(game, playerSocketId);
  const now = Date.now();
  const ultimateMeta = getUltimateMeta(ultimateType);

  game.ultimateUsed[playerSocketId] = true;
  game.ultimateReady[playerSocketId] = false;
  game.ultimateCharge[playerSocketId] = ULTIMATE_MAX_CHARGE;

  if (ultimateType === "rapid_fire") {
    const durationMs = getUltimateDurationMs(ultimateType);
    game.overclockUntil[playerSocketId] = now + durationMs;
    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      {
        by: "you",
        target: "you",
        type: ultimateType,
        effect: "rapid_fire_active",
        durationMs
      },
      {
        by: "opponent",
        target: "opponent",
        type: ultimateType,
        effect: "rapid_fire_active",
        durationMs
      }
    );
    return;
  }

  if (ultimateType === "jam") {
    const durationMs = getUltimateDurationMs(ultimateType);

    const blockedByProtection = consumeIncomingProtection(game, opponent.socketId);
    if (blockedByProtection) {
      emitUltimateApplied(
        game,
        roomId,
        playerSocketId,
        opponent.socketId,
        { by: "you", target: "opponent", type: ultimateType, effect: `blocked_by_${blockedByProtection}` },
        { by: "opponent", target: "you", type: ultimateType, effect: `blocked_by_${blockedByProtection}` }
      );
      return;
    }

    clearTimeout(game.blackoutTimeout[opponent.socketId]);
    game.blackoutUntil[opponent.socketId] = now + durationMs;
    game.blackoutTimeout[opponent.socketId] = setTimeout(() => {
      const activeGame = activeGames.get(roomId);
      if (!activeGame) {
        return;
      }
      activeGame.blackoutUntil[opponent.socketId] = 0;
      activeGame.blackoutTimeout[opponent.socketId] = null;
      emitUltimateEnded(
        activeGame,
        playerSocketId,
        opponent.socketId,
        { by: "you", target: "opponent", type: "jam", effect: "jam_ended" },
        { by: "opponent", target: "you", type: "jam", effect: "jam_ended" }
      );
    }, durationMs);

    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      { by: "you", target: "opponent", type: ultimateType, effect: "jam_active", durationMs },
      { by: "opponent", target: "you", type: ultimateType, effect: "jam_active", durationMs }
    );
    return;
  }

  if (ultimateType === "double") {
    game.infernoPending[playerSocketId] = true;
    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      { by: "you", target: "you", type: ultimateType, effect: "next_correct_plus_two" },
      { by: "opponent", target: "opponent", type: ultimateType, effect: "next_correct_plus_two" }
    );
    return;
  }

  if (ultimateType === "shield") {
    const durationMs = getUltimateDurationMs(ultimateType);
    const blocks = ultimateMeta.blocks ?? 1;
    game.fortressUntil[playerSocketId] = now + durationMs;
    game.fortressBlocksRemaining[playerSocketId] = blocks;
    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      { by: "you", target: "you", type: ultimateType, effect: "guardian_shield_active", durationMs },
      { by: "opponent", target: "opponent", type: ultimateType, effect: "guardian_shield_active", durationMs }
    );
    return;
  }

  emitUltimateApplied(
    game,
    roomId,
    playerSocketId,
    opponent.socketId,
    { by: "you", target: "you", type: ultimateType, effect: "ultimate_applied" },
    { by: "opponent", target: "opponent", type: ultimateType, effect: "ultimate_applied" }
  );
}

function handleSendEmote(roomId, playerSocketId, emoteId, clientMessageId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (!game.players.some((player) => player.socketId === playerSocketId)) {
    return;
  }

  if (!VALID_EMOTE_IDS.has(emoteId)) {
    return;
  }

  if (!clientMessageId || typeof clientMessageId !== "string" || clientMessageId.length > 128) {
    return;
  }

  const now = Date.now();

  if ((game.emoteCooldownUntil[playerSocketId] ?? 0) > now) {
    return;
  }

  // Burst guard: max EMOTE_BURST_LIMIT emotes per EMOTE_BURST_WINDOW_MS
  const timestamps = (game.emoteTimestamps[playerSocketId] ?? []).filter(
    (t) => now - t < EMOTE_BURST_WINDOW_MS
  );
  if (timestamps.length >= EMOTE_BURST_LIMIT) {
    return;
  }
  timestamps.push(now);
  game.emoteTimestamps[playerSocketId] = timestamps;

  game.emoteCooldownUntil[playerSocketId] = now + EMOTE_COOLDOWN_MS;
  console.log(`[server] emotePlayed emitted -> room=${roomId}`, {
    emoteId,
    clientMessageId,
    from: playerSocketId,
    to: roomId
  });

  io.to(roomId).emit("emotePlayed", {
    roomId,
    emoteId,
    senderSocketId: playerSocketId,
    clientMessageId,
    sentAt: now
  });
}

io.on("connection", (socket) => {
  console.log(`[server] client connected -> id=${socket.id}`);

  socket.on("joinQueue", async (payload) => {
    const topic = typeof payload === "string" ? payload : payload?.topic;
    const difficulty = typeof payload === "string" ? undefined : payload?.difficulty;
    const accessToken = typeof payload === "string" ? undefined : payload?.accessToken;

    if (!topic || !isValidTopic(topic) || !difficulty || !isValidDifficulty(difficulty) || !accessToken) {
      socket.emit("authRequired", {
        message: "Sign in to play."
      });
      return;
    }

    console.log(
      `[server] joinQueue received -> id=${socket.id} topic=${topic} difficulty=${difficulty}`
    );

    try {
      await queuePlayer(socket, topic, difficulty, accessToken);
    } catch (error) {
      console.error("[server] failed to join queue", error);
      socket.emit("authRequired", {
        message: "Unable to verify your session right now."
      });
    }
  });

  socket.on("createRoom", async (payload) => {
    const topic = payload?.topic;
    const difficulty = payload?.difficulty;
    const accessToken = payload?.accessToken;

    if (!topic || !isValidTopic(topic) || !difficulty || !isValidDifficulty(difficulty) || !accessToken) {
      socket.emit("roomError", { message: "Invalid room settings." });
      return;
    }

    try {
      await createCustomRoom(socket, topic, difficulty, accessToken);
    } catch (error) {
      console.error("[server] failed to create room", error);
      socket.emit("roomError", { message: "Unable to create room right now." });
    }
  });

  socket.on("joinRoom", async (payload) => {
    const roomCode = payload?.roomCode;
    const accessToken = payload?.accessToken;

    if (!roomCode || !accessToken) {
      socket.emit("roomError", { message: "Enter a valid room code." });
      return;
    }

    try {
      await joinCustomRoom(socket, roomCode, accessToken);
    } catch (error) {
      console.error("[server] failed to join room", error);
      socket.emit("roomError", { message: "Unable to join room right now." });
    }
  });

  socket.on("startRoomMatch", () => {
    startCustomRoomMatch(socket);
  });

  socket.on("leaveRoom", () => {
    if (socket.data.roomId) {
      removeFromGame(socket);
      return;
    }

    removeFromCustomRoom(socket, { notifyRemaining: true });
  });

  socket.on("submitAnswer", (payload) => {
    // Accept both the legacy bare-string format and the current { answer, token } object.
    const answer = typeof payload === "string" ? payload : payload?.answer;
    const clientToken = typeof payload === "object" && payload !== null ? payload.token : null;

    console.log(`[server] submitAnswer received -> id=${socket.id} answer=${answer} token=${clientToken}`);

    const roomId = socket.data.roomId;
    const game = roomId ? activeGames.get(roomId) : null;

    if (!game) {
      return;
    }

    if (game.eliminated[socket.id]) {
      return;
    }

    if ((game.freezeUntil[socket.id] ?? 0) > Date.now()) {
      return;
    }

    if ((game.blackoutUntil[socket.id] ?? 0) > Date.now()) {
      return;
    }

    if ((game.slowUntil[socket.id] ?? 0) > Date.now()) {
      return;
    }

    const questionState = game.playerQuestionState[socket.id];
    const currentQuestion = questionState?.currentQuestion;

    if (!questionState || !currentQuestion) {
      return;
    }

    if (questionState.answered) {
      return;
    }

    // Token check: if the client sent a token, it must match the server's current
    // generation for this player. A mismatch means this is a stale submission for
    // an already-resolved question — drop it silently with no strike penalty.
    if (clientToken !== null && clientToken !== undefined && clientToken !== questionState.generation) {
      console.log(`[server] stale submitAnswer rejected -> id=${socket.id} clientToken=${clientToken} serverGeneration=${questionState.generation}`);
      return;
    }

    const hadDoublePoints = isActiveUntil(game.doublePointsUntil[socket.id]);

    if (normalizeAnswer(answer) === normalizeAnswer(currentQuestion.answer)) {
      if (hadDoublePoints) {
        game.doublePointsUntil[socket.id] = 0;
      }
      handleCorrectAnswer(roomId, socket.id, hadDoublePoints ? 2 : 1);
      return;
    }

    handleIncorrectAnswer(roomId, socket.id);
  });

  socket.on("requestRematch", () => {
    const roomId = socket.data.roomId;
    const game = roomId ? activeGames.get(roomId) : null;

    if (!game || game.phase !== "finished") {
      return;
    }

    if (!game.players.some((player) => player.socketId === socket.id)) {
      return;
    }

    game.rematchRequests.add(socket.id);
    console.log(`[server] requestRematch received -> id=${socket.id} room=${roomId}`);
    emitRematchStatus(game);

    if (game.rematchRequests.size < game.players.length) {
      return;
    }

    resetGameState(game);
    emitLiveLeaderboard(roomId);
    if (game.customRoomCode) {
      const customRoom = customRooms.get(game.customRoomCode);

      if (customRoom) {
        customRoom.status = "in-game";
        emitRoomUpdated(customRoom);
      }
    }
    console.log(`[server] rematch starting -> room=${roomId}`);
    startCountdown(roomId);
  });

  socket.on("usePowerUp", (_payload) => {
    // Powerups are disabled — ultimates are the only active ability system.
    // Restore the body below (and set POWERUPS_ENABLED=true on the client)
    // to re-enable the full powerup system in the future.
    return;
  });

  socket.on("activateUltimate", () => {
    const roomId = socket.data.roomId;

    if (!roomId) {
      return;
    }

    useAvatarUltimate(roomId, socket.id);
  });

  socket.on("sendEmote", (payload) => {
    const roomId = socket.data.roomId;
    const emoteId = payload?.emoteId;
    const clientMessageId = payload?.clientMessageId;

    if (!roomId || !emoteId || !clientMessageId) {
      return;
    }

    handleSendEmote(roomId, socket.id, emoteId, clientMessageId);
  });

  /**
   * playerTyping — client notifies server they are typing an answer.
   * Server forwards as opponentTyping to the other player.
   * No game state changes; purely informational for the presence UI.
   * The client throttles this to at most once per 3 s, so the server
   * has minimal fan-out cost.
   */
  socket.on("playerTyping", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const game = activeGames.get(roomId);
    if (!game || game.phase !== "playing") return;

    const opponent = getOpponent(game, socket.id);
    if (!opponent) return;

    io.to(opponent.socketId).emit("opponentTyping");
  });

  socket.on("disconnect", (reason) => {
    console.log(`[server] client disconnected -> id=${socket.id} reason=${reason}`);
    removeFromQueues(socket.id);
    if (socket.data.roomId) {
      removeFromGame(socket);
    } else {
      removeFromCustomRoom(socket, { notifyRemaining: true });
    }
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] Socket.io game server running on http://${HOST}:${PORT}`);
  console.log(`[server] leaderboard endpoint available at /leaderboard`);
  console.log(`[server] default rating = ${DEFAULT_RATING}`);
});
