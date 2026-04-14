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
        background: "#0f172a",
        surface: "#111c34",
        accent: "#38bdf8",
        accentSoft: "#0ea5e9"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(56, 189, 248, 0.2), 0 20px 50px rgba(15, 23, 42, 0.45)"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at top, rgba(56, 189, 248, 0.14), transparent 30%), linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px)"
      },
      backgroundSize: {
        "hero-grid": "auto, 42px 42px, 42px 42px"
      }
    }
  },
  plugins: []
};

export default config;
