export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { AuthButtons, MobileNavMenu } from "@/components/AuthButtons";
import { HeaderSearch } from "@/components/HeaderSearch";
import { Providers } from "@/components/Providers";
import { defaultLocale, isLocale, localeHtmlLang, type Locale } from "@/i18n/config";
import "@/styles/globals.css";
import "cropperjs/dist/cropper.css";

const openGraphLocaleByAppLocale: Record<Locale, string> = {
  zh: "zh_CN",
  en: "en_US",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  const rawLocale = await getLocale();
  const appLocale = isLocale(rawLocale) ? rawLocale : defaultLocale;
  const ogLocale = openGraphLocaleByAppLocale[appLocale];
  const alternateLocales = (Object.keys(openGraphLocaleByAppLocale) as Locale[])
    .filter((candidate) => candidate !== appLocale)
    .map((candidate) => openGraphLocaleByAppLocale[candidate]);

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
      locale: ogLocale,
      alternateLocale: alternateLocales,
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
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
            >
              {tNav("skipToContent")}
            </a>

            <header className="player-nav sticky top-0 z-50">
              <div className="player-nav-inner">
                <Link href="/" className="player-brand group">
                  <span className="player-brand-mark" aria-hidden>
                    P
                  </span>
                  <span className="player-brand-name">Pudcraft</span>
                </Link>

                <nav className="player-nav-links" aria-label={tNav("primaryNavLabel")}>
                  <Link href="/servers" className="player-nav-link">
                    {tNav("servers")}
                  </Link>
                  <Link href="/submit" className="player-nav-link">
                    {tNav("submitServer")}
                  </Link>
                </nav>

                <div className="player-nav-search hidden md:block">
                  <HeaderSearch />
                </div>

                <div className="player-nav-actions">
                  <div className="hidden md:flex md:items-center md:gap-2">
                    <AuthButtons />
                  </div>
                  <div className="flex items-center gap-2 md:hidden">
                    <HeaderSearch variant="mobile" />
                    <MobileNavMenu />
                  </div>
                </div>
              </div>
            </header>

            <main
              id="main-content"
              className="m3-safe-bottom-pad mx-auto max-w-7xl px-4 pt-6 sm:px-7 sm:pt-8 md:pb-8"
            >
              {children}
            </main>

            <footer className="player-footer">
              <p>{tFooter("tagline")}</p>
              <p className="player-footer-links">
                <Link href="/changelog">{tFooter("linkChangelog")}</Link>
                <span aria-hidden>·</span>
                <a href="https://github.com/Pudcraft-Teams/pudcraft-community" target="_blank" rel="noopener noreferrer">
                  GitHub
                </a>
                <span aria-hidden>·</span>
                <a href="https://ifdian.net/a/hepudding" target="_blank" rel="noopener noreferrer">
                  {tFooter("linkSponsor")}
                </a>
              </p>
              <p className="mt-1 text-xs text-warm-400/80">{tFooter("sponsorHint")}</p>
              <p className="player-footer-copy">{tFooter("copyright", { year: 2026 })}</p>
            </footer>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
