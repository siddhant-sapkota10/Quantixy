"use client";

type SoundToggleProps = {
  muted: boolean;
  onToggle: () => void;
};

export function SoundToggle({ muted, onToggle }: SoundToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center justify-center rounded-full border border-cyan-300/22 bg-[linear-gradient(180deg,rgba(10,18,42,0.9),rgba(5,10,24,0.88))] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-200 shadow-[0_8px_24px_rgba(4,9,22,0.42)] transition-all duration-200 ease-premium hover:border-cyan-300/55 hover:shadow-[0_0_20px_rgba(0,212,255,0.18)] hover:text-white active:scale-[0.975] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.2em]"
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
    >
      {muted ? "Sound Off" : "Sound On"}
    </button>
  );
}
