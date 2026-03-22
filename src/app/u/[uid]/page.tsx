import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPublicUrl } from "@/lib/storage";
import { UserProfilePage } from "@/components/forum/UserProfilePage";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ uid: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { uid } = await params;
  const uidNum = parseInt(uid, 10);
  if (isNaN(uidNum)) return { title: "用户不存在" };

  const user = await prisma.user.findUnique({
    where: { uid: uidNum },
    select: { name: true, bio: true },
  });

  if (!user) return { title: "用户不存在" };

  const displayName = user.name?.trim() || "用户";

  return {
    title: `${displayName} 的主页`,
    description: user.bio?.trim() || `${displayName} 的 PudCraft 社区主页`,
    robots: { index: false, follow: false },
  };
}

export default async function UserPage({ params }: PageProps) {
  const { uid } = await params;
  const uidNum = parseInt(uid, 10);
  if (isNaN(uidNum)) notFound();

  const user = await prisma.user.findUnique({
    where: { uid: uidNum },
    select: {
      id: true,
      uid: true,
      name: true,
      image: true,
      bio: true,
      createdAt: true,
    },
  });

  if (!user) notFound();

  const userData = {
    id: user.id,
    uid: user.uid,
    name: user.name,
    image: getPublicUrl(user.image),
    bio: user.bio,
    createdAt: user.createdAt.toISOString(),
  };

  return <UserProfilePage uid={uid} user={userData} />;
}
