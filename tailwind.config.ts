import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        warm: {
          50: '#FDF6F0',
          100: '#FBEEE6',
          200: '#E8DDD4',
          300: '#D6C8BC',
          400: '#C4B5A8',
          500: '#7A6B5F',
          600: '#6B5344',
          700: '#4A3728',
          800: '#8B4533',
          900: '#3A2518',
        },
        coral: {
          DEFAULT: '#D4715E',
          light: '#FBEEE6',
          hover: '#C4604D',
          dark: '#B8533F',
          amber: '#D4956A',
        },
        forest: {
          DEFAULT: '#5B9A6E',
          light: '#EEF6EF',
          dark: '#2D5A3A',
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
