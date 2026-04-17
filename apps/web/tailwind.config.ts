import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0f1c",
        surface: "#0f1630",
        surfaceElevated: "#141e3d",
        accent: "#00d4ff",
        accentSoft: "#55e9ff",
        accentPurple: "#8a2eff",
        textPrimary: "#f5f9ff",
        textSecondary: "#8fa4c5"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(76,111,255,0.28), 0 20px 60px rgba(6,10,24,0.72), 0 0 28px rgba(0,212,255,0.22)",
        "glow-sm": "0 0 0 1px rgba(90,125,255,0.24), 0 8px 24px rgba(4,8,20,0.55)",
        "glow-lg": "0 0 0 1px rgba(101,135,255,0.4), 0 28px 80px rgba(4,8,20,0.78), 0 0 40px rgba(138,46,255,0.25)"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at 20% -10%, rgba(0,212,255,0.24), transparent 28%), radial-gradient(circle at 80% -10%, rgba(138,46,255,0.22), transparent 26%), linear-gradient(rgba(100,126,190,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(100,126,190,0.12) 1px, transparent 1px)",
        "neon-line": "linear-gradient(120deg, rgba(0,212,255,0.85), rgba(138,46,255,0.85))"
      },
      backgroundSize: {
        "hero-grid": "auto, auto, 44px 44px, 44px 44px"
      },
      borderRadius: {
        panel: "1.75rem"
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
};

export default config;
