import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "控制台",
};

export default function MyServersLayout({ children }: { children: ReactNode }) {
  return children;
}
