require("dotenv").config({ path: __dirname + "/.env" });

const { createServer } = require("node:http");
const { Server } = require("socket.io");
const { URL } = require("node:url");
const EMOTES = require("../../packages/shared/emotes.json");
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
const FREEZE_DURATION_MS = 2000;
const EMOTE_COOLDOWN_MS = 1500;
const FREEZE_STREAK_THRESHOLD = 3;
const SHIELD_STREAK_THRESHOLD = 5;
const COUNTDOWN_STEPS = ["3", "2", "1", "GO"];
const COUNTDOWN_INTERVAL_MS = 1000;
const FAST_ANSWER_MS = 2000;
const K_FACTOR = 32;

const topicQueues = new Map();
const activeGames = new Map();
const VALID_EMOTE_IDS = new Set(EMOTES.map((emote) => emote.id));
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

function buildEffectTimerMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, null]));
}

function buildEmoteCooldownMap(players) {
  return Object.fromEntries(players.map((player) => [player.socketId, 0]));
}

function clearEffectTimers(game) {
  if (!game.effectTimers) {
    return;
  }

  for (const timer of Object.values(game.effectTimers)) {
    if (timer) {
      clearTimeout(timer);
    }
  }

  game.effectTimers = buildEffectTimerMap(game.players);
}

function clearMatchEffects(game) {
  clearEffectTimers(game);
  game.powerUps = buildPowerUpMap(game.players);
  game.freezeUntil = buildFreezeMap(game.players);
  game.shieldActive = buildShieldMap(game.players);
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

function resetGameState(game) {
  game.questionIndex = 0;
  game.answeredCurrentQuestion = false;
  game.currentQuestion = null;
  game.questionSentAt = null;
  game.startedAt = null;
  game.endsAt = null;
  game.phase = "countdown";
  game.scores = buildScoreMap(game.players);
  game.streaks = buildScoreMap(game.players);
  game.powerUps = buildPowerUpMap(game.players);
  game.freezeUntil = buildFreezeMap(game.players);
  game.shieldActive = buildShieldMap(game.players);
  game.emoteCooldownUntil = buildEmoteCooldownMap(game.players);
  clearEffectTimers(game);
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
  game.phase = "playing";

  const payload = { question: currentQuestion.prompt };
  console.log(`[server] newQuestion emitted -> room=${roomId}`, payload);
  io.to(roomId).emit("newQuestion", payload);
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
}

function handleCorrectAnswer(roomId, playerSocketId) {
  const game = activeGames.get(roomId);

  if (!game || game.phase !== "playing" || game.answeredCurrentQuestion) {
    return;
  }

  game.answeredCurrentQuestion = true;
  game.scores[playerSocketId] = (game.scores[playerSocketId] ?? 0) + 1;
  game.streaks[playerSocketId] = (game.streaks[playerSocketId] ?? 0) + 1;
  if (!game.powerUps[playerSocketId] && !game.shieldActive[playerSocketId]) {
    if (game.streaks[playerSocketId] >= SHIELD_STREAK_THRESHOLD) {
      game.powerUps[playerSocketId] = "shield";
    } else if (game.streaks[playerSocketId] >= FREEZE_STREAK_THRESHOLD) {
      game.powerUps[playerSocketId] = "freeze";
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
    powerUpAvailable: game.powerUps[playerOneSocketId],
    opponentPowerUpAvailable: game.powerUps[playerTwoSocketId],
    shieldActive: game.shieldActive[playerOneSocketId],
    opponentShieldActive: game.shieldActive[playerTwoSocketId]
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
    powerUpAvailable: game.powerUps[playerTwoSocketId],
    opponentPowerUpAvailable: game.powerUps[playerOneSocketId],
    shieldActive: game.shieldActive[playerTwoSocketId],
    opponentShieldActive: game.shieldActive[playerOneSocketId]
  });

  if (game.phase === "playing") {
    emitNewQuestion(roomId);
  }
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
  clearMatchEffects(game);

  const remainingPlayer = game.players.find((player) => player.socketId !== socket.id);

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
    }
  }

  activeGames.delete(roomId);
}

