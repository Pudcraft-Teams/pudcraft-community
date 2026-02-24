import type { Metadata } from "next";
import Link from "next/link";
import { AuthButtons, MobileNavMenu } from "@/components/AuthButtons";
import { Providers } from "@/components/Providers";
import "@/styles/globals.css";
import "cropperjs/dist/cropper.css";

export const metadata: Metadata = {
  title: "Pudcraft Community — Minecraft 服务器聚合站",
  description: "发现和加入国内优质 Minecraft 私人服务器，浏览服务器状态、在线人数与社区信息。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">
        <Providers>
          {/* ─── Header ─── */}
          <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/90 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
              <Link
                href="/"
                className="m3-link flex items-center gap-2 text-lg font-bold tracking-tight"
              >
                <span className="text-xl">⛏</span>
                <span>Pudcraft Community</span>
              </Link>
              <nav className="hidden items-center gap-4 text-sm text-slate-500 md:flex">
                <Link href="/" className="m3-link">
                  首页
                </Link>
                <AuthButtons />
              </nav>
              <div className="md:hidden">
                <MobileNavMenu />
              </div>
            </div>
          </header>

          {/* ─── Main ─── */}
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

          {/* ─── Footer ─── */}
          <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
            Pudcraft Community &copy; 2025 &mdash; Minecraft 服务器聚合站
          </footer>
        </Providers>
      </body>
    </html>
  );
}
