import ranksData from "../../../packages/shared/ranks.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RankId = "bronze" | "silver" | "gold" | "platinum" | "diamond" | "master";

type RankData = {
  id: string;
  name: string;
  minRating: number;
  shortLabel: string;
};

export type RankVisuals = {
  bgClass: string;
  textClass: string;
  borderClass: string;
  /** Solid fill used for progress bars — kept as literal strings for Tailwind JIT */
  progressClass: string;
};

export type Rank = RankData & RankVisuals & { id: RankId };

// ─── Visual mapping (Tailwind classes must be string literals for purging) ────

const RANK_VISUALS: Record<RankId, RankVisuals> = {
  bronze:   { bgClass: "bg-amber-900/50",  textClass: "text-amber-400",  borderClass: "border-amber-600/50",  progressClass: "bg-amber-500"  },
  // Silver uses slightly elevated slate so it reads as a rank, not generic UI text
  silver:   { bgClass: "bg-slate-600/35",  textClass: "text-slate-200",  borderClass: "border-slate-400/40",  progressClass: "bg-slate-300"  },
  gold:     { bgClass: "bg-yellow-500/20", textClass: "text-yellow-300", borderClass: "border-yellow-500/40", progressClass: "bg-yellow-400" },
  platinum: { bgClass: "bg-cyan-500/20",   textClass: "text-cyan-300",   borderClass: "border-cyan-500/40",   progressClass: "bg-cyan-400"   },
  diamond:  { bgClass: "bg-indigo-500/20", textClass: "text-indigo-300", borderClass: "border-indigo-500/40", progressClass: "bg-indigo-400" },
  master:   { bgClass: "bg-pink-500/20",   textClass: "text-pink-300",   borderClass: "border-pink-500/40",   progressClass: "bg-pink-400"   },
};

// ─── Data ─────────────────────────────────────────────────────────────────────

export const RANKS: Rank[] = (ranksData.ranks as RankData[]).map((r) => ({
  ...r,
  id: r.id as RankId,
  ...RANK_VISUALS[r.id as RankId],
}));

// Sorted descending for efficient tier lookup
const RANKS_DESC = [...RANKS].sort((a, b) => b.minRating - a.minRating);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derives the rank tier from a numeric rating. Always returns a valid Rank. */
export function getRankFromRating(rating: number): Rank {
  return RANKS_DESC.find((rank) => rating >= rank.minRating) ?? RANKS[0];
}

export type NextRankInfo = {
  nextRank: Rank | null;
  /** 0–1 fraction of progress through the current tier toward the next */
  progress: number;
  /** Rating points needed to reach the next tier; 0 if already at max */
  pointsNeeded: number;
};

/** Returns progress information toward the next rank tier. */
export function getNextRankInfo(rating: number): NextRankInfo {
  const currentRank = getRankFromRating(rating);
  const idx = RANKS.findIndex((r) => r.id === currentRank.id);
  const nextRank = RANKS[idx + 1] ?? null;

  if (!nextRank) {
    return { nextRank: null, progress: 1, pointsNeeded: 0 };
  }

  const rangeSize = nextRank.minRating - currentRank.minRating;
  const progressInRange = rating - currentRank.minRating;

  return {
    nextRank,
    progress: Math.min(1, Math.max(0, progressInRange / rangeSize)),
    pointsNeeded: nextRank.minRating - rating,
  };
}
