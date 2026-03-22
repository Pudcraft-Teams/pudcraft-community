import { PostDetailPage } from "@/components/forum/PostDetailPage";

export default async function CirclePostPage({
  params,
}: {
  params: Promise<{ slug: string; postId: string }>;
}) {
  const { slug, postId } = await params;
  return <PostDetailPage postId={postId} circleSlug={slug} />;
}
