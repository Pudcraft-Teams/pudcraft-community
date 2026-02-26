import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "个人资料设置",
};

export default function ProfileSettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
