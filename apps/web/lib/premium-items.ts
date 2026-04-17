export type PremiumItemType = "avatar" | "emote_pack";

export type PremiumItem = {
  type: PremiumItemType;
  id: string;
  name: string;
  subtitle: string;
  premiumTag?: string;
  imageSrc?: string;
  equipAction?: "equip_avatar" | "equip_emote_pack" | null;
};

export function getPremiumItem(type: PremiumItemType, id: string): PremiumItem | null {
  if (type === "avatar") {
    if (id === "architect") {
      return {
        type,
        id,
        name: "Architect",
        subtitle: "Architect is now yours.",
        premiumTag: "Premium",
        imageSrc: "/assets/avatarCards/architect.png",
        equipAction: "equip_avatar",
      };
    }
    if (id === "titan") {
      return {
        type,
        id,
        name: "Titan",
        subtitle: "Titan is now yours.",
        premiumTag: "Premium",
        imageSrc: "/assets/avatarCards/titan.png",
        equipAction: "equip_avatar",
      };
    }
    return null;
  }

  if (type === "emote_pack") {
    if (id === "tilt") {
      return {
        type,
        id,
        name: "Tilt Pack",
        subtitle: "Tilt Pack unlocked.",
        premiumTag: "Premium",
        equipAction: "equip_emote_pack",
      };
    }
    if (id === "clutch") {
      return {
        type,
        id,
        name: "Clutch Pack",
        subtitle: "Clutch Pack unlocked.",
        premiumTag: "Premium",
        equipAction: "equip_emote_pack",
      };
    }
    return null;
  }

  return null;
}

