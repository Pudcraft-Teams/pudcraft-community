import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "找回密码",
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
