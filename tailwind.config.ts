import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#faf8f4",
        ink: "#1a1a1b",
        muted: "#6b6b6e",
        line: "#d3d6da",
        soft: "#f0eeea",
        signal: {
          DEFAULT: "#4b8b5a",
          dark: "#3a7048",
          tint: "#e7f1e9",
        },
        miss: { DEFAULT: "#b4443c", tint: "#fbeceb" },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        ring: {
          "0%": { boxShadow: "0 0 0 0 rgba(75,139,90,0.45)" },
          "100%": { boxShadow: "0 0 0 14px rgba(75,139,90,0)" },
        },
      },
      animation: {
        "fade-up": "fadeUp 180ms ease-out both",
        ring: "ring 900ms ease-out 1",
      },
    },
  },
  plugins: [],
};
export default config;
