require("dotenv").config({ path: __dirname + "/.env" });

const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { URL } = require("node:url");
const EMOTES = require("../../packages/shared/emotes.json");
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

const ALLOWED_ORIGINS = [
  "https://math-battle-web.vercel.app",
  "http://localhost:3000",
  "http://192.168.1.102:3000",
];

console.log("MATHBATTLE BACKEND LIVE VERSION A2");
console.log("[server] PORT =", PORT);
console.log("[server] ALLOWED_ORIGINS =", ALLOWED_ORIGINS);
const MATCH_DURATION_MS = 60000;
const TIMER_UPDATE_INTERVAL_MS = 1000;
const QUESTION_DURATION_MS = 9000;
const FREEZE_DURATION_MS = 1600;
const SLOW_DURATION_MS = 1000;
const DOUBLE_POINTS_DURATION_MS = 6000;
const POWER_UP_COOLDOWN_MS = 3500;
const MAX_POWER_UP_USES_PER_MATCH = 3;
const EMOTE_COOLDOWN_MS = 1500;
const COUNTDOWN_STEPS = ["3", "2", "1", "GO"];
const COUNTDOWN_INTERVAL_MS = 1000;
const FAST_ANSWER_MS = 2000;
const K_FACTOR = 32;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const topicQueues = new Map();
const activeGames = new Map();
const customRooms = new Map();
const VALID_EMOTE_IDS = new Set(EMOTES.map((emote) => emote.id));
const POWER_UP_BY_ID = new Map(POWER_UPS.map((powerUp) => [powerUp.id, powerUp]));
const POWER_UP_EARN_ORDER = [...POWER_UPS]
  .filter((powerUp) => Number.isFinite(powerUp.earnStreak))
  .sort((a, b) => (b.earnStreak ?? 0) - (a.earnStreak ?? 0));
let roomCounter = 1;

function getAllowedOrigin(request) {
  const requestOrigin = request.headers.origin ?? "";
  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  return ALLOWED_ORIGINS[0];
}

function sendJson(request, response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getAllowedOrigin(request),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  });
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
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: false,
  },
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

function getNextQuestion(game) {
  const question = generateQuestion(game.topic, game.difficulty, game.roomId);
  game.questionIndex += 1;
  return question;
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

function clearQuestionTimer(game) {
  if (game.questionTimeout) {
    clearTimeout(game.questionTimeout);
    game.questionTimeout = null;
  }
}

function buildScoreMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildPowerUpMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, null]));
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

function buildPowerUpCooldownMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildPowerUpUsesMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function buildQuestionCompletionMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, false]));
}

function buildEmoteCooldownMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function clearMatchEffects(game) {
  game.powerUps = buildPowerUpMap(game.players);
  game.freezeUntil = buildFreezeMap(game.players);
  game.shieldActive = buildShieldMap(game.players);
  game.slowUntil = buildSlowMap(game.players);
  game.doublePointsUntil = buildDoublePointsMap(game.players);
  game.powerUpCooldownUntil = buildPowerUpCooldownMap(game.players);
  game.powerUpUsesCount = buildPowerUpUsesMap(game.players);
  game.emoteCooldownUntil = buildEmoteCooldownMap(game.players);
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

function getDurationForPowerUp(type) {
  const configuredDuration = POWER_UP_BY_ID.get(type)?.durationMs;

  if (Number.isFinite(configuredDuration)) {
    return configuredDuration;
  }

  if (type === "freeze") {
    return FREEZE_DURATION_MS;
  }

  if (type === "slow_opponent") {
    return SLOW_DURATION_MS;
  }

  if (type === "double_points") {
    return DOUBLE_POINTS_DURATION_MS;
  }

  return 0;
}

function pickEarnedPowerUp(streak) {
  for (const powerUp of POWER_UP_EARN_ORDER) {
    if (streak >= (powerUp.earnStreak ?? Number.MAX_SAFE_INTEGER)) {
      return powerUp.id;
    }
  }

  return null;
}

function buildPlayerPowerState(game, socketId) {
  const opponent = getOpponent(game, socketId);
  const opponentId = opponent?.socketId;

  return {
    powerUpAvailable: game.powerUps[socketId] ?? null,
    opponentPowerUpAvailable: opponentId ? game.powerUps[opponentId] ?? null : null,
    shieldActive: !!game.shieldActive[socketId],
    opponentShieldActive: opponentId ? !!game.shieldActive[opponentId] : false,
    slowedUntil: game.slowUntil[socketId] ?? 0,
    opponentSlowedUntil: opponentId ? game.slowUntil[opponentId] ?? 0 : 0,
    doublePointsUntil: game.doublePointsUntil[socketId] ?? 0,
    opponentDoublePointsUntil: opponentId ? game.doublePointsUntil[opponentId] ?? 0 : 0
  };
}

function markPowerUpUsed(game, socketId) {
  game.powerUpUsesCount[socketId] = (game.powerUpUsesCount[socketId] ?? 0) + 1;
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

    const winner =
      !game.questionWinnerSocketId
        ? null
        : game.questionWinnerSocketId === player.socketId
          ? "you"
          : "opponent";

    io.to(player.socketId).emit("questionState", {
      youAnswered: !!game.questionCompleted[player.socketId],
      opponentAnswered: !!game.questionCompleted[opponent.socketId],
      winner
    });
  }
}

