import type { ReactNode } from "react";

interface DataTableProps {
  children: ReactNode;
  className?: string;
}

export function DataTable({ children, className = "" }: DataTableProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table
        className="w-full border-collapse"
        style={
          {
            "--adm-border": "var(--m3-outline)",
          } as React.CSSProperties
        }
      >
        {children}
      </table>
    </div>
  );
}

interface DataTableHeadProps {
  children: ReactNode;
}

export function DataTableHead({ children }: DataTableHeadProps) {
  return (
    <thead>
      <tr
        style={{ background: "var(--m3-surface-variant)" }}
      >
        {children}
      </tr>
    </thead>
  );
}

interface DataTableThProps {
  children?: ReactNode;
  className?: string;
}

export function DataTableTh({ children, className = "" }: DataTableThProps) {
  return (
    <th
      className={`px-[18px] py-[9px] text-left text-[11px] font-medium tracking-[0.02em] ${className}`}
      style={{ color: "var(--m3-outline-strong)" }}
    >
      {children}
    </th>
  );
}

interface DataTableBodyProps {
  children: ReactNode;
}

export function DataTableBody({ children }: DataTableBodyProps) {
  return <tbody>{children}</tbody>;
}

interface DataTableRowProps {
  children: ReactNode;
  clickable?: boolean;
  className?: string;
}

export function DataTableRow({ children, clickable, className = "" }: DataTableRowProps) {
  return (
    <tr
      className={`transition-colors duration-75 ${clickable ? "cursor-pointer hover:bg-[var(--m3-surface-variant)]" : ""} [&:last-child_td]:border-b-0 ${className}`}
    >
      {children}
    </tr>
  );
}

interface DataTableTdProps {
  children?: ReactNode;
  className?: string;
  shrink?: boolean;
  numeric?: boolean;
}

export function DataTableTd({ children, className = "", shrink, numeric }: DataTableTdProps) {
  return (
    <td
      className={`border-b px-[18px] py-[11px] text-left text-[12.5px] align-middle ${shrink ? "w-[1%] whitespace-nowrap" : ""} ${numeric ? "tabular-nums" : ""} ${className}`}
      style={{ borderColor: "var(--m3-outline)" }}
    >
      {children}
    </td>
  );
}
