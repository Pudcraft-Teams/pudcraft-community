export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { Nunito } from "next/font/google";
import { AuthButtons, MobileNavMenu } from "@/components/AuthButtons";
import { Providers } from "@/components/Providers";
import "@/styles/globals.css";
import "cropperjs/dist/cropper.css";

const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800"],
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
      <body className={`${nunito.variable} min-h-screen antialiased`}>
        <Providers>
          {/* ─── Header ─── */}
          <header className="sticky top-0 z-50 bg-[#FFFAF6]/85 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
              <Link
                href="/"
                className="group flex items-center gap-2.5"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#D4715E] to-[#D4956A] text-base text-white shadow-sm shadow-[#D4715E]/20 transition-transform group-hover:scale-105">⛏</span>
                <span className="text-lg font-extrabold tracking-tight text-[#8B4533]">Pudcraft</span>
              </Link>
              <nav className="hidden items-center gap-1 md:flex">
                <Link href="/" className="nav-link">
                  首页
                </Link>
                <Link href="/changelog" className="nav-link">
                  更新日志
                </Link>
                <div className="ml-2 pl-2 border-l border-[#E8DDD4]">
                  <AuthButtons />
                </div>
              </nav>
              <div className="md:hidden">
                <MobileNavMenu />
              </div>
            </div>
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <div className="h-px bg-gradient-to-r from-transparent via-[#E8DDD4] to-transparent" />
            </div>
          </header>

          {/* ─── Main ─── */}
          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>

          {/* ─── Footer ─── */}
          <footer className="mt-12 border-t border-[#E8DDD4]/60 bg-[#FBEEE6]/40 py-8 text-center text-xs text-[#9C8577]">
            <p className="font-semibold text-[#8B4533]/60">Pudcraft Community</p>
            <p className="mt-1">发现优质 Minecraft 服务器 &middot; &copy; 2026</p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
