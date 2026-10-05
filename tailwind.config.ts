import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./modules/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        accent: "var(--accent)",
        up: "var(--up)",
        down: "var(--down)",
        muted: "var(--muted)",
        'card-bg': "var(--card-bg)",
        'card-border': "var(--card-border)",
        'hero-from': "var(--hero-from)",
        'hero-to': "var(--hero-to)",
        tile: "var(--tile)",
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans CJK JP', 'Noto Sans CJK SC', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      fontFeatureSettings: {
        tnum: '"tnum"',
      },
      borderRadius: {
        'card': '22px',
        'hero': '24px',
      },
    },
  },
  plugins: [],
} satisfies Config;
