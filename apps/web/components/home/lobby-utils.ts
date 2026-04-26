import { getAvatar, normalizeAvatarId } from "@/lib/avatars";
import {
  AVATAR_SKIN_PREVIEWS,
  HIT_EFFECT_PREVIEWS,
  type CoinShopStatus,
} from "@/lib/coin-shop";
import { getEmotePack, normalizeEmotePackId } from "@/lib/cosmetics";

const TITLE_LABELS: Record<string, string> = {
  rookie_solver: "Rookie Solver",
  speed_demon: "Speed Demon",
  clutch_king: "Clutch King",
  algebra_assassin: "Algebra Assassin",
};

export function formatEquippedTitle(titleId: string | null | undefined): string {
  if (!titleId) return "Rookie Solver";
  return TITLE_LABELS[titleId] ?? titleId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getLoadoutLines(status: CoinShopStatus | null, playerAvatarId: string | null) {
  const avatarId = normalizeAvatarId(playerAvatarId ?? status?.equipped.avatar ?? "flash");
  const avatarName = getAvatar(avatarId).name;

  const skinId = status?.equipped.avatarSkin ?? "none";
  const skinLabel =
    skinId === "none"
      ? "Base skin"
      : status?.items.find((i) => i.itemType === "avatar_skin" && i.grantId === skinId)?.name ??
        AVATAR_SKIN_PREVIEWS[skinId] ??
        skinId;

  const packId = normalizeEmotePackId(status?.equipped.emotePack);
  const emoteName = getEmotePack(packId).name;

  const hitId = status?.equipped.hitEffect ?? "none";
  const hitLabel =
    hitId === "none"
      ? "Default impact"
      : status?.items.find((i) => i.itemType === "hit_effect" && i.grantId === hitId)?.name ??
        HIT_EFFECT_PREVIEWS[hitId] ??
        hitId;

  return { avatarName, skinLabel, emoteName, hitLabel };
}

export type DailyLobbySnapshot = {
  hasCompletedMatchToday: boolean;
  claimedToday: boolean;
  canClaim: boolean;
  currentStreak: number;
};
