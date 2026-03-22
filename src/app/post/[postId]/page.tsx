import { PostDetailPage } from "@/components/forum/PostDetailPage";

export default async function PublicPostPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = await params;
  return <PostDetailPage postId={postId} />;
}
