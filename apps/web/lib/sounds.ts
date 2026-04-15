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
  | "shieldBlock";

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
  shieldBlock: "/sounds/shield-block.mp3"
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
  shieldBlock: { frequency: 720, duration: 0.18, type: "triangle" }
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
      audio.preload = "none";
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

  private playFallback(name: SoundName) {
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
    oscillator.frequency.value = frequency;
    gainNode.gain.value = 0.035;

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    const now = context.currentTime;
    gainNode.gain.setValueAtTime(0.035, now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  play(name: SoundName) {
    if (this.muted || this.shouldThrottle(name)) {
      return;
    }

    this.init();

    if (!USE_SOUND_FILES) {
      this.playFallback(name);
      return;
    }

    const source = this.sounds.get(name);

    if (!source) {
      this.playFallback(name);
      return;
    }

    const audio = source.cloneNode(true) as HTMLAudioElement;
    audio.volume = 0.35;
    void audio.play().catch(() => {
      this.playFallback(name);
    });
  }
}

export const soundManager = new SoundManager();
