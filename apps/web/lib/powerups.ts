import powerupsJson from "../../../packages/shared/powerups.json";

export type PowerUpId = "freeze" | "shield" | "double_points" | "hint" | "cleanse";

export type PowerUpDefinition = {
  id: PowerUpId;
  name: string;
  icon: string;
  description: string;
  effectType: string;
  target: "self" | "opponent";
  durationMs?: number;
  maxUsesPerMatch?: number;
};

export const POWER_UPS = powerupsJson as PowerUpDefinition[];
export const POWER_UP_IDS = POWER_UPS.map((powerUp) => powerUp.id) as PowerUpId[];

export const POWER_UP_BY_ID: Record<PowerUpId, PowerUpDefinition> = POWER_UPS.reduce(
  (accumulator, powerUp) => {
    accumulator[powerUp.id] = powerUp;
    return accumulator;
  },
  {} as Record<PowerUpId, PowerUpDefinition>
);

export function getPowerUpMeta(id: PowerUpId | null | undefined): PowerUpDefinition | null {
  if (!id) {
    return null;
  }

  return POWER_UP_BY_ID[id] ?? null;
}

