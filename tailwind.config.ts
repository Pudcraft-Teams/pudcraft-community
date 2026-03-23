import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: '#FFFFFF',
        warm: {
          50: '#F9F8F6',
          100: '#F3F1EE',
          200: '#E7E4E0',
          300: '#D5D0CA',
          400: '#A39D97',
          500: '#6F6862',
          600: '#57504A',
          700: '#3D3733',
          800: '#1A1816',
          900: '#0F0E0D',
        },
        accent: {
          DEFAULT: '#C2703C',
          hover: '#A85F32',
          active: '#935229',
          muted: '#FBF4EF',
          subtle: 'rgba(194, 112, 60, 0.08)',
        },
        forest: {
          DEFAULT: '#5C946E',
          light: '#EEF6EF',
          dark: '#2D5A3A',
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
