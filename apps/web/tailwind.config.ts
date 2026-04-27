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
        background: "var(--qx-background-base)",
        surface: "var(--qx-background-surface)",
        surfaceElevated: "var(--qx-surface-elevated)",
        accent: "var(--qx-accent-cyan)",
        accentSoft: "#5eccec",
        accentPurple: "var(--qx-accent-purple)",
        textPrimary: "var(--qx-text-primary)",
        textSecondary: "var(--qx-text-secondary)"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(118,145,210,0.12), 0 18px 48px rgba(4,10,22,0.44), 0 0 16px rgba(56,199,232,0.07)",
        "glow-sm": "0 0 0 1px rgba(118,145,210,0.1), 0 8px 20px rgba(4,10,22,0.36)",
        "glow-lg": "0 0 0 1px rgba(118,145,210,0.14), 0 24px 64px rgba(4,10,22,0.5), 0 0 22px rgba(124,92,255,0.09)"
      },
      backgroundImage: {
        "neon-line": "linear-gradient(120deg, rgba(56,199,232,0.78), rgba(124,92,255,0.76))"
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
