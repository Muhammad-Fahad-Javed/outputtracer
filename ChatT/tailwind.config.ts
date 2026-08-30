import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "#F7F8FA",
        card: "#FFFFFF",
        primary: {
          DEFAULT: "var(--theme-primary, #128C7E)",
          dark: "var(--theme-primary-dark, #0D6E63)",
        },
        accent: {
          DEFAULT: "#25D366",
          dark: "#1FAE55",
        },
        ink: "#111827",
        muted: "#6B7280",
        bubbleOut: "var(--theme-bubble-out, #DCF8C6)",
        bubbleIn: "#FFFFFF",
      },
      borderRadius: {
        bubble: "1.15rem",
      },
      keyframes: {
        "message-in": {
          "0%": { opacity: "0", transform: "translateY(6px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "message-in": "message-in 180ms ease-out",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
