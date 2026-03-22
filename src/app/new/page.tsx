import { CreatePostForm } from "@/components/forum/CreatePostForm";

export default function NewPostPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold text-warm-800">发帖</h1>
      <CreatePostForm />
    </div>
  );
}
