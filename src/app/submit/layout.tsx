import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "提交服务器",
};

export default function SubmitLayout({ children }: { children: ReactNode }) {
  return children;
}
