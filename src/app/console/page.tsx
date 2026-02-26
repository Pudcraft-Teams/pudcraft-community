import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * 控制台首页。
 * 有服务器时跳转到首个服务器面板，无服务器时展示引导。
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

  return (
    <div className="m3-surface p-8 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">欢迎使用服主控制台</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm text-slate-600">
        你目前还没有可管理的服务器。先提交一个服务器，审核通过后即可在控制台查看趋势数据和管理操作。
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link href="/submit" className="m3-btn m3-btn-primary">
          提交新服务器
        </Link>
        <Link href="/" className="m3-btn m3-btn-tonal">
          返回首页
        </Link>
      </div>
    </div>
  );
}
