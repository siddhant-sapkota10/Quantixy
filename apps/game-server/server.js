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
  getMatchDurationSeconds,
  isCorrectAnswer,
  isValidDifficulty,
  isValidTopic,
  normalizeAnswer
} = require("../../packages/shared/question-engine");
const {
  DEFAULT_RATING,
  findOrCreatePlayerFromAuthUser,
  getOrCreateRating,
  getLeaderboard,
  getProfileSummary,
  getPlayerCosmetics,
  saveMatch,
  updateRatingsAfterMatch,
  normalizeStreakEffectId,
  normalizeEmotePackId
} = require("./lib/persistence");
const { calculateEloDelta, deriveMatchOutcome } = require("./lib/rating");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3001);

const DEFAULT_ALLOWED_ORIGINS = [
  "https://quantixy.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.1.102:3000"
];
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const RESOLVED_ALLOWED_ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS;
const ALLOW_VERCEL_PREVIEWS = process.env.CORS_ALLOW_VERCEL_PREVIEWS === "true";

console.log("MATHBATTLE BACKEND LIVE VERSION A3");
console.log("[server] PORT =", PORT);
console.log("[server] ALLOWED_ORIGINS =", RESOLVED_ALLOWED_ORIGINS);
console.log("[server] CORS_ALLOW_VERCEL_PREVIEWS =", ALLOW_VERCEL_PREVIEWS);
const DEFAULT_MATCH_DURATION_MS = 60000;
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
const ULTIMATE_MAX_CHARGE = 100;
const ULTIMATE_TIME_CHARGE_PER_SECOND = 1.4;
const ULTIMATE_CORRECT_CHARGE = 18;
const ULTIMATE_STREAK_BONUS_CHARGE = 6;
const ULTIMATE_DEFAULT_DURATION_MS = 6000;
// Health (HP) win condition — server authoritative.
const MAX_HP = 100;
const HP_BASE_PER_POINT = 8;
const HP_FAST_BONUS = 4;
const HP_STREAK_3_BONUS = 2;
const HP_STREAK_5_BONUS = 4;
// Ultimate balance tuning (ms)
const RAPID_FIRE_DURATION_MS = 6000;
const FORTRESS_DURATION_MS = 6000;
const JAM_DURATION_MS = 1800;
const INFERNO_BLAZE_DURATION_MS = 6000;
const INFERNO_BURN_REFRESH_MS = 2200;
const INFERNO_BURN_TICK_MS = 800;
const SHADOW_CORRUPT_DURATION_MS = 5000;
const SHADOW_CORRUPT_MAX_STACKS = 6;
const SHADOW_CORRUPT_DAMAGE_PER_STACK = 2;
const ARCHITECT_SEQUENCE_DURATION_MS = 6000;
const ARCHITECT_MAX_MARKS = 6;
const ARCHITECT_DAMAGE_PER_MARK = 3;
const TITAN_OVERPOWER_DURATION_MS = 5000;
const TITAN_BONUS_DAMAGE_PER_CORRECT = 4;
const TITAN_BREAK_HIT_BONUS_DAMAGE = 10;
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
      let authUserId = null;
      const authHeader = request.headers.authorization ?? "";
      const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

      if (accessToken) {
        try {
          const authUser = await verifyAccessToken(accessToken);
          authUserId = authUser.id;
        } catch (authError) {
          console.warn("[server] leaderboard auth token ignored", authError);
        }
      }

      const leaderboardData = await getLeaderboard({
        topic,
        authUserId,
        limit: topic ? 50 : 100
      });

      sendJson(request, response, 200, {
        topic: topic ?? "all",
        leaderboard: leaderboardData.leaderboard,
        myRank: leaderboardData.myRank
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
  // Socket.IO's engine handles all /socket.io/* paths internally.
  // Returning here lets engine.io's listener (added when `new Server(httpServer)`
  // is called below) take over without our handler prematurely closing the response.
  if (request.url?.startsWith("/socket.io")) return;
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
  clearUltimateTimeoutMap(game, "infernoTimeout");
  clearUltimateTimeoutMap(game, "infernoBurnInterval");
  clearUltimateTimeoutMap(game, "fortressTimeout");
  clearUltimateTimeoutMap(game, "shadowCorruptTimeout");
  clearUltimateTimeoutMap(game, "architectTimeout");
  clearUltimateTimeoutMap(game, "titanOverpowerTimeout");
  game.titanUntil = buildTitanUntilMap(game.players);
  game.blackoutUntil = buildBlackoutUntilMap(game.players);
  game.overclockUntil = buildOverclockUntilMap(game.players);
  game.fortressUntil = buildFortressUntilMap(game.players);
  game.flashBonusRemaining = buildFlashBonusRemainingMap(game.players);
  game.novaBonusRemaining = buildNovaBonusRemainingMap(game.players);
  game.fortressBlocksRemaining = buildFortressBlocksMap(game.players);
  game.aegisAbsorbedDamage = buildAegisAbsorbedMap(game.players);
  game.infernoPending = buildInfernoPendingMap(game.players);
  game.infernoPendingUntil = buildInfernoPendingUntilMap(game.players);
  game.infernoBurnUntil = buildInfernoBurnUntilMap(game.players);
  game.infernoBurnStacks = buildInfernoBurnStacksMap(game.players);
  game.shadowCorruptUntil = buildShadowCorruptUntilMap(game.players);
  game.shadowCorruptStacks = buildShadowCorruptStacksMap(game.players);
  game.architectUntil = buildArchitectUntilMap(game.players);
  game.architectSequenceStreak = buildArchitectSequenceStreakMap(game.players);
  game.architectMarks = buildArchitectMarksMap(game.players);
  game.titanOverpowerUntil = buildTitanOverpowerUntilMap(game.players);
  game.titanStreak = buildTitanStreakMap(game.players);
  game.titanBreakArmed = buildTitanBreakArmedMap(game.players);
}

function buildScoreMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildHpMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, MAX_HP]));
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

function buildAegisAbsorbedMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildInfernoPendingMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, false]));
}

function buildInfernoPendingUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildInfernoBurnUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildInfernoBurnStacksMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildShadowCorruptUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildShadowCorruptStacksMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildArchitectUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildArchitectSequenceStreakMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildArchitectMarksMap(players) {
  // Marks are stored on the *target* (the marked player).
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildTitanOverpowerUntilMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildTitanStreakMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildTitanBreakArmedMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, false]));
}

function buildInfernoTimeoutMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, null]));
}

function buildInfernoBurnIntervalMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, null]));
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
        questionIndex: 0,
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

function calcDamage(points, fast, streak) {
  if (!Number.isFinite(points) || points <= 0) return 0;
  const base = points * HP_BASE_PER_POINT;
  const fastBonus = fast ? HP_FAST_BONUS : 0;
  const streakBonus = streak >= 5 ? HP_STREAK_5_BONUS : streak >= 3 ? HP_STREAK_3_BONUS : 0;
  return base + fastBonus + streakBonus;
}

