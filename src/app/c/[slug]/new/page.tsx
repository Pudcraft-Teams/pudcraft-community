import { CreatePostInCircle } from "@/components/forum/CreatePostInCircle";

export default async function CircleNewPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <CreatePostInCircle slug={slug} />;
}
