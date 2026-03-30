import { notFound } from "next/navigation";
import { PostDetailPage } from "@/components/forum/PostDetailPage";
import { getPostPageData } from "@/app/post/[postId]/page";

export const dynamic = "force-dynamic";

export default async function CirclePostPage({
  params,
}: {
  params: Promise<{ slug: string; postId: string }>;
}) {
  const { slug, postId } = await params;
  const data = await getPostPageData(postId);
  if (!data) {
    notFound();
  }

  return (
    <PostDetailPage
      postId={postId}
      circleSlug={slug}
      initialPost={data.post}
      initialComments={data.comments}
      initialNextCursor={data.nextCursor}
    />
  );
}
