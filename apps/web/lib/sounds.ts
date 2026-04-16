"use client";

export type SoundName =
  | "correct"
  | "wrong"
  | "tick"
  | "go"
  | "win"
  | "lose"
  | "streak"
  | "fast"
  | "powerReady"
  | "freezeHit"
  | "shieldBlock"
  // Hit / impact layers
  | "hitNormal"
  | "hitStreak"
  | "hitUltimate"
  // Ultimate events
  | "ultReady"
  | "ultActivateFlash"
  | "ultActivateGuardian"
  | "ultActivateInferno"
  | "ultActivateShadow"
  // Match end / KO
  | "koWin"
  | "koLose"
  // UI
  | "uiClick";

const STORAGE_KEY = "mathbattle-muted";
const USE_SOUND_FILES = process.env.NEXT_PUBLIC_USE_SOUND_FILES === "true";

const SOUND_FILES: Record<SoundName, string> = {
  correct: "/sounds/correct.mp3",
  wrong: "/sounds/wrong.mp3",
  tick: "/sounds/tick.mp3",
  go: "/sounds/go.mp3",
  win: "/sounds/win.mp3",
  lose: "/sounds/lose.mp3",
  streak: "/sounds/streak.mp3",
  fast: "/sounds/fast.mp3",
  powerReady: "/sounds/power-ready.mp3",
  freezeHit: "/sounds/freeze-hit.mp3",
  shieldBlock: "/sounds/shield-block.mp3",
  hitNormal: "/sounds/hit-normal.mp3",
  hitStreak: "/sounds/hit-streak.mp3",
  hitUltimate: "/sounds/hit-ultimate.mp3",
  ultReady: "/sounds/ult-ready.mp3",
  ultActivateFlash: "/sounds/ult-activate-flash.mp3",
  ultActivateGuardian: "/sounds/ult-activate-guardian.mp3",
  ultActivateInferno: "/sounds/ult-activate-inferno.mp3",
  ultActivateShadow: "/sounds/ult-activate-shadow.mp3",
  koWin: "/sounds/ko-win.mp3",
  koLose: "/sounds/ko-lose.mp3",
  uiClick: "/sounds/ui-click.mp3"
};

const FALLBACK_TONES: Record<SoundName, { frequency: number; duration: number; type: OscillatorType }> = {
  correct: { frequency: 740, duration: 0.12, type: "triangle" },
  wrong: { frequency: 220, duration: 0.16, type: "sawtooth" },
  tick: { frequency: 880, duration: 0.08, type: "square" },
  go: { frequency: 660, duration: 0.2, type: "triangle" },
  win: { frequency: 920, duration: 0.3, type: "triangle" },
  lose: { frequency: 180, duration: 0.28, type: "sawtooth" },
  streak: { frequency: 820, duration: 0.18, type: "triangle" },
  fast: { frequency: 1100, duration: 0.1, type: "square" },
  powerReady: { frequency: 980, duration: 0.16, type: "triangle" },
  freezeHit: { frequency: 320, duration: 0.2, type: "sine" },
  shieldBlock: { frequency: 720, duration: 0.18, type: "triangle" },
  hitNormal: { frequency: 520, duration: 0.08, type: "triangle" },
  hitStreak: { frequency: 640, duration: 0.1, type: "square" },
  hitUltimate: { frequency: 420, duration: 0.14, type: "sawtooth" },
  ultReady: { frequency: 1040, duration: 0.12, type: "triangle" },
  ultActivateFlash: { frequency: 980, duration: 0.18, type: "square" },
  ultActivateGuardian: { frequency: 760, duration: 0.2, type: "triangle" },
  ultActivateInferno: { frequency: 560, duration: 0.22, type: "sawtooth" },
  ultActivateShadow: { frequency: 860, duration: 0.18, type: "square" },
  koWin: { frequency: 880, duration: 0.28, type: "triangle" },
  koLose: { frequency: 140, duration: 0.32, type: "sawtooth" },
  uiClick: { frequency: 920, duration: 0.05, type: "square" }
};

class SoundManager {
  private sounds = new Map<SoundName, HTMLAudioElement>();
  private muted = false;
  private initialized = false;
  private audioContext: AudioContext | null = null;
  private lastPlayedAt = new Map<SoundName, number>();

  constructor() {
    if (typeof window !== "undefined") {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === "true";
    }
  }

  init() {
    if (this.initialized || typeof window === "undefined") {
      return;
    }

    this.initialized = true;

    if (!USE_SOUND_FILES) {
      return;
    }

    for (const [name, path] of Object.entries(SOUND_FILES) as Array<[SoundName, string]>) {
      const audio = new Audio(path);
      audio.preload = "auto";
      // Attempt to warm the cache; safe no-op if blocked.
      try {
        audio.load();
      } catch {
        // ignore
      }
      audio.addEventListener(
        "error",
        () => {
          this.sounds.delete(name as SoundName);
        },
        { once: true }
      );
      this.sounds.set(name as SoundName, audio);
    }
  }

  isMuted() {
    return this.muted;
  }

  setMuted(nextMuted: boolean) {
    this.muted = nextMuted;

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(nextMuted));
    }
  }

  private shouldThrottle(name: SoundName) {
    const now = Date.now();
    const previous = this.lastPlayedAt.get(name) ?? 0;

    if (now - previous < 80) {
      return true;
    }

    this.lastPlayedAt.set(name, now);
    return false;
  }

  private playFallback(name: SoundName, options: { volume?: number; rate?: number } = {}) {
    if (typeof window === "undefined") {
      return;
    }

    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioCtx) {
      return;
    }

    if (!this.audioContext) {
      this.audioContext = new AudioCtx();
    }

    const context = this.audioContext;
    const { frequency, duration, type } = FALLBACK_TONES[name];
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency * (options.rate ?? 1);
    gainNode.gain.value = Math.max(0.001, Math.min(0.12, (options.volume ?? 0.35) * 0.09));

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    const now = context.currentTime;
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  play(name: SoundName, options: { volume?: number; rate?: number; allowOverlap?: boolean } = {}) {
    if (this.muted || (!options.allowOverlap && this.shouldThrottle(name))) {
      return;
    }

    this.init();

    if (!USE_SOUND_FILES) {
      this.playFallback(name, options);
      return;
    }

    const source = this.sounds.get(name);

    if (!source) {
      this.playFallback(name, options);
      return;
    }

    const audio = source.cloneNode(true) as HTMLAudioElement;
    audio.volume = Math.max(0, Math.min(1, options.volume ?? 0.35));
    if (typeof options.rate === "number") {
      audio.playbackRate = Math.max(0.6, Math.min(1.6, options.rate));
    }
    void audio.play().catch(() => {
      this.playFallback(name, options);
    });
  }
}

export const soundManager = new SoundManager();
