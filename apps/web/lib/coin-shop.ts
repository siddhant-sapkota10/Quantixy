import { EMOTE_PACKS, type EmotePackId } from "@/lib/cosmetics";

export type CoinShopItemType = "emote_pack" | "hit_effect" | "avatar_skin";
export type CoinShopRarity = "free" | "common" | "rare" | "epic" | "premium";

export type CoinShopItem = {
  id: string;
  itemType: CoinShopItemType;
  grantId: string;
  name: string;
  description: string;
  rarity: CoinShopRarity;
  priceCoins: number;
  category: "Emote Packs" | "Avatars" | "Hit Effects";
  preview: string;
  stripeSupported?: boolean;
  metadata?: Record<string, unknown>;
};

export type CoinShopWallet = {
  coins: number;
  xp: number;
};

export type CoinShopEquipped = {
  emotePack: EmotePackId;
  hitEffect: string;
  avatarSkin: string;
  avatar: string;
  title: string;
};

export type CoinShopStatus = {
  wallet: CoinShopWallet;
  items: CoinShopItem[];
  owned: {
    emotePacks: string[];
    hitEffects: string[];
    avatarSkins: string[];
    avatars: string[];
  };
  equipped: CoinShopEquipped;
};

export const DEFAULT_HIT_EFFECT_ID = "none";
export const DEFAULT_AVATAR_SKIN_ID = "none";

export const HIT_EFFECT_PREVIEWS: Record<string, string> = {
  none: "Clean",
  lightning_strike: "Bolt",
  fire_burst: "Burst",
  pixel_glitch: "Glitch",
};

export const AVATAR_SKIN_PREVIEWS: Record<string, string> = {
  none: "Base",
  flash_neon: "Neon",
  guardian_emerald: "Emerald",
};

export const COIN_SHOP_SEED_ROWS = [
  {
    id: "emote_pack_tilt",
    item_type: "emote_pack",
    name: "Tilt Pack",
    description: "Spicy BM emotes from the existing Tilt pack.",
    rarity: "premium",
    price_coins: 1500,
    metadata: { packId: "tilt" },
    sort_order: 10,
  },
  {
    id: "emote_pack_clutch",
    item_type: "emote_pack",
    name: "Clutch Pack",
    description: "High-energy win momentum emotes from the existing Clutch pack.",
    rarity: "premium",
    price_coins: 1800,
    metadata: { packId: "clutch" },
    sort_order: 11,
  },
  {
    id: "hit_lightning_strike",
    item_type: "hit_effect",
    name: "Lightning Strike",
    description: "A crisp electric arc on damaging hits.",
    rarity: "common",
    price_coins: 350,
    metadata: { effectId: "lightning_strike", preview: "Bolt" },
    sort_order: 20,
  },
  {
    id: "hit_fire_burst",
    item_type: "hit_effect",
    name: "Fire Burst",
    description: "A quick ember pop on impact.",
    rarity: "rare",
    price_coins: 500,
    metadata: { effectId: "fire_burst", preview: "Burst" },
    sort_order: 21,
  },
  {
    id: "hit_pixel_glitch",
    item_type: "hit_effect",
    name: "Pixel Glitch",
    description: "A compact digital glitch burst.",
    rarity: "rare",
    price_coins: 650,
    metadata: { effectId: "pixel_glitch", preview: "Glitch" },
    sort_order: 22,
  },
  {
    id: "skin_flash_neon",
    item_type: "avatar_skin",
    name: "Neon Flash Skin",
    description: "A lightweight profile/battle tint for Flash players.",
    rarity: "common",
    price_coins: 700,
    metadata: { skinId: "flash_neon", avatarId: "flash", preview: "Neon" },
    sort_order: 30,
  },
  {
    id: "skin_guardian_emerald",
    item_type: "avatar_skin",
    name: "Emerald Guardian Skin",
    description: "A subtle emerald skin for Guardian players.",
    rarity: "common",
    price_coins: 700,
    metadata: { skinId: "guardian_emerald", avatarId: "guardian", preview: "Emerald" },
    sort_order: 31,
  },
] as const;

const RARITY_ORDER: Record<CoinShopRarity, number> = {
  free: 0,
  common: 1,
  rare: 2,
  epic: 3,
  premium: 4,
};

function readString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

export function normalizeShopItem(row: {
  id: string;
  item_type: CoinShopItemType;
  name: string;
  description: string | null;
  rarity: CoinShopRarity;
  price_coins: number;
  metadata: Record<string, unknown> | null;
}): CoinShopItem {
  const metadata = row.metadata ?? {};
  const packId = readString(metadata, "packId");
  const effectId = readString(metadata, "effectId");
  const skinId = readString(metadata, "skinId");
  const grantId = packId ?? effectId ?? skinId ?? row.id;
  const preview = readString(metadata, "preview") ?? HIT_EFFECT_PREVIEWS[grantId] ?? AVATAR_SKIN_PREVIEWS[grantId] ?? "Preview";

  return {
    id: row.id,
    itemType: row.item_type,
    grantId,
    name: row.name,
    description: row.description ?? "",
    rarity: row.rarity,
    priceCoins: row.price_coins,
    category:
      row.item_type === "emote_pack"
        ? "Emote Packs"
        : row.item_type === "avatar_skin"
          ? "Avatars"
          : "Hit Effects",
    preview,
    stripeSupported: row.item_type === "emote_pack" && (grantId === "tilt" || grantId === "clutch"),
    metadata,
  };
}

export function getFreeStarterPackShopItem(): CoinShopItem {
  const starter = EMOTE_PACKS.find((pack) => pack.id === "starter");
  return {
    id: "emote_pack_starter",
    itemType: "emote_pack",
    grantId: "starter",
    name: starter?.name ?? "Starter Pack",
    description: starter?.description ?? "Free starter emotes for every player.",
    rarity: "free",
    priceCoins: 0,
    category: "Emote Packs",
    preview: "Free",
    metadata: { packId: "starter" },
  };
}

export function sortShopItems(left: CoinShopItem, right: CoinShopItem) {
  if (left.category !== right.category) {
    return left.category.localeCompare(right.category);
  }
  if (RARITY_ORDER[left.rarity] !== RARITY_ORDER[right.rarity]) {
    return RARITY_ORDER[left.rarity] - RARITY_ORDER[right.rarity];
  }
  return left.priceCoins - right.priceCoins || left.name.localeCompare(right.name);
}
