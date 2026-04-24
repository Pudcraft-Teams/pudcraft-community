import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Console landing page.
 * Redirects to the first owned server, or shows an onboarding card.
 */
export default async function ConsoleRootPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login?callbackUrl=%2Fconsole");
  }

  const firstServer = await prisma.server.findFirst({
    where: { ownerId: userId },
    orderBy: [{ isOnline: "desc" }, { updatedAt: "desc" }],
    select: { id: true },
  });

  if (firstServer) {
    redirect(`/console/${firstServer.id}`);
  }

  const t = await getTranslations("console.entry");

  return (
    <div className="m3-surface p-8 text-center">
      <h1 className="text-2xl font-semibold text-warm-700">{t("heading")}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm text-warm-600">{t("description")}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/submit" className="m3-btn m3-btn-primary">
          {t("submitServer")}
        </Link>
        <Link href="/" className="m3-btn m3-btn-tonal">
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
