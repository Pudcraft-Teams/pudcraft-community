import { CirclePage } from "@/components/forum/CirclePage";

export default async function CirclePageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CirclePage slug={slug} />;
}
