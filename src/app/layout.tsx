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
          <header className="sticky top-0 z-50 border-b border-[#E8DDD4] bg-[#FFFAF6]/90 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
              <Link
                href="/"
                className="flex items-center gap-2 text-lg font-bold tracking-tight text-[#8B4533]"
              >
                <span className="text-xl">⛏</span>
                <span>Pudcraft Community</span>
              </Link>
              <nav className="hidden items-center gap-4 text-sm text-[#9C8577] md:flex">
                <Link href="/" className="m3-link">
                  首页
                </Link>
                <Link href="/changelog" className="m3-link">
                  更新日志
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
          <footer className="border-t border-[#E8DDD4] py-6 text-center text-xs text-[#9C8577]">
            Pudcraft Community &copy; 2026 &mdash; Minecraft 服务器聚合站
          </footer>
        </Providers>
      </body>
    </html>
  );
}
