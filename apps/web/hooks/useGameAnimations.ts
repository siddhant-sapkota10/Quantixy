"use client";

import { useCallback, useRef, useState } from "react";
import { useAnimation, type AnimationControls } from "framer-motion";

export type ShieldBlockedLabel = { id: number; who: "you" | "opponent" };
export type PowerUpActivatedLabel = {
  id: number;
  who: "you" | "opponent";
  type: "freeze" | "shield";
};
export type PowerUpReadyLabel = {
  id: number;
  who: "you" | "opponent";
  type: "freeze" | "shield";
};

export type GameAnimationState = {
  /** Frost overlay over the question card when YOU are frozen. */
  frostBurstActive: boolean;
  /** Snowfall overlay during a local freeze hit. */
  snowfallActive: boolean;
  /** AnimationControls for the question-card shake wrapper. */
  questionShakeControls: AnimationControls;
  /** Rising "BLOCKED 🛡️" labels per panel. */
  shieldBlockedLabels: ShieldBlockedLabel[];
  /** Rising "FREEZE ❄️" / "SHIELD 🛡️" labels per panel. */
  powerUpActivatedLabels: PowerUpActivatedLabel[];
  /** Large "FREEZE READY" / "SHIELD READY" labels when earned. */
  powerUpReadyLabels: PowerUpReadyLabel[];
  /** Increments when YOU score — triggers score glow on your panel. */
  youScoreGlowKey: number;
  /** Increments when OPPONENT scores — triggers score glow on their panel. */
  opponentScoreGlowKey: number;
  /** Increments when your shield blocks — triggers white flash on your panel. */
  youShieldBlockFlashKey: number;
  /** Increments when opponent's shield blocks — triggers white flash on their panel. */
  opponentShieldBlockFlashKey: number;
  /** Increments when YOU activate a power-up — triggers glow pulse on your panel. */
  youPowerUpGlowKey: number;
  /** Increments when OPPONENT activates a power-up — triggers glow pulse on their panel. */
  opponentPowerUpGlowKey: number;
  /** True for ~1.8 s after you break a streak of ≥ 2. */
  streakBrokenVisible: boolean;
};

export function useGameAnimations() {
  const questionShakeControls = useAnimation();

  const [frostBurstActive, setFrostBurstActive] = useState(false);
  const [snowfallActive, setSnowfallActive] = useState(false);
  const [shieldBlockedLabels, setShieldBlockedLabels] = useState<ShieldBlockedLabel[]>([]);
  const [powerUpActivatedLabels, setPowerUpActivatedLabels] = useState<PowerUpActivatedLabel[]>([]);
  const [powerUpReadyLabels, setPowerUpReadyLabels] = useState<PowerUpReadyLabel[]>([]);
  const [youScoreGlowKey, setYouScoreGlowKey] = useState(0);
  const [opponentScoreGlowKey, setOpponentScoreGlowKey] = useState(0);
  const [youShieldBlockFlashKey, setYouShieldBlockFlashKey] = useState(0);
  const [opponentShieldBlockFlashKey, setOpponentShieldBlockFlashKey] = useState(0);
  const [youPowerUpGlowKey, setYouPowerUpGlowKey] = useState(0);
  const [opponentPowerUpGlowKey, setOpponentPowerUpGlowKey] = useState(0);
  const [streakBrokenVisible, setStreakBrokenVisible] = useState(false);

  const labelIdRef = useRef(0);

  /** Called when a freeze power-up hits a player. */
  const triggerFreezeHit = useCallback(
    (target: "you" | "opponent") => {
      if (target === "you") {
        questionShakeControls.start({
          x: [0, -10, 10, -7, 7, -4, 4, 0],
          transition: { duration: 0.4, ease: "easeInOut" },
        });
        setFrostBurstActive(true);
        setSnowfallActive(true);
        setTimeout(() => setFrostBurstActive(false), 450);
        setTimeout(() => setSnowfallActive(false), 1600);
      }
    },
    [questionShakeControls],
  );

  /** Called when a player activates any power-up (freeze used OR shield activated). */
  const triggerPowerUpActivated = useCallback(
    (who: "you" | "opponent", type: "freeze" | "shield") => {
      const id = ++labelIdRef.current;
      setPowerUpActivatedLabels((prev) => [...prev, { id, who, type }]);
      setTimeout(() => {
        setPowerUpActivatedLabels((prev) => prev.filter((l) => l.id !== id));
      }, 1400);

      if (who === "you") setYouPowerUpGlowKey((k) => k + 1);
      else setOpponentPowerUpGlowKey((k) => k + 1);
    },
    [],
  );

  /** Called when a shield successfully blocks a freeze. */
  const triggerShieldBlock = useCallback((target: "you" | "opponent") => {
    const id = ++labelIdRef.current;
    setShieldBlockedLabels((prev) => [...prev, { id, who: target }]);
    setTimeout(() => {
      setShieldBlockedLabels((prev) => prev.filter((l) => l.id !== id));
    }, 1400);

    if (target === "you") setYouShieldBlockFlashKey((k) => k + 1);
    else setOpponentShieldBlockFlashKey((k) => k + 1);
  }, []);

  const triggerPowerUpReady = useCallback(
    (who: "you" | "opponent", type: "freeze" | "shield") => {
      const id = ++labelIdRef.current;
      setPowerUpReadyLabels((prev) => [...prev, { id, who, type }]);
      setTimeout(() => {
        setPowerUpReadyLabels((prev) => prev.filter((l) => l.id !== id));
      }, 1500);

      if (who === "you") setYouPowerUpGlowKey((k) => k + 1);
      else setOpponentPowerUpGlowKey((k) => k + 1);
    },
    []
  );

  /** Called when a player scores a point. */
  const triggerScoreGlow = useCallback((who: "you" | "opponent") => {
    if (who === "you") setYouScoreGlowKey((k) => k + 1);
    else setOpponentScoreGlowKey((k) => k + 1);
  }, []);

  /** Called on incorrectAnswer when the local player had a streak ≥ 2. */
  const triggerStreakBroken = useCallback(() => {
    setStreakBrokenVisible(true);
    setTimeout(() => setStreakBrokenVisible(false), 1800);
  }, []);

  return {
    animState: {
      frostBurstActive,
      snowfallActive,
      questionShakeControls,
      shieldBlockedLabels,
      powerUpActivatedLabels,
      powerUpReadyLabels,
      youScoreGlowKey,
      opponentScoreGlowKey,
      youShieldBlockFlashKey,
      opponentShieldBlockFlashKey,
      youPowerUpGlowKey,
      opponentPowerUpGlowKey,
      streakBrokenVisible,
    } satisfies GameAnimationState,
    triggerFreezeHit,
    triggerPowerUpActivated,
    triggerShieldBlock,
    triggerPowerUpReady,
    triggerScoreGlow,
    triggerStreakBroken,
  };
}
