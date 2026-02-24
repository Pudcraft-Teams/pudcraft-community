"use client";

export type ServerSort = "newest" | "popular" | "players" | "name";

interface SortButtonsProps {
  value: ServerSort;
  onChange: (sort: ServerSort) => void;
}

const SORT_OPTIONS: Array<{ value: ServerSort; label: string }> = [
  { value: "newest", label: "最新发布" },
  { value: "popular", label: "最多收藏" },
  { value: "players", label: "在线人数" },
  { value: "name", label: "名称" },
];

export function SortButtons({ value, onChange }: SortButtonsProps) {
  return (
    <>
      <div className="md:hidden">
        <label className="block text-sm text-slate-600">
          排序
          <select
            value={value}
            onChange={(event) => {
              const selected = SORT_OPTIONS.find((option) => option.value === event.target.value);
              if (selected) {
                onChange(selected.value);
              }
            }}
            className="m3-input mt-2 w-full"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="hidden flex-wrap items-center gap-2 md:flex">
        <span className="text-sm text-slate-600">排序：</span>
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`m3-chip ${value === option.value ? "m3-chip-active" : ""}`}
            aria-pressed={value === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}
