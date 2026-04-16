import avatarsJson from "../../../packages/shared/avatars.json";

export const AVATAR_IDS = ["flash", "shadow", "guardian", "inferno"] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];
export type AvatarRole = "Speed" | "Disrupt" | "Defense" | "Burst";
export type AvatarUltimateId = "rapid_fire" | "jam" | "shield" | "double";

export type AvatarUltimateMeta = {
  effectType: string;
  durationMs?: number;
  blocks?: number;
  bonusPoints?: number;
  minimumPoints?: number;
  chargeMultiplier?: number;
};

export type AvatarTheme = {
  accent: string;
  glow: string;
};

export type Avatar = {
  id: AvatarId;
  name: string;
  role: AvatarRole;
  icon: string;
  emoji: string;
  theme: AvatarTheme;
  description: string;
  passive: string;
  ultimateId: AvatarUltimateId;
  ultimateName: string;
  ultimateDescription: string;
  ultimateMeta: AvatarUltimateMeta;
};

export const AVATARS = avatarsJson as Avatar[];
export const AVATAR_MAP = new Map<AvatarId, Avatar>(AVATARS.map((avatar) => [avatar.id, avatar]));
export const DEFAULT_AVATAR_ID: AvatarId = "flash";
const LEGACY_AVATAR_FALLBACKS: Record<string, AvatarId> = {
  titan: "guardian",
  aegis: "guardian",
  frost: "guardian",
  volt: "flash",
  nova: "inferno"
};

export function isAvatarId(value: string | null | undefined): value is AvatarId {
  return Boolean(value && AVATAR_MAP.has(value as AvatarId));
}

export function normalizeAvatarId(value: string | null | undefined): AvatarId {
  if (isAvatarId(value)) {
    return value;
  }

  if (typeof value === "string") {
    return LEGACY_AVATAR_FALLBACKS[value.toLowerCase()] ?? DEFAULT_AVATAR_ID;
  }

  return DEFAULT_AVATAR_ID;
}

export function getAvatar(id: string | null | undefined): Avatar {
  return AVATAR_MAP.get(normalizeAvatarId(id)) as Avatar;
}
