import type { Config } from "tailwindcss";

const config: Config = {

  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Clearway design tokens
        "bg-primary":    "var(--bg-primary)",
        "bg-secondary":  "var(--bg-secondary)",
        "bg-tertiary":   "var(--bg-tertiary)",
        border:          "var(--border)",
        "border-strong": "var(--border-strong)",

        "text-primary":   "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-tertiary":  "var(--text-tertiary)",

        accent:        "var(--accent)",
        "accent-hover": "var(--accent-hover)",
        "accent-light": "var(--accent-light)",

        success: "var(--success)",
        warning: "var(--warning)",
        danger:  "var(--danger)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        base: ["14px", { lineHeight: "1.5" }],
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.07)",
      },
      borderRadius: {
        md: "6px",
      },
    },
  },
  plugins: [],
};

export default config;
