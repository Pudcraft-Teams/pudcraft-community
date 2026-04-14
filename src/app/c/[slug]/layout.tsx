import type { ReactNode } from "react";
import { ComposeProvider } from "@/components/forum/ComposeDialog";

export const dynamic = "force-dynamic";

export default function CircleLayout({ children }: { children: ReactNode }) {
  return <ComposeProvider>{children}</ComposeProvider>;
}
