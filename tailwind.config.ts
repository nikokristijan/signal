import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#faf8f4",
        surface: "#ffffff",
        raised: "#f0eeea",
        line: "#d3d6da",
        ink: "#1a1a1b",
        muted: "#6b6b6e",
        signal: { DEFAULT: "#4b8b5a", dark: "#3a7048", tint: "#e7f1e9" },
        danger: { DEFAULT: "#b4443c", tint: "#fbeceb" },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
      },
      keyframes: {
        fadeUp: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        shakeX: {
          "0%,100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-7px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(3px)" },
        },
        shakeScreen: {
          "0%,100%": { transform: "translate(0,0)" },
          "10%": { transform: "translate(-5px,3px)" },
          "20%": { transform: "translate(4px,-4px)" },
          "30%": { transform: "translate(-4px,-3px)" },
          "40%": { transform: "translate(3px,4px)" },
          "50%": { transform: "translate(-3px,2px)" },
          "60%": { transform: "translate(2px,-2px)" },
          "80%": { transform: "translate(-1px,1px)" },
        },
        pop: { "0%": { opacity: "0", transform: "scale(0.7)" }, "60%": { opacity: "1", transform: "scale(1.08)" }, "100%": { transform: "scale(1)" } },
        floatUp: { "0%": { opacity: "0", transform: "translateY(6px)" }, "18%": { opacity: "1" }, "70%": { opacity: "1" }, "100%": { opacity: "0", transform: "translateY(-26px)" } },
        flash: { "0%": { opacity: "0.85" }, "100%": { opacity: "0" } },
        burst: { "0%": { opacity: "0.95", transform: "scale(0.55)" }, "55%": { opacity: "1", transform: "scale(1)" }, "100%": { opacity: "0", transform: "scale(1.12)" } },
        toast: { "0%": { opacity: "0", transform: "translate(-50%,8px) scale(0.7)" }, "10%": { opacity: "1", transform: "translate(-50%,0) scale(1.06)" }, "16%": { transform: "translate(-50%,0) scale(1)" }, "85%": { opacity: "1" }, "100%": { opacity: "0", transform: "translate(-50%,-6px) scale(1)" } },
        bombIn: { "0%": { opacity: "0", transform: "scale(0.6) translateY(14px)" }, "100%": { opacity: "1", transform: "scale(1) translateY(0)" } },
      },
      animation: {
        "fade-up": "fadeUp 200ms ease-out both",
        shake: "shakeX 380ms ease-in-out both",
        "shake-screen": "shakeScreen 480ms ease-in-out both",
        pop: "pop 380ms ease-out both",
        "float-up": "floatUp 1500ms ease-out both",
        flash: "flash 900ms ease-out both",
        burst: "burst 1100ms ease-out both",
        toast: "toast 3.4s ease-out both",
        "bomb-in": "bombIn 260ms ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
