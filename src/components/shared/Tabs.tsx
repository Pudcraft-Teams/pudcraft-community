import Link from "next/link";

interface TabItem {
  href: string;
  label: string;
  active?: boolean;
}

interface TabsProps {
  items: TabItem[];
  className?: string;
}

export function Tabs({ items, className = "" }: TabsProps) {
  return (
    <nav
      className={`flex gap-0.5 border-b ${className}`}
      style={{ borderColor: "var(--m3-outline)" }}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className="relative px-4 py-3 text-[13.5px] font-medium transition-colors"
          style={
            item.active
              ? { color: "var(--m3-text)" }
              : { color: "var(--m3-text-muted)" }
          }
        >
          {item.label}
          {item.active ? (
            <span
              className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t-full"
              style={{ background: "var(--m3-primary)" }}
            />
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
