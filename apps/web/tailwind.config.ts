import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ecff",
          500: "#2f7af5",
          600: "#1f63d6",
          700: "#1b4fac",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
