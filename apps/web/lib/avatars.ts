export const AVATAR_IDS = [
  "fox",
  "wizard",
  "ninja",
  "robot",
  "knight",
  "pirate",
  "dragon",
  "ghost",
  "astronaut",
  "samurai",
  "racer",
  "tiger"
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export type AvatarRarity = "common";

export type Avatar = {
  id: AvatarId;
  name: string;
  icon: string;
  emoji: string;
  label: string;
  rarity: AvatarRarity;
  unlockKey: string | null;
  ultimateAbility: string | null;
};

export const AVATARS: Avatar[] = [
  { id: "fox", name: "Fox", icon: "🦊", emoji: "🦊", label: "Fox", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "wizard", name: "Wizard", icon: "🧙", emoji: "🧙", label: "Wizard", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "ninja", name: "Ninja", icon: "🥷", emoji: "🥷", label: "Ninja", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "robot", name: "Robot", icon: "🤖", emoji: "🤖", label: "Robot", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "knight", name: "Knight", icon: "⚔️", emoji: "⚔️", label: "Knight", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "pirate", name: "Pirate", icon: "🏴‍☠️", emoji: "🏴‍☠️", label: "Pirate", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "dragon", name: "Dragon", icon: "🐉", emoji: "🐉", label: "Dragon", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "ghost", name: "Ghost", icon: "👻", emoji: "👻", label: "Ghost", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "astronaut", name: "Astronaut", icon: "🧑‍🚀", emoji: "🧑‍🚀", label: "Astronaut", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "samurai", name: "Samurai", icon: "🗡️", emoji: "🗡️", label: "Samurai", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "racer", name: "Racer", icon: "🏎️", emoji: "🏎️", label: "Racer", rarity: "common", unlockKey: null, ultimateAbility: null },
  { id: "tiger", name: "Tiger", icon: "🐯", emoji: "🐯", label: "Tiger", rarity: "common", unlockKey: null, ultimateAbility: null }
];

export const AVATAR_MAP = new Map<AvatarId, Avatar>(AVATARS.map((avatar) => [avatar.id, avatar]));

export const DEFAULT_AVATAR_ID: AvatarId = "fox";

export function getAvatar(id: string | null | undefined): Avatar {
  return AVATAR_MAP.get(id as AvatarId) ?? (AVATAR_MAP.get(DEFAULT_AVATAR_ID) as Avatar);
}