function buildTimerPayload(game) {
  const durationMs = Number.isFinite(game?.durationMs) ? game.durationMs : DEFAULT_MATCH_DURATION_MS;
  if (!game.endsAt) {
    return { secondsLeft: Math.ceil(durationMs / 1000) };
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
    if (legacyValue === "titan") {
      return "titan";
    }
    if (legacyValue === "aegis" || legacyValue === "frost") {
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
  return getAvatarUltimateConfig(player?.avatar)?.ultimateName ?? "Overclock";
}

function getUltimateDescriptionForPlayer(game, socketId) {
  const player = game.players.find((entry) => entry.socketId === socketId);
  return getAvatarUltimateConfig(player?.avatar)?.ultimateDescription ?? "";
}

function getUltimateDurationMs(ultimateType) {
  const avatar = AVATARS.find((entry) => entry.ultimateId === ultimateType);
  if (typeof avatar?.ultimateMeta?.durationMs === "number") {
    return avatar.ultimateMeta.durationMs;
  }

  if (ultimateType === "rapid_fire") return RAPID_FIRE_DURATION_MS;
  if (ultimateType === "shield") return FORTRESS_DURATION_MS;
  if (ultimateType === "system_corrupt") return SHADOW_CORRUPT_DURATION_MS;
  if (ultimateType === "perfect_sequence") return ARCHITECT_SEQUENCE_DURATION_MS;
  if (ultimateType === "overpower") return TITAN_OVERPOWER_DURATION_MS;
  if (ultimateType === "jam") return JAM_DURATION_MS;
  if (ultimateType === "double") return INFERNO_BLAZE_DURATION_MS;

  return ULTIMATE_DEFAULT_DURATION_MS;
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
  const youAreArchitect = yourUltimateType === "perfect_sequence";
  const opponentIsArchitect = opponentUltimateType === "perfect_sequence";
  const youAreTitan = yourUltimateType === "overpower";
  const opponentIsTitan = opponentUltimateType === "overpower";

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
    shadowCorruptUntil: game.shadowCorruptUntil?.[socketId] ?? 0,
    opponentShadowCorruptUntil: opponentId ? game.shadowCorruptUntil?.[opponentId] ?? 0 : 0,
    shadowCorruptStacks: game.shadowCorruptStacks?.[socketId] ?? 0,
    opponentShadowCorruptStacks: opponentId ? game.shadowCorruptStacks?.[opponentId] ?? 0 : 0,
    architectUntil: youAreArchitect ? game.architectUntil?.[socketId] ?? 0 : 0,
    opponentArchitectUntil: opponentIsArchitect && opponentId ? game.architectUntil?.[opponentId] ?? 0 : 0,
    architectMarks: youAreArchitect && opponentId ? game.architectMarks?.[opponentId] ?? 0 : 0,
    opponentArchitectMarks: opponentIsArchitect ? game.architectMarks?.[socketId] ?? 0 : 0,
    architectSequenceStreak: youAreArchitect ? game.architectSequenceStreak?.[socketId] ?? 0 : 0,
    opponentArchitectSequenceStreak: opponentIsArchitect && opponentId ? game.architectSequenceStreak?.[opponentId] ?? 0 : 0,
    titanOverpowerUntil: youAreTitan ? game.titanOverpowerUntil?.[socketId] ?? 0 : 0,
    opponentTitanOverpowerUntil: opponentIsTitan && opponentId ? game.titanOverpowerUntil?.[opponentId] ?? 0 : 0,
    titanStreak: youAreTitan ? game.titanStreak?.[socketId] ?? 0 : 0,
    opponentTitanStreak: opponentIsTitan && opponentId ? game.titanStreak?.[opponentId] ?? 0 : 0,
    titanBreakArmed: youAreTitan ? !!game.titanBreakArmed?.[socketId] : false,
    opponentTitanBreakArmed: opponentIsTitan && opponentId ? !!game.titanBreakArmed?.[opponentId] : false,
    overclockUntil: game.overclockUntil[socketId] ?? 0,
    opponentOverclockUntil: opponentId ? game.overclockUntil[opponentId] ?? 0 : 0,
    fortressUntil: game.fortressUntil[socketId] ?? 0,
    opponentFortressUntil: opponentId ? game.fortressUntil[opponentId] ?? 0 : 0,
    fortressBlocksRemaining: game.aegisAbsorbedDamage?.[socketId] ?? 0,
    opponentFortressBlocksRemaining: opponentId ? game.aegisAbsorbedDamage?.[opponentId] ?? 0 : 0,
    flashBonusRemaining: game.flashBonusRemaining[socketId] ?? 0,
    opponentFlashBonusRemaining: opponentId ? game.flashBonusRemaining[opponentId] ?? 0 : 0,
    novaBonusRemaining: game.infernoBurnStacks?.[socketId] ?? 0,
    opponentNovaBonusRemaining: opponentId ? game.infernoBurnStacks?.[opponentId] ?? 0 : 0,
    infernoPending: isActiveUntil(game.infernoPendingUntil?.[socketId] ?? 0),
    infernoPendingUntil: game.infernoPendingUntil?.[socketId] ?? 0,
    opponentInfernoPending: opponentId ? isActiveUntil(game.infernoPendingUntil?.[opponentId] ?? 0) : false,
    opponentInfernoPendingUntil: opponentId ? game.infernoPendingUntil?.[opponentId] ?? 0 : 0
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
  const answer = String((question?.acceptedAnswers?.[0] ?? question?.answer) ?? "").trim();
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

function consumeIncomingProtection(game, socketId) {
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

function clearInfernoBurnForPlayer(game, socketId) {
  game.infernoBurnUntil[socketId] = 0;
  game.infernoBurnStacks[socketId] = 0;
  game.novaBonusRemaining[socketId] = 0;
}

function clearArchitectSequenceForPlayer(game, casterSocketId) {
  game.architectSequenceStreak[casterSocketId] = 0;
  const opponent = getOpponent(game, casterSocketId);
  if (opponent) {
    game.architectMarks[opponent.socketId] = 0;
  }
}

function clearTitanOverpowerForPlayer(game, socketId) {
  game.titanStreak[socketId] = 0;
  game.titanBreakArmed[socketId] = false;
}

function computeInfernoBurnTickDamage(stacks) {
  const safeStacks = Math.max(0, Number(stacks) || 0);
  if (safeStacks <= 0) {
    return 0;
  }
  return Math.min(4, Math.max(1, Math.ceil(safeStacks / 2)));
}

function resolveIncomingDamage(
  game,
  attackerSocketId,
  targetSocketId,
  incomingDamage,
  blockedType = "damage",
  options = {}
) {
  let damage = Math.max(0, Number(incomingDamage) || 0);
  let knockedOutTarget = false;
  let knockedOutAttacker = false;
  const bypassDefense = options?.bypassDefense === true;
  const bypassProtection = options?.bypassProtection === true;

  if (damage <= 0) {
    return { damageApplied: 0, knockedOutTarget, knockedOutAttacker };
  }

  if (!game.hp) {
    game.hp = buildHpMap(game.players);
  }

  const aegisActive = !bypassDefense && isActiveUntil(game.fortressUntil[targetSocketId]);
  if (aegisActive) {
    const reducedDamage = Math.max(1, Math.floor(damage * 0.35));
    const absorbedDamage = Math.max(0, damage - reducedDamage);
    const reflectDamage = Math.min(2, Math.max(1, Math.floor(absorbedDamage / 6)));

    game.aegisAbsorbedDamage[targetSocketId] =
      (game.aegisAbsorbedDamage[targetSocketId] ?? 0) + absorbedDamage;
    game.fortressBlocksRemaining[targetSocketId] = game.aegisAbsorbedDamage[targetSocketId];
    damage = reducedDamage;

    if (reflectDamage > 0) {
      const nextAttackerHp = Math.max(0, (game.hp[attackerSocketId] ?? MAX_HP) - reflectDamage);
      game.hp[attackerSocketId] = nextAttackerHp;
      knockedOutAttacker = nextAttackerHp <= 0;

      io.to(attackerSocketId).emit("shieldBlocked", {
        by: "opponent",
        target: "you",
        blockedType: "aegis_reflect",
        reflectDamage,
        ...buildPlayerPowerState(game, attackerSocketId)
      });

      io.to(targetSocketId).emit("shieldBlocked", {
        by: "you",
        target: "opponent",
        blockedType: "aegis_reflect",
        reflectDamage,
        ...buildPlayerPowerState(game, targetSocketId)
      });
    }
  }

  const blockedByProtection = bypassProtection ? null : consumeIncomingProtection(game, targetSocketId);
  if (blockedByProtection) {
    io.to(attackerSocketId).emit("shieldBlocked", {
      by: "you",
      target: "opponent",
      blockedType,
      ...buildPlayerPowerState(game, attackerSocketId)
    });

    io.to(targetSocketId).emit("shieldBlocked", {
      by: "opponent",
      target: "you",
      blockedType,
      ...buildPlayerPowerState(game, targetSocketId)
    });

    return { damageApplied: 0, knockedOutTarget, knockedOutAttacker };
  }

  const nextTargetHp = Math.max(0, (game.hp[targetSocketId] ?? MAX_HP) - damage);
  game.hp[targetSocketId] = nextTargetHp;
  knockedOutTarget = nextTargetHp <= 0;

  return { damageApplied: damage, knockedOutTarget, knockedOutAttacker };
}

function ensureInfernoBurnLoop(roomId, casterSocketId) {
  const game = activeGames.get(roomId);
  if (!game || game.infernoBurnInterval[casterSocketId]) {
    return;
  }

  game.infernoBurnInterval[casterSocketId] = setInterval(() => {
    const activeGame = activeGames.get(roomId);
    if (!activeGame || activeGame.phase !== "playing") {
      return;
    }

    if (!isActiveUntil(activeGame.infernoPendingUntil[casterSocketId])) {
      clearInterval(activeGame.infernoBurnInterval[casterSocketId]);
      activeGame.infernoBurnInterval[casterSocketId] = null;
      return;
    }

    const burnUntil = activeGame.infernoBurnUntil[casterSocketId] ?? 0;
    const stacks = activeGame.infernoBurnStacks[casterSocketId] ?? 0;
    if (!isActiveUntil(burnUntil) || stacks <= 0) {
      return;
    }

    const opponent = getOpponent(activeGame, casterSocketId);
    if (!opponent || activeGame.eliminated[casterSocketId] || activeGame.eliminated[opponent.socketId]) {
      return;
    }

    const tickDamage = computeInfernoBurnTickDamage(stacks);
    const result = resolveIncomingDamage(activeGame, casterSocketId, opponent.socketId, tickDamage, "burn");
    if (result.damageApplied > 0) {
      io.to(casterSocketId).emit("burnTick", {
        by: "you",
        target: "opponent",
        damage: result.damageApplied,
        burnStacks: stacks,
        hp: {
          you: activeGame.hp?.[casterSocketId] ?? MAX_HP,
          opponent: activeGame.hp?.[opponent.socketId] ?? MAX_HP
        },
        ...buildPlayerPowerState(activeGame, casterSocketId),
        ...buildPlayerUltimateState(activeGame, casterSocketId)
      });
      io.to(opponent.socketId).emit("burnTick", {
        by: "opponent",
        target: "you",
        damage: result.damageApplied,
        burnStacks: stacks,
        hp: {
          you: activeGame.hp?.[opponent.socketId] ?? MAX_HP,
          opponent: activeGame.hp?.[casterSocketId] ?? MAX_HP
        },
        ...buildPlayerPowerState(activeGame, opponent.socketId),
        ...buildPlayerUltimateState(activeGame, opponent.socketId)
      });
    }

    if (result.knockedOutAttacker && opponent) {
      void finishGame(roomId, {
        forceWinnerSocketId: opponent.socketId,
        endCondition: "ko",
        reason: `${opponent.name ?? "Guardian"} holds the line and wins by reflection.`
      });
      return;
    }

    if (result.knockedOutTarget && opponent) {
      void finishGame(roomId, {
        forceWinnerSocketId: casterSocketId,
        endCondition: "ko",
        reason: `${activeGame.players.find((p) => p.socketId === casterSocketId)?.name ?? "Inferno"} burns through for the KO.`
      });
    }
  }, INFERNO_BURN_TICK_MS);
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

    io.to(player.socketId).emit("questionState", {
      youAnswered: !!youState?.answered,
      opponentAnswered: !!opponentState?.answered,
      winner: null,
      youEliminated: !!game.eliminated[player.socketId],
      opponentEliminated: !!game.eliminated[opponent.socketId],
      ...buildPlayerUltimateState(game, player.socketId)
    });
  }
}

function resetGameState(game) {
  game.questionBank = [];
  game.playerQuestionState = buildPlayerQuestionState(game.players);
  game.questionTimeouts = Object.fromEntries(game.players.map((player) => [player.socketId, null]));
  game.startedAt = null;
  game.endsAt = null;
  game.phase = "countdown";
  game.scores = buildScoreMap(game.players);
  game.hp = buildHpMap(game.players);
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
  game.aegisAbsorbedDamage = buildAegisAbsorbedMap(game.players);
  game.flashBonusRemaining = buildFlashBonusRemainingMap(game.players);
  game.novaBonusRemaining = buildNovaBonusRemainingMap(game.players);
  game.infernoPending = buildInfernoPendingMap(game.players);
  game.infernoPendingUntil = buildInfernoPendingUntilMap(game.players);
  game.infernoBurnUntil = buildInfernoBurnUntilMap(game.players);
  game.infernoBurnStacks = buildInfernoBurnStacksMap(game.players);
  game.shadowCorruptUntil = buildShadowCorruptUntilMap(game.players);
  game.shadowCorruptStacks = buildShadowCorruptStacksMap(game.players);
  game.architectUntil = buildArchitectUntilMap(game.players);
  game.architectSequenceStreak = buildArchitectSequenceStreakMap(game.players);
  game.architectMarks = buildArchitectMarksMap(game.players);
  game.titanOverpowerUntil = buildTitanOverpowerUntilMap(game.players);
  game.titanStreak = buildTitanStreakMap(game.players);
  game.titanBreakArmed = buildTitanBreakArmedMap(game.players);
  game.titanTimeout = buildUltimateEffectTimeoutMap(game.players);
  game.blackoutTimeout = buildUltimateEffectTimeoutMap(game.players);
  game.fortressTimeout = buildUltimateEffectTimeoutMap(game.players);
  game.infernoTimeout = buildInfernoTimeoutMap(game.players);
  game.infernoBurnInterval = buildInfernoBurnIntervalMap(game.players);
  game.shadowCorruptTimeout = buildUltimateEffectTimeoutMap(game.players);
  game.architectTimeout = buildUltimateEffectTimeoutMap(game.players);
  game.titanOverpowerTimeout = buildUltimateEffectTimeoutMap(game.players);
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

  const question = ensureQuestionAtIndex(game, questionState.questionIndex);
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

  const payload = { question: question.prompt, questionData: question, token: questionState.generation };
  console.log(`[server] newQuestion emitted -> room=${roomId} player=${socketId} qi=${questionState.questionIndex} token=${questionState.generation}`);
  io.to(socketId).emit("newQuestion", payload);
  emitQuestionState(roomId);
}

function startMatchTimer(roomId) {
  const game = activeGames.get(roomId);

  if (!game || game.startedAt) {
    return;
  }

  game.startedAt = Date.now();
  const durationMs = Number.isFinite(game.durationMs)
    ? game.durationMs
    : getMatchDurationSeconds(game.topic, game.difficulty) * 1000;
  game.durationMs = durationMs;
  game.endsAt = game.startedAt + durationMs;
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

      if (
        !isActiveUntil(activeGame.overclockUntil[player.socketId]) &&
        (activeGame.flashBonusRemaining[player.socketId] ?? 0) > 0
      ) {
        activeGame.flashBonusRemaining[player.socketId] = 0;
      }

      io.to(player.socketId).emit("timerUpdate", {
        secondsLeft,
        ...buildPlayerUltimateState(activeGame, player.socketId)
      });
    }

    if (secondsLeft <= 0) {
      clearMatchTimer(activeGame);
      finishGame(roomId, { endCondition: "time" });
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

  const reason = typeof options.reason === "string" ? options.reason : null;
  const endCondition = typeof options.endCondition === "string" ? options.endCondition : null;
  const forcedWinnerSocketId =
    typeof options.forceWinnerSocketId === "string" ? options.forceWinnerSocketId : null;

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
  const playerOneHp = game.hp?.[playerOne.socketId] ?? null;
  const playerTwoHp = game.hp?.[playerTwo.socketId] ?? null;

  let winnerSocketId = null;
  let isDraw = false;

  if (forcedWinnerSocketId && (forcedWinnerSocketId === playerOne.socketId || forcedWinnerSocketId === playerTwo.socketId)) {
    winnerSocketId = forcedWinnerSocketId;
  } else if (endCondition === "time" && typeof playerOneHp === "number" && typeof playerTwoHp === "number") {
    if (playerOneHp > playerTwoHp) {
      winnerSocketId = playerOne.socketId;
    } else if (playerTwoHp > playerOneHp) {
      winnerSocketId = playerTwo.socketId;
    } else if (playerOneScore !== playerTwoScore) {
      winnerSocketId = playerOneScore > playerTwoScore ? playerOne.socketId : playerTwo.socketId;
    } else {
      isDraw = true;
    }
  } else {
    if (playerOneScore !== playerTwoScore) {
      winnerSocketId = playerOneScore > playerTwoScore ? playerOne.socketId : playerTwo.socketId;
    } else {
      isDraw = true;
    }
  }

  const winner = isDraw ? null : winnerSocketId === playerOne.socketId ? playerOne : playerTwo;
  const loser = isDraw ? null : winner?.socketId === playerOne.socketId ? playerTwo : playerOne;
  const playerOneActualScore = isDraw ? 0.5 : winnerSocketId === playerOne.socketId ? 1 : 0;
  const playerTwoActualScore = isDraw ? 0.5 : winnerSocketId === playerTwo.socketId ? 1 : 0;
  const playerOneDelta = calculateEloDelta(playerOne.rating, playerTwo.rating, playerOneActualScore);
  const playerTwoDelta = calculateEloDelta(playerTwo.rating, playerOne.rating, playerTwoActualScore);
  const nextPlayerOneRating = playerOne.rating + playerOneDelta;
  const nextPlayerTwoRating = playerTwo.rating + playerTwoDelta;
  const message = (() => {
    if (reason) return reason;
    if (isDraw) {
      if (endCondition === "time" && typeof playerOneHp === "number" && typeof playerTwoHp === "number") {
        return `Time! Draw on HP (${playerOneHp}-${playerTwoHp}) and score (${playerOneScore}-${playerTwoScore}).`;
      }
      return `Draw ${playerOneScore}-${playerTwoScore}.`;
    }
    if (endCondition === "time" && typeof playerOneHp === "number" && typeof playerTwoHp === "number") {
      const hpLine = `HP ${playerOneHp}-${playerTwoHp}`;
      const scoreLine = `score ${playerOneScore}-${playerTwoScore}`;
      return `Time! ${winner?.name ?? "Player"} wins — ${hpLine}${playerOneHp === playerTwoHp ? `, ${scoreLine}` : ""}.`;
    }
    return `${winner?.name ?? "Player"} defeats ${loser?.name ?? "Opponent"} ${Math.max(playerOneScore, playerTwoScore)}-${Math.min(playerOneScore, playerTwoScore)}.`;
  })();

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
      endCondition: endCondition ?? (forcedWinnerSocketId ? "forced" : "score"),
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

  // Mark this player done with the current question.
  questionState.answered = true;
  clearPlayerQuestionTimer(game, playerSocketId);

  // Each player answers their own independent question — every correct answer earns points.
  const fastAnswer =
    typeof questionState.questionSentAt === "number" &&
    Date.now() - questionState.questionSentAt <= FAST_ANSWER_MS;
  let awardedPoints = pointsAwarded;
  let overclockCombo = 0;
  let overclockBonusDamage = 0;
  let perfectStrikeDamage = 0;
  let perfectStrikeMarksConsumed = 0;
  let titanBonusDamage = 0;
  let titanBreakDamage = 0;
  let titanBreakTriggered = false;

  if (isActiveUntil(game.overclockUntil[playerSocketId])) {
    overclockCombo = (game.flashBonusRemaining[playerSocketId] ?? 0) + 1;
    game.flashBonusRemaining[playerSocketId] = overclockCombo;
    overclockBonusDamage = overclockCombo;
  } else if ((game.flashBonusRemaining[playerSocketId] ?? 0) > 0) {
    game.flashBonusRemaining[playerSocketId] = 0;
  }

  if (isActiveUntil(game.infernoPendingUntil[playerSocketId])) {
    const nextStacks = Math.min(8, (game.infernoBurnStacks[playerSocketId] ?? 0) + 1);
    game.infernoPending[playerSocketId] = true;
    game.infernoBurnStacks[playerSocketId] = nextStacks;
    game.novaBonusRemaining[playerSocketId] = nextStacks;
    game.infernoBurnUntil[playerSocketId] = Date.now() + INFERNO_BURN_REFRESH_MS;
    ensureInfernoBurnLoop(roomId, playerSocketId);
  }

  // Titan: Overpower (simple premium heavy-hitter).
  // - While active: every correct answer gains heavy bonus damage.
  // - After 2 consecutive correct answers: arm Break Hit on next successful hit.
  // - Break Hit bypasses defensive mitigation/protection (clean armor-penetration behavior).
  const titanActive = isActiveUntil(game.titanOverpowerUntil?.[playerSocketId] ?? 0);
  if (titanActive) {
    titanBonusDamage = TITAN_BONUS_DAMAGE_PER_CORRECT;
    const nextStreak = Math.min(3, (game.titanStreak?.[playerSocketId] ?? 0) + 1);
    game.titanStreak[playerSocketId] = nextStreak;
    if (nextStreak >= 2) {
      game.titanBreakArmed[playerSocketId] = true;
    }
  }

  game.scores[playerSocketId] = (game.scores[playerSocketId] ?? 0) + awardedPoints;
  game.streaks[playerSocketId] = (game.streaks[playerSocketId] ?? 0) + 1;
  const streakBonus = game.streaks[playerSocketId] >= 3 ? ULTIMATE_STREAK_BONUS_CHARGE : 0;
  increaseUltimateCharge(game, playerSocketId, ULTIMATE_CORRECT_CHARGE + streakBonus);

  // Apply HP damage to opponent (server authoritative KO condition).
  const opponent = getOpponent(game, playerSocketId);
  const baseDamage = opponent ? calcDamage(awardedPoints, fastAnswer, game.streaks[playerSocketId] ?? 0) : 0;
  let damage = opponent ? baseDamage + overclockBonusDamage : 0;
  let knockedOutOpponent = false;
  let knockedOutAttacker = false;
  if (opponent) {
    if (!game.hp) {
      game.hp = buildHpMap(game.players);
    }

    // Apply Titan bonus (simple, additive).
    damage += titanBonusDamage;

    const result = resolveIncomingDamage(game, playerSocketId, opponent.socketId, damage, "damage");
    knockedOutAttacker = result.knockedOutAttacker;
    knockedOutOpponent = result.knockedOutTarget;
  }

  // Architect: Perfect Sequence (premium, skill-based burst).
  // Marks are applied to the opponent; strike triggers only on a 3-correct sequence during the active window.
  if (opponent && isActiveUntil(game.architectUntil?.[playerSocketId] ?? 0)) {
    const nextMarks = Math.min(ARCHITECT_MAX_MARKS, (game.architectMarks?.[opponent.socketId] ?? 0) + 1);
    game.architectMarks[opponent.socketId] = nextMarks;
    const nextStreak = Math.min(3, (game.architectSequenceStreak?.[playerSocketId] ?? 0) + 1);
    game.architectSequenceStreak[playerSocketId] = nextStreak;

    if (nextStreak >= 3) {
      perfectStrikeMarksConsumed = Math.max(0, game.architectMarks?.[opponent.socketId] ?? 0);
      perfectStrikeDamage = Math.max(0, perfectStrikeMarksConsumed * ARCHITECT_DAMAGE_PER_MARK);
      // Consume marks + reset streak (ultimate can continue if time remains).
      game.architectMarks[opponent.socketId] = 0;
      game.architectSequenceStreak[playerSocketId] = 0;

      if (perfectStrikeDamage > 0) {
        const strikeResult = resolveIncomingDamage(
          game,
          playerSocketId,
          opponent.socketId,
          perfectStrikeDamage,
          "perfect_strike"
        );

        // Notify both clients for the premium payoff moment.
        emitUltimateApplied(
          game,
          roomId,
          playerSocketId,
          opponent.socketId,
          {
            by: "you",
            target: "opponent",
            type: "perfect_sequence",
            effect: "perfect_strike",
            damage: strikeResult.damageApplied,
            marksConsumed: perfectStrikeMarksConsumed,
            hp: {
              you: game.hp?.[playerSocketId] ?? MAX_HP,
              opponent: game.hp?.[opponent.socketId] ?? MAX_HP
            }
          },
          {
            by: "opponent",
            target: "you",
            type: "perfect_sequence",
            effect: "perfect_strike",
            damage: strikeResult.damageApplied,
            marksConsumed: perfectStrikeMarksConsumed,
            hp: {
              you: game.hp?.[opponent.socketId] ?? MAX_HP,
              opponent: game.hp?.[playerSocketId] ?? MAX_HP
            }
          }
        );

        if (strikeResult.knockedOutAttacker) {
          knockedOutAttacker = true;
        }
        if (strikeResult.knockedOutTarget) {
          knockedOutOpponent = true;
        }
      }
    }
  }

  // Titan: Break Hit on a successful hit while armed.
  if (opponent && titanActive && game.titanBreakArmed?.[playerSocketId]) {
    // Consume the armed state immediately so it can't double-trigger.
    game.titanBreakArmed[playerSocketId] = false;
    game.titanStreak[playerSocketId] = 0;

    titanBreakTriggered = true;
    titanBreakDamage = Math.max(0, TITAN_BREAK_HIT_BONUS_DAMAGE);

    const strikeResult = resolveIncomingDamage(
      game,
      playerSocketId,
      opponent.socketId,
      titanBreakDamage,
      "break_hit",
      { bypassDefense: true, bypassProtection: true }
    );

    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      {
        by: "you",
        target: "opponent",
        type: "overpower",
        effect: "break_hit",
        damage: strikeResult.damageApplied,
        hp: {
          you: game.hp?.[playerSocketId] ?? MAX_HP,
          opponent: game.hp?.[opponent.socketId] ?? MAX_HP
        }
      },
      {
        by: "opponent",
        target: "you",
        type: "overpower",
        effect: "break_hit",
        damage: strikeResult.damageApplied,
        hp: {
          you: game.hp?.[opponent.socketId] ?? MAX_HP,
          opponent: game.hp?.[playerSocketId] ?? MAX_HP
        }
      }
    );

    if (strikeResult.knockedOutAttacker) {
      knockedOutAttacker = true;
    }
    if (strikeResult.knockedOutTarget) {
      knockedOutOpponent = true;
    }
  }

  const playerOneSocketId = game.players[0].socketId;
  const playerTwoSocketId = game.players[1].socketId;
  const scorerSocketId = playerSocketId;

  console.log(`[server] correct answer -> room=${roomId}`, {
    player: playerSocketId,
    awardedPoints,
    playerQi: questionState.questionIndex,
    scores: game.scores,
    fastAnswer
  });

  // Always emit pointScored so both clients get the score/streak update and
  // play the correct-answer sound. awardedPoints is 0 for the second player.
  io.to(playerOneSocketId).emit("pointScored", {
    scores: {
      you: game.scores[playerOneSocketId],
      opponent: game.scores[playerTwoSocketId]
    },
    hp: {
      you: game.hp?.[playerOneSocketId] ?? null,
      opponent: game.hp?.[playerTwoSocketId] ?? null
    },
    streak: game.streaks[playerOneSocketId],
    opponentStreak: game.streaks[playerTwoSocketId],
    fastAnswer: scorerSocketId === playerOneSocketId ? fastAnswer : false,
    opponentFastAnswer: scorerSocketId === playerTwoSocketId ? fastAnswer : false,
    pointsAwarded: scorerSocketId === playerOneSocketId ? awardedPoints : 0,
    overclockCombo: scorerSocketId === playerOneSocketId ? overclockCombo : 0,
    overclockBonusDamage: scorerSocketId === playerOneSocketId ? overclockBonusDamage : 0,
    strikes: game.strikes[playerOneSocketId] ?? 0,
    opponentStrikes: game.strikes[playerTwoSocketId] ?? 0,
    youEliminated: !!game.eliminated[playerOneSocketId],
    opponentEliminated: !!game.eliminated[playerTwoSocketId],
    ...buildPlayerPowerState(game, playerOneSocketId),
    ...buildPlayerUltimateState(game, playerOneSocketId)
  });

  io.to(playerTwoSocketId).emit("pointScored", {
    scores: {
      you: game.scores[playerTwoSocketId],
      opponent: game.scores[playerOneSocketId]
    },
    hp: {
      you: game.hp?.[playerTwoSocketId] ?? null,
      opponent: game.hp?.[playerOneSocketId] ?? null
    },
    streak: game.streaks[playerTwoSocketId],
    opponentStreak: game.streaks[playerOneSocketId],
    fastAnswer: scorerSocketId === playerTwoSocketId ? fastAnswer : false,
    opponentFastAnswer: scorerSocketId === playerOneSocketId ? fastAnswer : false,
    pointsAwarded: scorerSocketId === playerTwoSocketId ? awardedPoints : 0,
    overclockCombo: scorerSocketId === playerTwoSocketId ? overclockCombo : 0,
    overclockBonusDamage: scorerSocketId === playerTwoSocketId ? overclockBonusDamage : 0,
    strikes: game.strikes[playerTwoSocketId] ?? 0,
    opponentStrikes: game.strikes[playerOneSocketId] ?? 0,
    youEliminated: !!game.eliminated[playerTwoSocketId],
    opponentEliminated: !!game.eliminated[playerOneSocketId],
    ...buildPlayerPowerState(game, playerTwoSocketId),
    ...buildPlayerUltimateState(game, playerTwoSocketId)
  });

  // Broadcast the current completion state (youAnswered / opponentAnswered).
  emitQuestionState(roomId);
  emitLiveLeaderboard(roomId);

  if (knockedOutAttacker && opponent) {
    void finishGame(roomId, {
      forceWinnerSocketId: opponent.socketId,
      endCondition: "ko",
      reason: `${opponent.name ?? "Guardian"} holds the line and wins by reflection.`
    });
    return;
  }

  if (knockedOutOpponent && opponent) {
    void finishGame(roomId, {
      forceWinnerSocketId: playerSocketId,
      endCondition: "ko",
      reason: `${game.players.find((p) => p.socketId === playerSocketId)?.name ?? "Player"} wins by KO.`
    });
    return;
  }

  // Advance only the scorer to their next question — opponent is unaffected.
  advancePlayerQuestion(roomId, playerSocketId);
}

/**
 * Advance a single player's question index and push their next question.
 * The opponent's question is completely unaffected.
 */
function advancePlayerQuestion(roomId, socketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  const questionState = game.playerQuestionState[socketId];

  if (!questionState) {
    return;
  }

  questionState.questionIndex += 1;
  console.log(`[server] advancePlayerQuestion -> room=${roomId} player=${socketId} qi=${questionState.questionIndex}`);

  if (!game.eliminated[socketId]) {
    emitNewQuestionToPlayer(roomId, socketId);
  }
}

function handleIncorrectAnswer(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (game.eliminated[playerSocketId]) {
    return;
  }

  if (isActiveUntil(game.overclockUntil[playerSocketId])) {
    game.flashBonusRemaining[playerSocketId] = 0;
  }

  if (isActiveUntil(game.infernoPendingUntil[playerSocketId])) {
    clearInfernoBurnForPlayer(game, playerSocketId);
  }

  if (isActiveUntil(game.shadowCorruptUntil?.[playerSocketId] ?? 0)) {
    const nextStacks = Math.min(
      SHADOW_CORRUPT_MAX_STACKS,
      Math.max(0, (game.shadowCorruptStacks?.[playerSocketId] ?? 0) + 1)
    );
    game.shadowCorruptStacks[playerSocketId] = nextStacks;
  }

  // Architect: wrong answer during Perfect Sequence resets streak + clears marks.
  if (isActiveUntil(game.architectUntil?.[playerSocketId] ?? 0)) {
    clearArchitectSequenceForPlayer(game, playerSocketId);
  }

  // Titan: wrong answer during Overpower resets the chain and Break Hit progress.
  if (isActiveUntil(game.titanOverpowerUntil?.[playerSocketId] ?? 0)) {
    clearTitanOverpowerForPlayer(game, playerSocketId);
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
    eliminated: isEliminated,
    ...buildPlayerUltimateState(game, playerSocketId)
  });

  if (opponent) {
    io.to(opponent.socketId).emit("opponentStrike", {
      opponentStrikes: game.strikes[playerSocketId] ?? 0,
      opponentEliminated: isEliminated,
      ...buildPlayerUltimateState(game, opponent.socketId)
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

  // Cosmetics are fetched in a separate query with a safe fallback so that
  // joinQueue / custom rooms continue working even if the DB migration has
  // not been applied yet (columns missing → defaults are used silently).
  const [rating, cosmetics] = await Promise.all([
    getOrCreateRating(player.id, topic),
    getPlayerCosmetics(player.id)
  ]);

  return {
    socketId: socket.id,
    playerId: player.id,
    name: player.display_name ?? player.username,
    rating: rating.rating,
    avatar: normalizeAvatarId(player.avatar_id),
    // Cosmetics — visual only, no gameplay effect
    streakEffect: cosmetics.streakEffect,
    emotePack: cosmetics.emotePack
  };
}

function createActiveGame(players, topic, difficulty, customRoomCode = null) {
  const roomId = customRoomCode ? `custom-${customRoomCode}` : `room-${roomCounter++}`;
  const game = {
    roomId,
    topic,
    difficulty,
    durationMs: getMatchDurationSeconds(topic, difficulty) * 1000,
    customRoomCode,
    players,
    questionBank: [],
    playerQuestionState: buildPlayerQuestionState(players),
    questionTimeouts: Object.fromEntries(players.map((player) => [player.socketId, null])),
    startedAt: null,
    endsAt: null,
    phase: "waiting",
    scores: buildScoreMap(players),
    hp: buildHpMap(players),
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
    aegisAbsorbedDamage: buildAegisAbsorbedMap(players),
    flashBonusRemaining: buildFlashBonusRemainingMap(players),
    novaBonusRemaining: buildNovaBonusRemainingMap(players),
    infernoPending: buildInfernoPendingMap(players),
    infernoPendingUntil: buildInfernoPendingUntilMap(players),
    infernoBurnUntil: buildInfernoBurnUntilMap(players),
    infernoBurnStacks: buildInfernoBurnStacksMap(players),
    shadowCorruptUntil: buildShadowCorruptUntilMap(players),
    shadowCorruptStacks: buildShadowCorruptStacksMap(players),
    architectUntil: buildArchitectUntilMap(players),
    architectSequenceStreak: buildArchitectSequenceStreakMap(players),
    architectMarks: buildArchitectMarksMap(players),
    titanOverpowerUntil: buildTitanOverpowerUntilMap(players),
    titanStreak: buildTitanStreakMap(players),
    titanBreakArmed: buildTitanBreakArmedMap(players),
    titanTimeout: buildUltimateEffectTimeoutMap(players),
    blackoutTimeout: buildUltimateEffectTimeoutMap(players),
    fortressTimeout: buildUltimateEffectTimeoutMap(players),
    infernoTimeout: buildInfernoTimeoutMap(players),
    infernoBurnInterval: buildInfernoBurnIntervalMap(players),
    shadowCorruptTimeout: buildUltimateEffectTimeoutMap(players),
    architectTimeout: buildUltimateEffectTimeoutMap(players),
    titanOverpowerTimeout: buildUltimateEffectTimeoutMap(players),
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
    emoteTimestamps: Object.fromEntries(players.map((player) => [player.socketId, []])),
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
    // Cosmetics — visual only
    yourStreakEffect: players[0].streakEffect,
    opponentStreakEffect: players[1].streakEffect,
    yourEmotePack: players[0].emotePack,
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
    // Cosmetics — visual only
    yourStreakEffect: players[1].streakEffect,
    opponentStreakEffect: players[0].streakEffect,
    yourEmotePack: players[1].emotePack,
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

  game.ultimateUsed[playerSocketId] = true;
  game.ultimateReady[playerSocketId] = false;
  game.ultimateCharge[playerSocketId] = ULTIMATE_MAX_CHARGE;

  if (ultimateType === "rapid_fire") {
    const durationMs = getUltimateDurationMs(ultimateType);
    game.overclockUntil[playerSocketId] = now + durationMs;
    game.flashBonusRemaining[playerSocketId] = 0;
    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      {
        by: "you",
        target: "you",
        type: ultimateType,
        effect: "overclock_active",
        durationMs
      },
      {
        by: "opponent",
        target: "opponent",
        type: ultimateType,
        effect: "overclock_active",
        durationMs
      }
    );
    return;
  }

  if (ultimateType === "system_corrupt") {
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

    clearTimeout(game.shadowCorruptTimeout[opponent.socketId]);
    game.shadowCorruptStacks[opponent.socketId] = 0;
    game.shadowCorruptUntil[opponent.socketId] = now + durationMs;
    game.shadowCorruptTimeout[opponent.socketId] = setTimeout(() => {
      const activeGame = activeGames.get(roomId);
      if (!activeGame) {
        return;
      }

      const activeOpponent = getOpponent(activeGame, playerSocketId);
      const targetSocketId = activeOpponent?.socketId ?? opponent.socketId;
      const stacks = Math.max(0, activeGame.shadowCorruptStacks?.[targetSocketId] ?? 0);
      const detonationDamage = Math.max(0, stacks * SHADOW_CORRUPT_DAMAGE_PER_STACK);

      activeGame.shadowCorruptUntil[targetSocketId] = 0;
      activeGame.shadowCorruptStacks[targetSocketId] = 0;
      activeGame.shadowCorruptTimeout[targetSocketId] = null;

      let result = { damageApplied: 0, knockedOutTarget: false, knockedOutAttacker: false };
      if (activeOpponent && detonationDamage > 0 && !activeGame.eliminated[targetSocketId]) {
        result = resolveIncomingDamage(activeGame, playerSocketId, targetSocketId, detonationDamage, "corruption");
      }

      emitUltimateEnded(
        activeGame,
        playerSocketId,
        targetSocketId,
        {
          by: "you",
          target: "opponent",
          type: "system_corrupt",
          effect: "system_corrupt_ended",
          damage: result.damageApplied,
          corruptionStacks: stacks,
          hp: {
            you: activeGame.hp?.[playerSocketId] ?? MAX_HP,
            opponent: activeGame.hp?.[targetSocketId] ?? MAX_HP
          }
        },
        {
          by: "opponent",
          target: "you",
          type: "system_corrupt",
          effect: "system_corrupt_ended",
          damage: result.damageApplied,
          corruptionStacks: stacks,
          hp: {
            you: activeGame.hp?.[targetSocketId] ?? MAX_HP,
            opponent: activeGame.hp?.[playerSocketId] ?? MAX_HP
          }
        }
      );

      if (result.knockedOutAttacker && activeOpponent) {
        void finishGame(roomId, {
          forceWinnerSocketId: targetSocketId,
          endCondition: "ko",
          reason: `${activeOpponent.name ?? "Opponent"} survives the corruption and wins by reflection.`
        });
        return;
      }

      if (result.knockedOutTarget && activeOpponent) {
        void finishGame(roomId, {
          forceWinnerSocketId: playerSocketId,
          endCondition: "ko",
          reason: `${activeGame.players.find((p) => p.socketId === playerSocketId)?.name ?? "Shadow"} detonates corruption for the KO.`
        });
      }
    }, durationMs);

    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      { by: "you", target: "opponent", type: ultimateType, effect: "system_corrupt_active", durationMs },
      { by: "opponent", target: "you", type: ultimateType, effect: "system_corrupt_active", durationMs }
    );
    return;
  }

  if (ultimateType === "perfect_sequence") {
    const durationMs = getUltimateDurationMs(ultimateType);
    game.architectUntil[playerSocketId] = now + durationMs;
    game.architectSequenceStreak[playerSocketId] = 0;
    game.architectMarks[opponent.socketId] = 0;

    clearTimeout(game.architectTimeout[playerSocketId]);
    game.architectTimeout[playerSocketId] = setTimeout(() => {
      const activeGame = activeGames.get(roomId);
      if (!activeGame) return;
      const activeOpponent = getOpponent(activeGame, playerSocketId);
      // Clear sequence state even if opponent left / got eliminated.
      activeGame.architectUntil[playerSocketId] = 0;
      activeGame.architectSequenceStreak[playerSocketId] = 0;
      if (activeOpponent) {
        activeGame.architectMarks[activeOpponent.socketId] = 0;
      }
      activeGame.architectTimeout[playerSocketId] = null;
      emitUltimateEnded(
        activeGame,
        playerSocketId,
        activeOpponent?.socketId ?? opponent.socketId,
        { by: "you", target: "you", type: "perfect_sequence", effect: "perfect_sequence_ended" },
        { by: "opponent", target: "opponent", type: "perfect_sequence", effect: "perfect_sequence_ended" }
      );
    }, durationMs);

    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      { by: "you", target: "you", type: ultimateType, effect: "perfect_sequence_active", durationMs },
      { by: "opponent", target: "opponent", type: ultimateType, effect: "perfect_sequence_active", durationMs }
    );
    return;
  }

  if (ultimateType === "overpower") {
    const durationMs = getUltimateDurationMs(ultimateType);
    game.titanOverpowerUntil[playerSocketId] = now + durationMs;
    clearTitanOverpowerForPlayer(game, playerSocketId);

    clearTimeout(game.titanOverpowerTimeout[playerSocketId]);
    game.titanOverpowerTimeout[playerSocketId] = setTimeout(() => {
      const activeGame = activeGames.get(roomId);
      if (!activeGame) return;
      activeGame.titanOverpowerUntil[playerSocketId] = 0;
      clearTitanOverpowerForPlayer(activeGame, playerSocketId);
      activeGame.titanOverpowerTimeout[playerSocketId] = null;

      const activeOpponent = getOpponent(activeGame, playerSocketId);
      emitUltimateEnded(
        activeGame,
        playerSocketId,
        activeOpponent?.socketId ?? opponent.socketId,
        { by: "you", target: "you", type: "overpower", effect: "overpower_ended" },
        { by: "opponent", target: "opponent", type: "overpower", effect: "overpower_ended" }
      );
    }, durationMs);

    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      { by: "you", target: "you", type: ultimateType, effect: "overpower_active", durationMs },
      { by: "opponent", target: "opponent", type: ultimateType, effect: "overpower_active", durationMs }
    );
    return;
  }

  if (ultimateType === "double") {
    const durationMs = getUltimateDurationMs(ultimateType);
    game.infernoPending[playerSocketId] = true;
    game.infernoPendingUntil[playerSocketId] = now + durationMs;
    clearInfernoBurnForPlayer(game, playerSocketId);
    clearTimeout(game.infernoTimeout[playerSocketId]);
    if (game.infernoBurnInterval[playerSocketId]) {
      clearInterval(game.infernoBurnInterval[playerSocketId]);
      game.infernoBurnInterval[playerSocketId] = null;
    }
    game.infernoTimeout[playerSocketId] = setTimeout(() => {
      const activeGame = activeGames.get(roomId);
      if (!activeGame) return;
      if (!activeGame.infernoPending[playerSocketId]) return;
      activeGame.infernoPending[playerSocketId] = false;
      activeGame.infernoPendingUntil[playerSocketId] = 0;
      clearInfernoBurnForPlayer(activeGame, playerSocketId);
      activeGame.infernoTimeout[playerSocketId] = null;
      if (activeGame.infernoBurnInterval[playerSocketId]) {
        clearInterval(activeGame.infernoBurnInterval[playerSocketId]);
        activeGame.infernoBurnInterval[playerSocketId] = null;
      }
      emitUltimateEnded(
        activeGame,
        playerSocketId,
        opponent.socketId,
        { by: "you", target: "you", type: "double", effect: "blaze_surge_ended" },
        { by: "opponent", target: "opponent", type: "double", effect: "blaze_surge_ended" }
      );
    }, durationMs);
    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      { by: "you", target: "you", type: ultimateType, effect: "blaze_surge_active", durationMs },
      { by: "opponent", target: "opponent", type: ultimateType, effect: "blaze_surge_active", durationMs }
    );
    return;
  }

  if (ultimateType === "shield") {
    const durationMs = getUltimateDurationMs(ultimateType);
    game.fortressUntil[playerSocketId] = now + durationMs;
    game.aegisAbsorbedDamage[playerSocketId] = 0;
    game.fortressBlocksRemaining[playerSocketId] = 0;
    clearTimeout(game.fortressTimeout[playerSocketId]);
    game.fortressTimeout[playerSocketId] = setTimeout(() => {
      const activeGame = activeGames.get(roomId);
      if (!activeGame) {
        return;
      }

      const activeOpponent = getOpponent(activeGame, playerSocketId);
      const absorbedDamage = Math.max(0, activeGame.aegisAbsorbedDamage[playerSocketId] ?? 0);
      const shockwaveDamage = absorbedDamage > 0 ? Math.min(5, 1 + Math.floor(absorbedDamage / 8)) : 0;

      activeGame.fortressUntil[playerSocketId] = 0;
      activeGame.fortressBlocksRemaining[playerSocketId] = 0;
      activeGame.aegisAbsorbedDamage[playerSocketId] = 0;
      activeGame.fortressTimeout[playerSocketId] = null;

      let knockedOutOpponent = false;
      if (
        activeOpponent &&
        !activeGame.eliminated[activeOpponent.socketId] &&
        shockwaveDamage > 0
      ) {
        const blockedByProtection = consumeIncomingProtection(activeGame, activeOpponent.socketId);
        if (blockedByProtection) {
          io.to(playerSocketId).emit("shieldBlocked", {
            by: "you",
            target: "opponent",
            blockedType: "aegis_shockwave",
            ...buildPlayerPowerState(activeGame, playerSocketId)
          });
          io.to(activeOpponent.socketId).emit("shieldBlocked", {
            by: "opponent",
            target: "you",
            blockedType: "aegis_shockwave",
            ...buildPlayerPowerState(activeGame, activeOpponent.socketId)
          });
        } else {
          const nextHp = Math.max(0, (activeGame.hp?.[activeOpponent.socketId] ?? MAX_HP) - shockwaveDamage);
          activeGame.hp[activeOpponent.socketId] = nextHp;
          knockedOutOpponent = nextHp <= 0;
        }
      }

      emitUltimateEnded(
        activeGame,
        playerSocketId,
        activeOpponent?.socketId ?? playerSocketId,
        { by: "you", target: "you", type: "shield", effect: "aegis_domain_ended", shockwaveDamage },
        {
          by: "opponent",
          target: "opponent",
          type: "shield",
          effect: "aegis_domain_ended",
          shockwaveDamage
        }
      );

      if (knockedOutOpponent && activeOpponent) {
        void finishGame(roomId, {
          forceWinnerSocketId: playerSocketId,
          endCondition: "ko",
          reason: `${activeGame.players.find((p) => p.socketId === playerSocketId)?.name ?? "Guardian"} detonates Aegis Domain for the KO.`
        });
      }
    }, durationMs);

    emitUltimateApplied(
      game,
      roomId,
      playerSocketId,
      opponent.socketId,
      { by: "you", target: "you", type: ultimateType, effect: "aegis_domain_active", durationMs },
      { by: "opponent", target: "opponent", type: ultimateType, effect: "aegis_domain_active", durationMs }
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

  // Allow emotes during countdown + live play (feels "in-game" to users).
  // Previously we only allowed phase === "playing", which made emotes look broken
  // during the countdown and other brief non-playing transitions.
  if (!game || (game.phase !== "playing" && game.phase !== "countdown" && game.phase !== "finished")) {
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

    if (game.phase !== "playing") {
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

    if (isCorrectAnswer(answer, currentQuestion)) {
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

// Keep the process alive if a rogue event handler throws or rejects.
// Without these, a single TypeError (e.g. missing game state field) crashes
// the entire server and causes Render to restart it — producing a window where
// all requests return 502 with no CORS headers, which browsers surface as a
// CORS policy error even though the CORS config itself is correct.
process.on("uncaughtException", (error) => {
  console.error("[server] uncaughtException — server kept alive:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection — server kept alive:", reason);
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] Socket.io game server running on http://${HOST}:${PORT}`);
  console.log(`[server] leaderboard endpoint available at /leaderboard`);
  console.log(`[server] default rating = ${DEFAULT_RATING}`);
});