function maybeAdvanceQuestion(roomId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  const allCompleted = game.players.every((player) => game.questionCompleted[player.socketId]);

  if (!allCompleted) {
    return;
  }

  clearQuestionTimer(game);
  emitNewQuestion(roomId);
}

function resetGameState(game) {
  game.questionIndex = 0;
  game.answeredCurrentQuestion = false;
  game.currentQuestion = null;
  game.questionCompleted = buildQuestionCompletionMap(game.players);
  game.questionWinnerSocketId = null;
  game.questionSentAt = null;
  game.startedAt = null;
  game.endsAt = null;
  game.phase = "countdown";
  game.scores = buildScoreMap(game.players);
  game.streaks = buildScoreMap(game.players);
  game.powerUps = buildPowerUpMap(game.players);
  game.freezeUntil = buildFreezeMap(game.players);
  game.shieldActive = buildShieldMap(game.players);
  game.slowUntil = buildSlowMap(game.players);
  game.doublePointsUntil = buildDoublePointsMap(game.players);
  game.powerUpCooldownUntil = buildPowerUpCooldownMap(game.players);
  game.powerUpUsesCount = buildPowerUpUsesMap(game.players);
  game.emoteCooldownUntil = buildEmoteCooldownMap(game.players);
  clearQuestionTimer(game);
  clearMatchTimer(game);
  game.rematchRequests = new Set();
}

function emitNewQuestion(roomId) {
  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  if (game.phase !== "countdown" && game.phase !== "playing") {
    return;
  }

  const currentQuestion = getNextQuestion(game);

  if (!currentQuestion) {
    return;
  }

  game.currentQuestion = currentQuestion;
  game.questionSentAt = Date.now();
  game.answeredCurrentQuestion = false;
  game.questionCompleted = buildQuestionCompletionMap(game.players);
  game.questionWinnerSocketId = null;
  game.phase = "playing";
  clearQuestionTimer(game);
  game.questionTimeout = setTimeout(() => {
    const activeGame = activeGames.get(roomId);

    if (!activeGame || activeGame.phase !== "playing") {
      return;
    }

    emitNewQuestion(roomId);
  }, QUESTION_DURATION_MS);

  const payload = { question: currentQuestion.prompt };
  console.log(`[server] newQuestion emitted -> room=${roomId}`, payload);
  io.to(roomId).emit("newQuestion", payload);
  emitQuestionState(roomId);
}

