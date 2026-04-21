export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { AuthButtons, MobileNavMenu } from "@/components/AuthButtons";
import { HeaderSearch } from "@/components/HeaderSearch";
import { Providers } from "@/components/Providers";
import { isLocale, localeHtmlLang } from "@/i18n/config";
import "@/styles/globals.css";
import "cropperjs/dist/cropper.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");

  return {
    metadataBase: new URL("https://pudcraft.cn"),
    title: {
      default: t("title"),
      template: `%s | ${t("siteName")}`,
    },
    description: t("description"),
    keywords: t.raw("keywords") as string[],
    authors: [{ name: "PudCraft" }],
    openGraph: {
      type: "website",
      locale: "zh_CN",
      siteName: t("siteName"),
      title: t("title"),
      description: t("description"),
      url: "https://pudcraft.cn",
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const htmlLang = isLocale(locale) ? localeHtmlLang[locale] : "zh-CN";
  const tNav = await getTranslations("nav");
  const tFooter = await getTranslations("footer");

  return (
    <html lang={htmlLang}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {/* ─── Skip Link ─── */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
            >
              {tNav("skipToContent")}
            </a>

            {/* ─── Header ─── */}
            <header className="sticky top-0 z-50 border-b border-warm-200 bg-surface/95 backdrop-blur-sm">
              <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
                <Link href="/" className="group flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-warm-800">Pudcraft</span>
                  <span className="text-xs font-medium text-warm-400">{tNav("brandTagline")}</span>
                </Link>
                <nav className="hidden items-center gap-1 md:flex">
                  <Link href="/servers" className="nav-link">
                    {tNav("servers")}
                  </Link>
                  <Link href="/changelog" className="nav-link">
                    {tNav("changelog")}
                  </Link>
                  <div className="ml-3 border-l border-warm-200 pl-3">
                    <HeaderSearch />
                  </div>
                  <div className="ml-2 border-l border-warm-200 pl-2">
                    <AuthButtons />
                  </div>
                </nav>
                <div className="flex items-center gap-2 md:hidden">
                  <HeaderSearch variant="mobile" />
                  <MobileNavMenu />
                </div>
              </div>
            </header>

            {/* ─── Main ─── */}
            <main
              id="main-content"
              className="m3-safe-bottom-pad mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8 md:pb-8"
            >
              {children}
            </main>

            {/* ─── Footer ─── */}
            <footer className="mt-16 border-t border-warm-200 py-8 text-center text-xs text-warm-400">
              <p className="font-medium text-warm-500">Pudcraft Community</p>
              <p className="mt-1">{tFooter("copyright", { year: 2026 })}</p>
            </footer>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
