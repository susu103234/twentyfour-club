/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SF Mono",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        ink: {
          50: "#F5F5F7",
          100: "#E4E4E8",
          200: "#B9B9C0",
          300: "#8E8E98",
          400: "#6A6A72",
          500: "#4A4A52",
          700: "#28282D",
          800: "#18181C",
          900: "#0C0C10",
        },
        accent: {
          300: "#B7C4FF",
          400: "#9FB3FF",
          500: "#7A93FF",
          600: "#5C78F2",
        },
        // Warm counterpart for correct-state feedback — ivory, not green.
        glow: {
          300: "#F0E7C8",
          400: "#E8D9A0",
        },
      },
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px", letterSpacing: "0.08em" }],
        xs: ["11px", { lineHeight: "16px" }],
        sm: ["12px", { lineHeight: "18px" }],
        base: ["13px", { lineHeight: "20px" }],
        md: ["15px", { lineHeight: "22px" }],
        lg: ["17px", { lineHeight: "24px" }],
        xl: ["22px", { lineHeight: "28px" }],
        "2xl": ["28px", { lineHeight: "34px" }],
        "3xl": ["34px", { lineHeight: "40px" }],
      },
      spacing: {
        "0.75": "3px",
        "1.25": "5px",
        "2.5": "10px",
        "4.5": "18px",
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass:
          "0 8px 32px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255,255,255,0.08)",
        card: "0 4px 20px rgba(0, 0, 0, 0.25)",
        glow: "0 0 24px rgba(122, 147, 255, 0.35)",
      },
      keyframes: {
        pop: {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)" },
        },
        rise: {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-6px)", opacity: "1" },
        },
      },
      animation: {
        pop: "pop 260ms ease-out",
        rise: "rise 400ms ease-out forwards",
      },
    },
  },
  plugins: [],
};