function startMatchTimer(roomId) {
  const game = activeGames.get(roomId);

  if (!game || game.startedAt) {
    return;
  }

  game.startedAt = Date.now();
  game.endsAt = game.startedAt + MATCH_DURATION_MS;

  io.to(roomId).emit("timerUpdate", buildTimerPayload(game));

  game.matchTimerInterval = setInterval(() => {
    const activeGame = activeGames.get(roomId);

    if (!activeGame) {
      clearMatchTimer(game);
      return;
    }

    const secondsLeft = Math.max(0, Math.ceil((activeGame.endsAt - Date.now()) / 1000));
    io.to(roomId).emit("timerUpdate", { secondsLeft });

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
  clearQuestionTimer(game);
  game.phase = "countdown";
  game.currentQuestion = null;
  game.answeredCurrentQuestion = true;

  let stepIndex = 0;

  const emitStep = () => {
    const value = COUNTDOWN_STEPS[stepIndex];

    if (!value) {
      clearCountdown(game);
      startMatchTimer(roomId);
      emitNewQuestion(roomId);
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

async function finishGame(roomId) {
  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  clearCountdown(game);
  clearQuestionTimer(game);
  clearMatchEffects(game);
  game.phase = "finished";
  game.currentQuestion = null;
  game.answeredCurrentQuestion = true;
  game.questionSentAt = null;
  game.rematchRequests = new Set();
  clearMatchTimer(game);

  const playerOne = game.players[0];
  const playerTwo = game.players[1];

  if (!playerOne || !playerTwo) {
    return;
  }

  const playerOneScore = game.scores[playerOne.socketId] ?? 0;
  const playerTwoScore = game.scores[playerTwo.socketId] ?? 0;
  const isDraw = playerOneScore === playerTwoScore;
  const winner = isDraw
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
  const message = isDraw
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

  if (game.questionCompleted[playerSocketId]) {
    return;
  }

  game.questionCompleted[playerSocketId] = true;
  const isFirstCorrect = !game.questionWinnerSocketId;

  if (!isFirstCorrect) {
    emitQuestionState(roomId);
    maybeAdvanceQuestion(roomId);
    return;
  }

  game.questionWinnerSocketId = playerSocketId;
  game.answeredCurrentQuestion = true;
  game.scores[playerSocketId] = (game.scores[playerSocketId] ?? 0) + pointsAwarded;
  game.streaks[playerSocketId] = (game.streaks[playerSocketId] ?? 0) + 1;

  if (!game.powerUps[playerSocketId] && !game.shieldActive[playerSocketId]) {
    const earnedPowerUp = pickEarnedPowerUp(game.streaks[playerSocketId]);

    if (earnedPowerUp) {
      game.powerUps[playerSocketId] = earnedPowerUp;
    }
  }

  const playerOneSocketId = game.players[0].socketId;
  const playerTwoSocketId = game.players[1].socketId;
  const fastAnswer =
    typeof game.questionSentAt === "number" && Date.now() - game.questionSentAt <= FAST_ANSWER_MS;
  const scorerSocketId = playerSocketId;

  console.log(`[server] pointScored emitted -> room=${roomId}`, {
    scorer: playerSocketId,
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
    pointsAwarded: scorerSocketId === playerOneSocketId ? pointsAwarded : 0,
    youAnswered: !!game.questionCompleted[playerOneSocketId],
    opponentAnswered: !!game.questionCompleted[playerTwoSocketId],
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
    pointsAwarded: scorerSocketId === playerTwoSocketId ? pointsAwarded : 0,
    youAnswered: !!game.questionCompleted[playerTwoSocketId],
    opponentAnswered: !!game.questionCompleted[playerOneSocketId],
    ...buildPlayerPowerState(game, playerTwoSocketId)
  });

  emitQuestionState(roomId);
  maybeAdvanceQuestion(roomId);
}

function handleIncorrectAnswer(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  game.streaks[playerSocketId] = 0;
}

function handleMissedQuestion(roomId, scorerSocketId) {
  const game = activeGames.get(roomId);

  if (!game) {
    return;
  }

  for (const player of game.players) {
    if (player.socketId !== scorerSocketId) {
      game.streaks[player.socketId] = 0;
    }
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
  clearQuestionTimer(game);
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
    avatar: player.avatar_id ?? "fox"
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
    questionIndex: 0,
    answeredCurrentQuestion: false,
    currentQuestion: null,
    questionCompleted: buildQuestionCompletionMap(players),
    questionWinnerSocketId: null,
    questionTimeout: null,
    questionSentAt: null,
    startedAt: null,
    endsAt: null,
    phase: "waiting",
    scores: buildScoreMap(players),
    streaks: buildScoreMap(players),
    powerUps: buildPowerUpMap(players),
    freezeUntil: buildFreezeMap(players),
    shieldActive: buildShieldMap(players),
    slowUntil: buildSlowMap(players),
    doublePointsUntil: buildDoublePointsMap(players),
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
    }
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
    }
  });

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

  if (game.powerUps[playerSocketId] !== "freeze") {
    return;
  }

  const opponent = getOpponent(game, playerSocketId);

  if (!opponent) {
    return;
  }

  if (isActiveUntil(game.freezeUntil[opponent.socketId]) || isActiveUntil(game.slowUntil[opponent.socketId])) {
    return;
  }

  if (game.shieldActive[opponent.socketId]) {
    game.powerUps[playerSocketId] = null;
    game.shieldActive[opponent.socketId] = false;
    game.powerUpCooldownUntil[playerSocketId] = Date.now() + POWER_UP_COOLDOWN_MS;
    markPowerUpUsed(game, playerSocketId);

    console.log(`[server] shieldBlocked emitted -> room=${roomId}`, {
      attacker: playerSocketId,
      defender: opponent.socketId
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

  game.powerUps[playerSocketId] = null;
  const durationMs = getDurationForPowerUp("freeze");
  game.freezeUntil[opponent.socketId] = Date.now() + durationMs;
  game.powerUpCooldownUntil[playerSocketId] = Date.now() + POWER_UP_COOLDOWN_MS;
  markPowerUpUsed(game, playerSocketId);

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

  if (game.powerUps[playerSocketId] !== "shield" || game.shieldActive[playerSocketId]) {
    return;
  }

  const opponent = getOpponent(game, playerSocketId);

  game.powerUps[playerSocketId] = null;
  game.shieldActive[playerSocketId] = true;
  game.powerUpCooldownUntil[playerSocketId] = Date.now() + POWER_UP_COOLDOWN_MS;
  markPowerUpUsed(game, playerSocketId);

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

  if (game.powerUps[playerSocketId] !== "double_points") {
    return;
  }

  game.powerUps[playerSocketId] = null;
  game.doublePointsUntil[playerSocketId] = Date.now() + getDurationForPowerUp("double_points");
  game.powerUpCooldownUntil[playerSocketId] = Date.now() + POWER_UP_COOLDOWN_MS;
  markPowerUpUsed(game, playerSocketId);

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

function useSlowOpponentPowerUp(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (game.powerUps[playerSocketId] !== "slow_opponent") {
    return;
  }

  const opponent = getOpponent(game, playerSocketId);

  if (!opponent) {
    return;
  }

  if (isActiveUntil(game.freezeUntil[opponent.socketId]) || isActiveUntil(game.slowUntil[opponent.socketId])) {
    return;
  }

  game.powerUps[playerSocketId] = null;
  game.slowUntil[opponent.socketId] = Date.now() + getDurationForPowerUp("slow_opponent");
  game.powerUpCooldownUntil[playerSocketId] = Date.now() + POWER_UP_COOLDOWN_MS;
  markPowerUpUsed(game, playerSocketId);

  io.to(playerSocketId).emit("powerUpUsed", {
    type: "slow_opponent",
    by: "you",
    target: "opponent",
    durationMs: getDurationForPowerUp("slow_opponent"),
    ...buildPlayerPowerState(game, playerSocketId)
  });

  io.to(opponent.socketId).emit("powerUpUsed", {
    type: "slow_opponent",
    by: "opponent",
    target: "you",
    durationMs: getDurationForPowerUp("slow_opponent"),
    ...buildPlayerPowerState(game, opponent.socketId)
  });
}

function useCleansePowerUp(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (game.powerUps[playerSocketId] !== "cleanse") {
    return;
  }

  const hadFreeze = isActiveUntil(game.freezeUntil[playerSocketId]);
  const hadSlow = isActiveUntil(game.slowUntil[playerSocketId]);

  if (!hadFreeze && !hadSlow) {
    return;
  }

  game.powerUps[playerSocketId] = null;
  game.freezeUntil[playerSocketId] = 0;
  game.slowUntil[playerSocketId] = 0;
  game.powerUpCooldownUntil[playerSocketId] = Date.now() + POWER_UP_COOLDOWN_MS;
  markPowerUpUsed(game, playerSocketId);

  const opponent = getOpponent(game, playerSocketId);

  io.to(playerSocketId).emit("powerUpUsed", {
    type: "cleanse",
    by: "you",
    target: "you",
    removedEffects: [hadFreeze ? "freeze" : null, hadSlow ? "slow_opponent" : null].filter(Boolean),
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

function useStealMomentumPowerUp(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (game.powerUps[playerSocketId] !== "steal_momentum") {
    return;
  }

  const opponent = getOpponent(game, playerSocketId);

  if (!opponent) {
    return;
  }

  game.powerUps[playerSocketId] = null;
  game.powerUpCooldownUntil[playerSocketId] = Date.now() + POWER_UP_COOLDOWN_MS;
  game.streaks[opponent.socketId] = 0;
  game.shieldActive[opponent.socketId] = false;
  game.doublePointsUntil[opponent.socketId] = 0;
  markPowerUpUsed(game, playerSocketId);

  io.to(playerSocketId).emit("powerUpUsed", {
    type: "steal_momentum",
    by: "you",
    target: "opponent",
    ...buildPlayerPowerState(game, playerSocketId)
  });

  io.to(opponent.socketId).emit("powerUpUsed", {
    type: "steal_momentum",
    by: "opponent",
    target: "you",
    ...buildPlayerPowerState(game, opponent.socketId)
  });
}

function handleSendEmote(roomId, playerSocketId, emoteId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing") {
    return;
  }

  if (!VALID_EMOTE_IDS.has(emoteId)) {
    return;
  }

  if ((game.emoteCooldownUntil[playerSocketId] ?? 0) > Date.now()) {
    return;
  }

  const opponent = getOpponent(game, playerSocketId);

  if (!opponent) {
    return;
  }

  game.emoteCooldownUntil[playerSocketId] = Date.now() + EMOTE_COOLDOWN_MS;
  console.log(`[server] emoteReceived emitted -> room=${roomId}`, {
    emoteId,
    from: playerSocketId,
    to: opponent.socketId
  });

  io.to(opponent.socketId).emit("emoteReceived", {
    emoteId,
    sender: "opponent"
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

  socket.on("submitAnswer", (answer) => {
    console.log(`[server] submitAnswer received -> id=${socket.id} answer=${answer}`);

    const roomId = socket.data.roomId;
    const game = roomId ? activeGames.get(roomId) : null;

    if (!game) {
      return;
    }

    if ((game.freezeUntil[socket.id] ?? 0) > Date.now()) {
      return;
    }

    if ((game.slowUntil[socket.id] ?? 0) > Date.now()) {
      return;
    }

    const currentQuestion = game.currentQuestion;

    if (!currentQuestion) {
      return;
    }

    if (game.questionCompleted[socket.id]) {
      return;
    }

    const hadDoublePoints = isActiveUntil(game.doublePointsUntil[socket.id]);

    if (normalizeAnswer(answer) === normalizeAnswer(currentQuestion.answer)) {
      if (hadDoublePoints) {
        game.doublePointsUntil[socket.id] = 0;
      }
      handleMissedQuestion(roomId, socket.id);
      handleCorrectAnswer(roomId, socket.id, hadDoublePoints ? 2 : 1);
      return;
    }

    handleIncorrectAnswer(roomId, socket.id);
    io.to(socket.id).emit("incorrectAnswer");
  });

  socket.on("requestRematch", () => {
    const roomId = socket.data.roomId;
    const game = roomId ? activeGames.get(roomId) : null;

    if (!game || game.phase !== "finished") {
      return;
    }

    game.rematchRequests.add(socket.id);
    console.log(`[server] requestRematch received -> id=${socket.id} room=${roomId}`);

    if (game.rematchRequests.size < game.players.length) {
      return;
    }

    resetGameState(game);
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

  socket.on("usePowerUp", (payload) => {
    const roomId = socket.data.roomId;

    if (!roomId) {
      return;
    }

    const game = activeGames.get(roomId);

    if (!game || game.phase !== "playing") {
      return;
    }

    if ((game.powerUpCooldownUntil[socket.id] ?? 0) > Date.now()) {
      return;
    }

    if ((game.powerUpUsesCount[socket.id] ?? 0) >= MAX_POWER_UP_USES_PER_MATCH) {
      return;
    }

    const type = payload?.type;

    if (!POWER_UP_BY_ID.has(type)) {
      return;
    }

    if (type === "freeze") {
      useFreezePowerUp(roomId, socket.id);
      return;
    }

    if (type === "shield") {
      useShieldPowerUp(roomId, socket.id);
      return;
    }

    if (type === "double_points") {
      useDoublePointsPowerUp(roomId, socket.id);
      return;
    }

    if (type === "slow_opponent") {
      useSlowOpponentPowerUp(roomId, socket.id);
      return;
    }

    if (type === "cleanse") {
      useCleansePowerUp(roomId, socket.id);
      return;
    }

    if (type === "steal_momentum") {
      useStealMomentumPowerUp(roomId, socket.id);
    }
  });

  socket.on("sendEmote", (payload) => {
    const roomId = socket.data.roomId;

    if (!roomId || !payload?.emoteId) {
      return;
    }

    handleSendEmote(roomId, socket.id, payload.emoteId);
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
