const { supabaseAdmin } = require("./supabase");
const AVATARS = require("../../../packages/shared/avatars.json");
const COSMETICS = require("../../../packages/shared/cosmetics.json");

const DEFAULT_RATING = 1000;
const VALID_AVATAR_IDS = new Set((AVATARS ?? []).map((avatar) => avatar.id));
const VALID_STREAK_EFFECT_IDS = new Set((COSMETICS.streakEffects ?? []).map((e) => e.id));
const VALID_EMOTE_PACK_IDS = new Set((COSMETICS.emotePacks ?? []).map((p) => p.id));

function deriveResultFromScores(yourScore, opponentScore) {
  if (yourScore > opponentScore) return "win";
  if (yourScore < opponentScore) return "loss";
  return "draw";
}

function normalizeAvatarId(value) {
  if (typeof value === "string" && VALID_AVATAR_IDS.has(value)) {
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

function normalizeStreakEffectId(value) {
  if (typeof value === "string" && VALID_STREAK_EFFECT_IDS.has(value)) return value;
  return "none";
}

function normalizeEmotePackId(value) {
  if (typeof value === "string" && VALID_EMOTE_PACK_IDS.has(value)) return value;
  return "starter";
}

const COSMETICS_DEFAULT = { streakEffect: "none", emotePack: "starter" };

/**
 * Fetch cosmetic fields for a player by their internal UUID.
 *
 * This query is intentionally isolated from the main player queries so that
 * if the DB columns do not exist yet (migration not applied), it returns safe
 * defaults instead of crashing joinQueue / leaderboard.
 *
 * Postgres error 42703 = "column does not exist".
 */
async function getPlayerCosmetics(playerId) {
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("streak_effect, emote_pack, auth_user_id")
    .eq("id", playerId)
    .maybeSingle();

  if (error) {
    // Columns may not exist yet — degrade gracefully
    if (process.env.NODE_ENV !== "production") {
      console.warn("[persistence] getPlayerCosmetics failed (columns missing?), using defaults:", error.message);
    }
    return COSMETICS_DEFAULT;
  }

  const streakEffect = normalizeStreakEffectId(data?.streak_effect ?? null);
  let emotePack = normalizeEmotePackId(data?.emote_pack ?? null);

  // Ownership enforcement (paid packs only usable if owned).
  // Source of truth is public.user_emote_packs, written by Stripe webhook via service role.
  const authUserId = data?.auth_user_id ?? null;
  if (authUserId && emotePack !== "starter") {
    const { data: ownedRows, error: ownedError } = await supabaseAdmin
      .from("user_emote_packs")
      .select("pack_id")
      .eq("user_id", authUserId);

    if (ownedError) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[persistence] user_emote_packs query failed, forcing starter:", ownedError.message);
      }
      emotePack = "starter";
    } else {
      const owned = new Set(["starter", ...(ownedRows ?? []).map((r) => r.pack_id)]);
      if (!owned.has(emotePack)) {
        emotePack = "starter";
      }
    }
  }

  return { streakEffect, emotePack };
}

function isNoRowsError(error) {
  return error && (error.code === "PGRST116" || error.details?.includes("0 rows"));
}

async function getPlayerByUsername(username) {
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("id, username, display_name")
    .eq("display_name", username)
    .maybeSingle();

  if (error && !isNoRowsError(error)) {
    throw error;
  }

  return data ?? null;
}

async function createPlayer(username) {
  const { data, error } = await supabaseAdmin
    .from("players")
    .insert({ username, display_name: username })
    .select("id, username, display_name")
    .single();

  if (!error) {
    return data;
  }

  if (error.code === "23505") {
    return getPlayerByUsername(username);
  }

  throw error;
}

async function findOrCreatePlayer(username) {
  const existingPlayer = await getPlayerByUsername(username);

  if (existingPlayer) {
    return existingPlayer;
  }

  return createPlayer(username);
}

async function getRatingRecord(playerId, topic) {
  const { data, error } = await supabaseAdmin
    .from("ratings")
    .select("id, player_id, topic, rating")
    .eq("player_id", playerId)
    .eq("topic", topic)
    .maybeSingle();

  if (error && !isNoRowsError(error)) {
    throw error;
  }

  return data ?? null;
}

async function createRating(playerId, topic) {
  const { data, error } = await supabaseAdmin
    .from("ratings")
    .insert({
      player_id: playerId,
      topic,
      rating: DEFAULT_RATING
    })
    .select("id, player_id, topic, rating")
    .single();

  if (!error) {
    return data;
  }

  if (error.code === "23505") {
    return getRatingRecord(playerId, topic);
  }

  throw error;
}

async function getOrCreateRating(playerId, topic) {
  const existingRating = await getRatingRecord(playerId, topic);

  if (existingRating) {
    return existingRating;
  }

  return createRating(playerId, topic);
}

function sanitizeUsername(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
}

