import { CircleSettings } from "@/components/forum/CircleSettings";

export const dynamic = "force-dynamic";

export default async function CircleSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CircleSettings circleSlug={slug} />;
}
