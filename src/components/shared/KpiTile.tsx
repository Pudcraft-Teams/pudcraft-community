interface KpiTileProps {
  label: string;
  value: string;
  suffix?: string;
  sub?: string;
}

export function KpiTile({ label, value, suffix, sub }: KpiTileProps) {
  return (
    <div
      className="rounded-[10px] border px-4 py-[14px]"
      style={{
        background: "var(--m3-surface)",
        borderColor: "var(--m3-outline)",
      }}
    >
      <div
        className="text-xs font-medium"
        style={{ color: "var(--m3-text-muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-1.5 flex items-baseline gap-1 text-[26px] font-semibold leading-[1.1] tabular-nums"
        style={{ letterSpacing: "-0.025em", color: "var(--m3-text)" }}
      >
        <span>{value}</span>
        {suffix ? (
          <span
            className="text-sm font-medium"
            style={{ color: "var(--m3-text-muted)" }}
          >
            {suffix}
          </span>
        ) : null}
      </div>
      {sub ? (
        <div
          className="mt-1.5 text-[11.5px] font-medium tabular-nums"
          style={{ color: "var(--m3-outline-strong)" }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}
