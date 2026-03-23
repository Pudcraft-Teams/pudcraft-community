export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AuthButtons, MobileNavMenu } from "@/components/AuthButtons";
import { HeaderSearch } from "@/components/HeaderSearch";
import { Providers } from "@/components/Providers";
import "@/styles/globals.css";
import "cropperjs/dist/cropper.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pudcraft.cn"),
  title: {
    default: "PudCraft Community - 发现优质 Minecraft 服务器",
    template: "%s | PudCraft Community",
  },
  description:
    "浏览国内优质 Minecraft 私人服务器，找到适合你的社区。支持 Java 版和基岩版，实时在线状态监控。",
  keywords: ["Minecraft", "MC服务器", "我的世界", "服务器列表", "MC联机", "我的世界服务器"],
  authors: [{ name: "PudCraft" }],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "PudCraft Community",
    title: "PudCraft Community - 发现优质 Minecraft 服务器",
    description: "浏览国内优质 Minecraft 私人服务器，找到适合你的社区。",
    url: "https://pudcraft.cn",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${jakarta.variable} min-h-screen antialiased`}>
        <Providers>
          {/* ─── Skip Link ─── */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
          >
            跳到主要内容
          </a>

          {/* ─── Header ─── */}
          <header className="sticky top-0 z-50 border-b border-warm-200 bg-surface/95 backdrop-blur-sm">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
              <Link
                href="/"
                className="group flex items-center gap-2"
              >
                <span className="text-lg font-bold tracking-tight text-warm-800">Pudcraft</span>
                <span className="text-xs font-medium text-warm-400">Community</span>
              </Link>
              <nav className="hidden items-center gap-1 md:flex">
                <Link href="/" className="nav-link">
                  广场
                </Link>
                <Link href="/explore" className="nav-link">
                  探索
                </Link>
                <Link href="/servers" className="nav-link">
                  服务器
                </Link>
                <Link href="/changelog" className="nav-link">
                  更新日志
                </Link>
                <div className="ml-3 border-l border-warm-200 pl-3">
                  <HeaderSearch />
                </div>
                <div className="ml-2 border-l border-warm-200 pl-2">
                  <AuthButtons />
                </div>
              </nav>
              <div className="flex items-center gap-2 md:hidden">
                <HeaderSearch />
                <MobileNavMenu />
              </div>
            </div>
          </header>

          {/* ─── Main ─── */}
          <main id="main-content" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>

          {/* ─── Footer ─── */}
          <footer className="mt-16 border-t border-warm-200 py-8 text-center text-xs text-warm-400">
            <p className="font-medium text-warm-500">Pudcraft Community</p>
            <p className="mt-1">&copy; 2026</p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