function buildCandidateUsername(authUser) {
  const metadata = authUser.user_metadata ?? {};
  const emailPrefix =
    typeof authUser.email === "string" && authUser.email.includes("@")
      ? authUser.email.split("@")[0]
      : "";

  return sanitizeUsername(
    metadata.display_name ??
      metadata.user_name ??
      metadata.preferred_username ??
      metadata.full_name ??
      metadata.name ??
      emailPrefix ??
      `player-${authUser.id.slice(0, 8)}`
  );
}

async function findPlayerByAuthUserId(authUserId) {
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("id, username, display_name, auth_user_id, avatar_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error && !isNoRowsError(error)) {
    throw error;
  }

  return data ?? null;
}

async function findPlayerByUsername(username) {
  const { data, error } = await supabaseAdmin
    .from("players")
    .select("id, username, display_name, auth_user_id, avatar_id")
    .eq("display_name", username)
    .maybeSingle();

  if (error && !isNoRowsError(error)) {
    throw error;
  }

  return data ?? null;
}

async function reserveUsername(baseUsername, authUserId) {
  const fallbackBase = sanitizeUsername(baseUsername) || `Guest-${authUserId.slice(0, 4).toUpperCase()}`;

  for (let index = 0; index < 10; index += 1) {
    const suffix = index === 0 ? "" : `-${authUserId.slice(0, 4 + index)}`;
    const candidate = sanitizeUsername(`${fallbackBase}${suffix}`);
    const existingPlayer = await findPlayerByUsername(candidate);

    if (!existingPlayer || existingPlayer.auth_user_id === authUserId) {
      return candidate;
    }
  }

  return sanitizeUsername(`player-${authUserId.slice(0, 8)}`);
}

async function findOrCreatePlayerFromAuthUser(authUser) {
  const existingPlayer = await findPlayerByAuthUserId(authUser.id);
  const desiredUsername = await reserveUsername(buildCandidateUsername(authUser), authUser.id);

  if (existingPlayer) {
    return existingPlayer;
  }

  const { data, error } = await supabaseAdmin
    .from("players")
    .insert({
      auth_user_id: authUser.id,
      username: desiredUsername,
      display_name: desiredUsername
    })
    .select("id, username, display_name, auth_user_id, avatar_id")
    .single();

  if (!error) {
    return data;
  }

  if (error.code === "23505") {
    return findPlayerByAuthUserId(authUser.id);
  }

  throw error;
}

async function updateRatingsAfterMatch({ topic, playerOneId, playerTwoId, playerOneRating, playerTwoRating }) {
  const { error } = await supabaseAdmin.from("ratings").upsert(
    [
      {
        player_id: playerOneId,
        topic,
        rating: playerOneRating
      },
      {
        player_id: playerTwoId,
        topic,
        rating: playerTwoRating
      }
    ],
    {
      onConflict: "player_id,topic"
    }
  );

  if (error) {
    throw error;
  }
}

async function saveMatch({
  topic,
  player1Id,
  player2Id,
  player1Score,
  player2Score,
  winnerPlayerId,
  player1RatingChange,
  player2RatingChange
}) {
  const { error } = await supabaseAdmin.from("matches").insert({
    topic,
    player1_id: player1Id,
    player2_id: player2Id,
    player1_score: player1Score,
    player2_score: player2Score,
    winner_player_id: winnerPlayerId,
    player1_rating_change: player1RatingChange,
    player2_rating_change: player2RatingChange
  });

  if (error) {
    throw error;
  }
}

function buildRankedRows(rows) {
  const sorted = [...rows].sort((left, right) => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }
    const nameCompare = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.playerId.localeCompare(right.playerId);
  });

  let lastRating = null;
  let lastRank = 0;
  return sorted.map((entry, index) => {
    if (lastRating !== entry.rating) {
      lastRank = index + 1;
      lastRating = entry.rating;
    }
    return {
      ...entry,
      rank: lastRank
    };
  });
}

async function getLeaderboard(options = {}) {
  const topic = options.topic;
  const authUserId = options.authUserId ?? null;
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : 100;

  let ratingsQuery = supabaseAdmin.from("ratings").select("player_id, topic, rating");
  if (topic) {
    ratingsQuery = ratingsQuery.eq("topic", topic);
  }

  const { data: ratings, error: ratingsError } = await ratingsQuery;

  if (ratingsError) {
    throw ratingsError;
  }

  if (!ratings || ratings.length === 0) {
    return {
      leaderboard: [],
      myRank: null
    };
  }

  let uniqueRatings;
  if (topic) {
    const topicMap = new Map();
    for (const entry of ratings) {
      const previous = topicMap.get(entry.player_id);
      if (!previous || entry.rating > previous.rating) {
        topicMap.set(entry.player_id, entry);
      }
    }
    uniqueRatings = [...topicMap.values()];
  } else {
    const globalMap = new Map();
    for (const entry of ratings) {
      const previous = globalMap.get(entry.player_id);
      if (
        !previous ||
        entry.rating > previous.rating ||
        (entry.rating === previous.rating && entry.topic.localeCompare(previous.topic) < 0)
      ) {
        globalMap.set(entry.player_id, entry);
      }
    }
    uniqueRatings = [...globalMap.values()];
  }

  const playerIds = [...new Set(uniqueRatings.map((entry) => entry.player_id))];
  const { data: players, error: playersError } = await supabaseAdmin
    .from("players")
    .select("id, username, display_name, avatar_id")
    .in("id", playerIds);

  if (playersError) {
    throw playersError;
  }

  const playerMap = new Map(
    (players ?? []).map((player) => [
      player.id,
      { username: player.display_name ?? player.username, avatarId: normalizeAvatarId(player.avatar_id) }
    ])
  );

  const rankedRows = buildRankedRows(uniqueRatings.map((entry) => ({
    playerId: entry.player_id,
    name: playerMap.get(entry.player_id)?.username ?? "Unknown Player",
    avatarId: playerMap.get(entry.player_id)?.avatarId ?? "flash",
    rating: entry.rating,
    topic: entry.topic
  })));

  let myRank = null;
  if (authUserId) {
    const currentPlayer = await findPlayerByAuthUserId(authUserId);
    if (currentPlayer) {
      const currentRow = rankedRows.find((row) => row.playerId === currentPlayer.id);
      if (currentRow) {
        myRank = currentRow;
      }
    }
  }

  return {
    leaderboard: rankedRows.slice(0, limit),
    myRank
  };
}

