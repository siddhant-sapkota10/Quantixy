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
        background: "#000000",
        surface: "#000000",
        surfaceElevated: "#000000",
        accent: "#38c7e8",
        accentSoft: "#7dd8ee",
        accentPurple: "#7c5cff",
        textPrimary: "#eef5ff",
        textSecondary: "#9aa9bf"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(118,145,210,0.18), 0 20px 58px rgba(4,8,20,0.56), 0 0 22px rgba(56,199,232,0.12)",
        "glow-sm": "0 0 0 1px rgba(118,145,210,0.16), 0 8px 24px rgba(4,8,20,0.42)",
        "glow-lg": "0 0 0 1px rgba(118,145,210,0.22), 0 28px 78px rgba(4,8,20,0.62), 0 0 32px rgba(124,92,255,0.14)"
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
