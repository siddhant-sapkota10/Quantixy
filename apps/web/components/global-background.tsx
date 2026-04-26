"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

const MATH_SYMBOLS = [
  "∑", "π", "∞", "√", "∫", "Δ", "α", "β", "γ", "θ",
  "×", "÷", "±", "≈", "≠", "≤", "≥", "²", "³", "⁴",
  "%", "‰", "∂", "∇", "∈", "∉", "∩", "∪", "⊂", "⊃",
  "7", "3", "9", "1", "8", "+", "−", "=", "∀", "∃",
];

// Deterministic positions keep the first client render stable.
const SYMBOLS = Array.from({ length: 46 }, (_, i) => ({
  id: i,
  symbol: MATH_SYMBOLS[i % MATH_SYMBOLS.length],
  left: `${((i * 2437 + 317) % 9400) / 100}%`,
  top: `${((i * 1873 + 211) % 9200) / 100}%`,
  size: 12 + (i % 6) * 5,
  dur: `${10 + (i % 7) * 2.3}s`,
  delay: `${-((i * 1.7) % 14)}s`,
  tone: i % 3,
}));

const FORMULA_STREAMS = [
  "f(x)=ax²+bx+c",
  "Δt · score × streak",
  "P(win)=1/(1+10^-r)",
  "∫ speed dt = mastery",
  "rank ↑ = accuracy × tempo",
  "combo = focus² + recall",
];

const TRACE_LINES = Array.from({ length: 11 }, (_, i) => ({
  id: i,
  top: `${8 + i * 8.2}%`,
  left: `${(i * 17 + 6) % 74}%`,
  width: `${110 + (i % 4) * 58}px`,
  delay: `${-(i * 0.85)}s`,
  rotate: `${i % 2 === 0 ? -18 : 18}deg`,
}));

const PAGE_THEMES = {
  home: {
    accent: "56,199,232",
    accent2: "250,204,21",
    accent3: "124,92,255",
    horizon: "42%",
  },
  play: {
    accent: "20,184,166",
    accent2: "56,199,232",
    accent3: "250,204,21",
    horizon: "47%",
  },
  game: {
    accent: "244,63,94",
    accent2: "250,204,21",
    accent3: "56,199,232",
    horizon: "52%",
  },
  leaderboard: {
    accent: "250,204,21",
    accent2: "56,199,232",
    accent3: "168,85,247",
    horizon: "39%",
  },
  profile: {
    accent: "168,85,247",
    accent2: "20,184,166",
    accent3: "56,199,232",
    horizon: "44%",
  },
  account: {
    accent: "251,146,60",
    accent2: "56,199,232",
    accent3: "20,184,166",
    horizon: "42%",
  },
};

export function GlobalBackground() {
  const pathname = usePathname();
  const theme = useMemo(() => {
    if (pathname?.startsWith("/game")) return PAGE_THEMES.play;
    if (pathname?.startsWith("/play")) return PAGE_THEMES.play;
    if (pathname?.startsWith("/leaderboard")) return PAGE_THEMES.leaderboard;
    if (pathname?.startsWith("/profile")) return PAGE_THEMES.profile;
    if (
      pathname?.startsWith("/reset-password") ||
      pathname?.startsWith("/shop") ||
      pathname?.startsWith("/loadout")
    ) {
      return PAGE_THEMES.account;
    }

    return PAGE_THEMES.home;
  }, [pathname]);

  return (
    <div
      aria-hidden="true"
      className="q-global-background pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={
        {
          "--q-bg-accent": theme.accent,
          "--q-bg-accent-2": theme.accent2,
          "--q-bg-accent-3": theme.accent3,
          "--q-bg-horizon": theme.horizon,
        } as React.CSSProperties
      }
    >
      <div className="q-bg-base absolute inset-0" />
      <div className="q-bg-aurora absolute inset-0" />
      <div className="q-bg-grid q-bg-grid-back absolute inset-0" />
      <div className="q-bg-grid q-bg-grid-front absolute inset-0" />
      <div className="q-bg-equation-field absolute inset-0" />
      <div className="q-bg-horizon absolute left-0 right-0" />
      <div className="q-bg-radial-board absolute" />
      <div className="q-bg-score-rail q-bg-score-rail-left absolute" />
      <div className="q-bg-score-rail q-bg-score-rail-right absolute" />

      {SYMBOLS.map((s) => (
        <span
          key={s.id}
          className="q-bg-symbol"
          style={
            {
              left: s.left,
              top: s.top,
              fontSize: s.size,
              "--sym-dur": s.dur,
              "--sym-delay": s.delay,
              "--sym-tone": s.tone,
            } as React.CSSProperties
          }
        >
          {s.symbol}
        </span>
      ))}

      {FORMULA_STREAMS.map((formula, i) => (
        <span
          key={formula}
          className="q-bg-formula"
          style={
            {
              "--formula-top": `${14 + i * 12}%`,
              "--formula-left": i % 2 === 0 ? "-18%" : "58%",
              "--formula-delay": `${-(i * 2.4)}s`,
              "--formula-duration": `${24 + i * 2}s`,
            } as React.CSSProperties
          }
        >
          {formula}
        </span>
      ))}

      {TRACE_LINES.map((line) => (
        <span
          key={line.id}
          className="q-bg-trace"
          style={
            {
              top: line.top,
              left: line.left,
              width: line.width,
              animationDelay: line.delay,
              transform: `rotate(${line.rotate})`,
            } as React.CSSProperties
          }
        />
      ))}

      <div className="q-bg-scanline" />
      <div className="q-bg-vignette absolute inset-0" />
    </div>
  );
}
