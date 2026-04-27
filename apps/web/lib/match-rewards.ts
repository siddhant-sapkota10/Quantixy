// Match reward calculation — server-authoritative, shared types used by API + UI.

export const REWARD_CONSTANTS = {
  BASE_XP: 25,
  BASE_COINS: 10,
  WIN_XP: 25,
  WIN_COINS: 15,
  LOSS_XP: 10,
  LOSS_COINS: 5,
  DRAW_XP: 15,
  DRAW_COINS: 8,
  PER_CORRECT_XP: 1,
  CORRECT_COINS_EVERY: 3, // 1 coin per N correct answers
  STREAK_3_XP: 5,
  STREAK_5_XP: 10,
  KO_WIN_COINS: 5,
  COMEBACK_XP: 8, // win despite trailing at half
  AI_MULTIPLIER: 0.75, // 75% rewards for AI matches
} as const;

export type RewardBreakdown = {
  baseXp: number;
  baseCoins: number;
  resultXp: number;
  resultCoins: number;
  correctAnswerXp: number;
  correctAnswerCoins: number;
  streakXp: number;
  koCoins: number;
  comebackXp: number;
  totalXp: number;
  totalCoins: number;
  isAiMatch: boolean;
};

export type CalculateRewardsInput = {
  result: "win" | "loss" | "draw";
  correctAnswers: number;
  peakStreak: number;
  isKo?: boolean;
  isComeback?: boolean;
  isAiMatch?: boolean;
};

export function calculateMatchRewards(input: CalculateRewardsInput): RewardBreakdown {
  const { result, correctAnswers, peakStreak, isKo = false, isComeback = false, isAiMatch = false } = input;
  const C = REWARD_CONSTANTS;

  const baseXp = C.BASE_XP;
  const baseCoins = C.BASE_COINS;

  const resultXp = result === "win" ? C.WIN_XP : result === "draw" ? C.DRAW_XP : C.LOSS_XP;
  const resultCoins = result === "win" ? C.WIN_COINS : result === "draw" ? C.DRAW_COINS : C.LOSS_COINS;

  const correctAnswerXp = correctAnswers * C.PER_CORRECT_XP;
  const correctAnswerCoins = Math.floor(correctAnswers / C.CORRECT_COINS_EVERY);

  const streakXp = peakStreak >= 5 ? C.STREAK_5_XP : peakStreak >= 3 ? C.STREAK_3_XP : 0;

  const koCoins = isKo && result === "win" ? C.KO_WIN_COINS : 0;
  const comebackXp = isComeback && result === "win" ? C.COMEBACK_XP : 0;

  let rawXp = baseXp + resultXp + correctAnswerXp + streakXp + comebackXp;
  let rawCoins = baseCoins + resultCoins + correctAnswerCoins + koCoins;

  if (isAiMatch) {
    rawXp = Math.round(rawXp * C.AI_MULTIPLIER);
    rawCoins = Math.round(rawCoins * C.AI_MULTIPLIER);
  }

  const totalXp = Math.max(0, rawXp);
  const totalCoins = Math.max(0, rawCoins);

  return {
    baseXp,
    baseCoins,
    resultXp,
    resultCoins,
    correctAnswerXp,
    correctAnswerCoins,
    streakXp,
    koCoins,
    comebackXp,
    totalXp,
    totalCoins,
    isAiMatch,
  };
}

// ── Level progression ──────────────────────────────────────────────────────

/** XP required to advance FROM level `lv` to `lv + 1`. */
export function xpForLevel(lv: number): number {
  return 100 + (lv - 1) * 50;
}

/** Compute player level and progress within current level from total XP. */
export function computeLevel(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpNeeded: number;
  progressFraction: number;
} {
  let xp = Math.max(0, totalXp);
  let level = 1;
  while (true) {
    const needed = xpForLevel(level);
    if (xp < needed) break;
    xp -= needed;
    level += 1;
    if (level >= 9999) break;
  }
  const xpNeeded = xpForLevel(level);
  return {
    level,
    xpIntoLevel: xp,
    xpNeeded,
    progressFraction: xpNeeded > 0 ? xp / xpNeeded : 1,
  };
}

// ── Server claim response type ─────────────────────────────────────────────

export type MatchRewardsClaimResponse = {
  xpAwarded: number;
  coinsAwarded: number;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  wallet: { xp: number; coins: number; level: number };
  breakdown: RewardBreakdown;
};
