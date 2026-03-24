import { prisma } from "@/lib/db";

const CUID_PATTERN = /^c[a-z0-9]{20,30}$/;

export async function resolveCircleId(idOrSlug: string): Promise<string | null> {
  const isCuid = CUID_PATTERN.test(idOrSlug);
  const circle = await prisma.circle.findUnique({
    where: isCuid ? { id: idOrSlug } : { slug: idOrSlug },
    select: { id: true },
  });
  return circle?.id ?? null;
}
