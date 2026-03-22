import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CreateCircleForm } from "@/components/forum/CreateCircleForm";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "创建圈子 - Pudcraft",
};

export const dynamic = "force-dynamic";

export default async function CreateCirclePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fcircles%2Fcreate");
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-warm-900 mb-6">创建圈子</h1>
      <CreateCircleForm />
    </main>
  );
}
