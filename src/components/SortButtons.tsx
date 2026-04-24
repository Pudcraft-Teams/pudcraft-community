"use client";

import { useTranslations } from "next-intl";

export type ServerSort = "newest" | "popular" | "players" | "name";

interface SortButtonsProps {
  value: ServerSort;
  onChange: (sort: ServerSort) => void;
}

const SORT_OPTION_KEYS: Array<{ value: ServerSort; labelKey: "sortNewest" | "sortPopular" | "sortPlayers" | "sortName" }> = [
  { value: "newest", labelKey: "sortNewest" },
  { value: "popular", labelKey: "sortPopular" },
  { value: "players", labelKey: "sortPlayers" },
  { value: "name", labelKey: "sortName" },
];

export function SortButtons({ value, onChange }: SortButtonsProps) {
  const t = useTranslations("servers.list");
  return (
    <>
      <div className="md:hidden">
        <label className="block text-sm text-warm-600">
          {t("sortLabel")}
          <select
            value={value}
            onChange={(event) => {
              const selected = SORT_OPTION_KEYS.find((option) => option.value === event.target.value);
              if (selected) {
                onChange(selected.value);
              }
            }}
            className="m3-input mt-2 w-full"
          >
            {SORT_OPTION_KEYS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <span className="text-sm text-warm-600">{t("sortLabelInline")}</span>
        {SORT_OPTION_KEYS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`m3-chip ${value === option.value ? "m3-chip-active" : ""}`}
            aria-pressed={value === option.value}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </>
  );
}
