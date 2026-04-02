import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin, isAdminError } from "@/lib/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "管理后台 | PudCraft Community",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const result = await requireAdmin();
  if (isAdminError(result)) {
    redirect("/");
  }

  return (
    <div className="flex min-h-[calc(100vh-10rem)] flex-col gap-4 md:flex-row md:gap-6">
      <AdminNav />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
