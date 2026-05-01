import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: '#FFFEFA',
        warm: {
          50: '#F4EFE6',
          100: '#EDE6D9',
          200: '#E2DCCC',
          300: '#D5CDB7',
          400: '#B5AE9A',
          500: '#847F71',
          600: '#605C50',
          700: '#494842',
          800: '#2E2D29',
          900: '#1A1A18',
        },
        accent: {
          DEFAULT: '#CC7D5E',
          hover: '#BC6E4F',
          active: '#A45F40',
          muted: '#FBF4EF',
          subtle: 'rgba(204, 125, 94, 0.10)',
        },
        forest: {
          DEFAULT: '#5C8C4E',
          light: '#EEF4E9',
          dark: '#3D5F35',
        },
        mode: {
          survival: '#6B8E5B',
          creative: '#4A7C9D',
          rpg: '#8B6FA8',
          pvp: '#C0392B',
          tech: '#C97C3F',
          sky: '#70A5B5',
          vanilla: '#9C8F75',
          mod: '#C9A93F',
          mini: '#B86E8E',
        },
      },
      fontFamily: {
        sans: [
          '"HarmonyOS Sans SC"',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [typography],
};

export default config;