async function getProfileSummary(authUserId) {
  const player = await findPlayerByAuthUserId(authUserId);

  if (!player) {
    return null;
  }

  const [{ data: ratings, error: ratingsError }, { data: matches, error: matchesError }] =
    await Promise.all([
      supabaseAdmin
        .from("ratings")
        .select("topic, rating")
        .eq("player_id", player.id)
        .order("rating", { ascending: false }),
      supabaseAdmin
        .from("matches")
        .select(
          "id, topic, player1_id, player2_id, player1_score, player2_score, winner_player_id, player1_rating_change, player2_rating_change, created_at"
        )
        .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

  if (ratingsError) {
    throw ratingsError;
  }

  if (matchesError) {
    throw matchesError;
  }

  const matchRows = matches ?? [];
  const opponentIds = [
    ...new Set(
      matchRows.map((match) =>
        match.player1_id === player.id ? match.player2_id : match.player1_id
      )
    )
  ];

  let opponentMap = new Map();

  if (opponentIds.length > 0) {
    const { data: opponents, error: opponentsError } = await supabaseAdmin
      .from("players")
      .select("id, username, display_name")
      .in("id", opponentIds);

    if (opponentsError) {
      throw opponentsError;
    }

    opponentMap = new Map(
      (opponents ?? []).map((opponent) => [opponent.id, opponent.display_name ?? opponent.username])
    );
  }

  const resultRows = matchRows.map((match) => {
    const isPlayerOne = match.player1_id === player.id;
    const yourScore = isPlayerOne ? match.player1_score : match.player2_score;
    const opponentScore = isPlayerOne ? match.player2_score : match.player1_score;
    return deriveResultFromScores(yourScore, opponentScore);
  });
  const wins = resultRows.filter((result) => result === "win").length;
  const draws = resultRows.filter((result) => result === "draw").length;
  const losses = resultRows.filter((result) => result === "loss").length;
  const winRate = matchRows.length > 0 ? Math.round((wins / matchRows.length) * 100) : 0;
  const sortedRatings = (ratings ?? []).sort((left, right) => right.rating - left.rating);
  const highestRatedTopic = sortedRatings[0]?.topic ?? null;

  const cosmetics = await getPlayerCosmetics(player.id);

  return {
    username: player.display_name ?? player.username,
    displayName: player.display_name ?? player.username,
    avatarId: normalizeAvatarId(player.avatar_id),
    streakEffect: cosmetics.streakEffect,
    emotePack: cosmetics.emotePack,
    summary: {
      totalMatches: matchRows.length,
      wins,
      losses,
      draws,
      winRate,
      highestRatedTopic,
      highestRating: sortedRatings[0]?.rating ?? DEFAULT_RATING
    },
    ratings: sortedRatings,
    matches: matchRows.map((match) => {
      const isPlayerOne = match.player1_id === player.id;
      const opponentId = isPlayerOne ? match.player2_id : match.player1_id;
      const ratingChange = isPlayerOne
        ? match.player1_rating_change ?? 0
        : match.player2_rating_change ?? 0;

      return {
        id: match.id,
        topic: match.topic,
        opponentName: opponentMap.get(opponentId) ?? "Unknown Player",
        score: {
          you: isPlayerOne ? match.player1_score : match.player2_score,
          opponent: isPlayerOne ? match.player2_score : match.player1_score
        },
        result: deriveResultFromScores(
          isPlayerOne ? match.player1_score : match.player2_score,
          isPlayerOne ? match.player2_score : match.player1_score
        ),
        ratingChange,
        createdAt: match.created_at
      };
    })
  };
}

module.exports = {
  DEFAULT_RATING,
  findOrCreatePlayer,
  findOrCreatePlayerFromAuthUser,
  getOrCreateRating,
  updateRatingsAfterMatch,
  saveMatch,
  getLeaderboard,
  getProfileSummary,
  getPlayerCosmetics,
  normalizeStreakEffectId,
  normalizeEmotePackId
};
