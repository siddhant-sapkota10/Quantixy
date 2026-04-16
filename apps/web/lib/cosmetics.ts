import cosmeticsData from "../../../packages/shared/cosmetics.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StreakEffectId = "none" | "fire" | "lightning";
export type EmotePackId = "basic";
export type UnlockType = "default" | "premium" | "achievement" | "seasonal";

export type StreakEffect = {
  id: StreakEffectId;
  name: string;
  description: string;
  previewLabel: string;
  unlockedByDefault: boolean;
  isPremium: boolean;
  unlockType: UnlockType;
};

export type EmotePack = {
  id: EmotePackId;
  name: string;
  description: string;
  previewLabel: string;
  unlockedByDefault: boolean;
  isPremium: boolean;
  unlockType: UnlockType;
  emoteIds: string[];
};

/**
 * A player's equipped cosmetic loadout.
 * Strictly visual — no gameplay logic lives here.
 * Avatar is kept separate: it is managed by the existing avatar system
 * which also governs ultimate abilities.
 */
export type PlayerCosmetics = {
  streakEffect: StreakEffectId;
  emotePack: EmotePackId;
};

export const DEFAULT_COSMETICS: PlayerCosmetics = {
  streakEffect: "none",
  emotePack: "basic",
};

// ─── Data ─────────────────────────────────────────────────────────────────────

export const STREAK_EFFECTS = cosmeticsData.streakEffects as StreakEffect[];
export const EMOTE_PACKS = cosmeticsData.emotePacks as EmotePack[];

export const STREAK_EFFECT_MAP = new Map<StreakEffectId, StreakEffect>(
  STREAK_EFFECTS.map((effect) => [effect.id, effect])
);

export const EMOTE_PACK_MAP = new Map<EmotePackId, EmotePack>(
  EMOTE_PACKS.map((pack) => [pack.id, pack])
);

// ─── Normalizers ──────────────────────────────────────────────────────────────

const VALID_STREAK_EFFECT_IDS = new Set<string>(STREAK_EFFECTS.map((e) => e.id));
const VALID_EMOTE_PACK_IDS = new Set<string>(EMOTE_PACKS.map((p) => p.id));

export function normalizeStreakEffectId(value: string | null | undefined): StreakEffectId {
  if (typeof value === "string" && VALID_STREAK_EFFECT_IDS.has(value)) {
    return value as StreakEffectId;
  }
  return "none";
}

export function normalizeEmotePackId(value: string | null | undefined): EmotePackId {
  if (typeof value === "string" && VALID_EMOTE_PACK_IDS.has(value)) {
    return value as EmotePackId;
  }
  return "basic";
}

// ─── Accessors ────────────────────────────────────────────────────────────────

export function getStreakEffect(id: string | null | undefined): StreakEffect {
  return (STREAK_EFFECT_MAP.get(normalizeStreakEffectId(id)) ?? STREAK_EFFECT_MAP.get("none")) as StreakEffect;
}

export function getEmotePack(id: string | null | undefined): EmotePack {
  return (EMOTE_PACK_MAP.get(normalizeEmotePackId(id)) ?? EMOTE_PACK_MAP.get("basic")) as EmotePack;
}

// ─── Streak effect visual config (consumed by PlayerPanel) ────────────────────

export type StreakEffectVisuals = {
  colorClass: string;
  /** Icon shown at "fire" streak level (≥3) */
  icon: string;
  /** Icon shown at "unstoppable" streak level (≥5) */
  maxIcon: string;
};

export const STREAK_EFFECT_VISUALS: Record<StreakEffectId, StreakEffectVisuals> = {
  none:      { colorClass: "text-sky-300",    icon: "⚡",  maxIcon: "🔥" },
  fire:      { colorClass: "text-orange-400", icon: "🔥",  maxIcon: "🔥" },
  lightning: { colorClass: "text-yellow-300", icon: "⚡",  maxIcon: "⚡" },
};

export function getStreakEffectVisuals(id: StreakEffectId | null | undefined): StreakEffectVisuals {
  return STREAK_EFFECT_VISUALS[normalizeStreakEffectId(id)] ?? STREAK_EFFECT_VISUALS.none;
}
