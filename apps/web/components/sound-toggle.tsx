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
      className="absolute right-3 top-3 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-300 transition-all duration-150 ease-out hover:border-sky-400/40 hover:text-white active:scale-[0.975] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60 sm:right-6 sm:top-6 sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.2em]"
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
    >
      {muted ? "Sound Off" : "Sound On"}
    </button>
  );
}