async function queuePlayer(socket, topic, difficulty, accessToken) {
  removeFromQueues(socket.id);

  socket.data.roomId = undefined;
  socket.data.topic = topic;
  socket.data.difficulty = difficulty;
  const authUser = await verifyAccessToken(accessToken);
  const player = await findOrCreatePlayerFromAuthUser(authUser);
  const rating = await getOrCreateRating(player.id, topic);
  const queueKey = `${topic}:${difficulty}`;
  const queue = topicQueues.get(queueKey) ?? [];
  const queuedPlayer = {
    socketId: socket.id,
    playerId: player.id,
    name: player.display_name ?? player.username,
    rating: rating.rating,
    avatar: player.avatar_id ?? "fox"
  };

  queue.push(queuedPlayer);
  topicQueues.set(queueKey, queue);

  if (queue.length < 2) {
    return;
  }

  const players = queue.splice(0, 2);
  topicQueues.set(queueKey, queue);

  const roomId = `room-${roomCounter++}`;
  const game = {
    roomId,
    topic,
    difficulty,
    players,
    questionIndex: 0,
    answeredCurrentQuestion: false,
    currentQuestion: null,
    questionSentAt: null,
    startedAt: null,
    endsAt: null,
    phase: "waiting",
    scores: buildScoreMap(players),
    streaks: buildScoreMap(players),
    powerUps: buildPowerUpMap(players),
    freezeUntil: buildFreezeMap(players),
    shieldActive: buildShieldMap(players),
    emoteCooldownUntil: buildEmoteCooldownMap(players),
    effectTimers: buildEffectTimerMap(players),
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
    playerSocket.data.topic = topic;
    playerSocket.data.difficulty = difficulty;
  }

  console.log(`[server] matchFound emitted -> room=${roomId}`, {
    players: players.map((entry) => entry.socketId),
    topic
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

  if ((game.freezeUntil[opponent.socketId] ?? 0) > Date.now()) {
    return;
  }

  if (game.shieldActive[opponent.socketId]) {
    game.powerUps[playerSocketId] = null;
    game.shieldActive[opponent.socketId] = false;

    console.log(`[server] shieldBlocked emitted -> room=${roomId}`, {
      attacker: playerSocketId,
      defender: opponent.socketId
    });

    io.to(playerSocketId).emit("shieldBlocked", {
      by: "opponent",
      target: "opponent",
      blockedType: "freeze",
      powerUpAvailable: false,
      opponentPowerUpAvailable: game.powerUps[opponent.socketId],
      shieldActive: false,
      opponentShieldActive: false
    });

    io.to(opponent.socketId).emit("shieldBlocked", {
      by: "you",
      target: "you",
      blockedType: "freeze",
      powerUpAvailable: game.powerUps[opponent.socketId],
      opponentPowerUpAvailable: false,
      shieldActive: false,
      opponentShieldActive: false
    });

    return;
  }

  game.powerUps[playerSocketId] = null;
  game.freezeUntil[opponent.socketId] = Date.now() + FREEZE_DURATION_MS;

  if (game.effectTimers[opponent.socketId]) {
    clearTimeout(game.effectTimers[opponent.socketId]);
  }

  game.effectTimers[opponent.socketId] = setTimeout(() => {
    const activeGame = activeGames.get(roomId);

    if (!activeGame) {
      return;
    }

    activeGame.freezeUntil[opponent.socketId] = 0;
    activeGame.effectTimers[opponent.socketId] = null;
  }, FREEZE_DURATION_MS);

  console.log(`[server] powerUpUsed emitted -> room=${roomId}`, {
    type: "freeze",
    by: playerSocketId,
    target: opponent.socketId
  });

  io.to(playerSocketId).emit("powerUpUsed", {
    type: "freeze",
    by: "you",
    target: "opponent",
    durationMs: FREEZE_DURATION_MS,
    powerUpAvailable: false,
    opponentPowerUpAvailable: game.powerUps[opponent.socketId],
    shieldActive: game.shieldActive[playerSocketId],
    opponentShieldActive: game.shieldActive[opponent.socketId]
  });

  io.to(opponent.socketId).emit("powerUpUsed", {
    type: "freeze",
    by: "opponent",
    target: "you",
    durationMs: FREEZE_DURATION_MS,
    powerUpAvailable: game.powerUps[opponent.socketId],
    opponentPowerUpAvailable: false,
    shieldActive: game.shieldActive[opponent.socketId],
    opponentShieldActive: game.shieldActive[playerSocketId]
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

  io.to(playerSocketId).emit("shieldActivated", {
    by: "you",
    powerUpAvailable: false,
    opponentPowerUpAvailable: opponent ? game.powerUps[opponent.socketId] : null,
    shieldActive: true,
    opponentShieldActive: opponent ? game.shieldActive[opponent.socketId] : false
  });

  if (opponent) {
    io.to(opponent.socketId).emit("shieldActivated", {
      by: "opponent",
      powerUpAvailable: game.powerUps[opponent.socketId],
      opponentPowerUpAvailable: false,
      shieldActive: game.shieldActive[opponent.socketId],
      opponentShieldActive: true
    });
  }
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

    const currentQuestion = game.currentQuestion;

    if (!currentQuestion) {
      return;
    }

    if (normalizeAnswer(answer) === normalizeAnswer(currentQuestion.answer)) {
      handleMissedQuestion(roomId, socket.id);
      handleCorrectAnswer(roomId, socket.id);
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
    console.log(`[server] rematch starting -> room=${roomId}`);
    startCountdown(roomId);
  });

  socket.on("usePowerUp", (payload) => {
    const roomId = socket.data.roomId;

    if (!roomId) {
      return;
    }

    if (payload?.type === "freeze") {
      useFreezePowerUp(roomId, socket.id);
      return;
    }

    if (payload?.type === "shield") {
      useShieldPowerUp(roomId, socket.id);
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
    removeFromGame(socket);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log(`[server] Socket.io game server running on http://${HOST}:${PORT}`);
  console.log(`[server] leaderboard endpoint available at /leaderboard`);
  console.log(`[server] default rating = ${DEFAULT_RATING}`);
});
