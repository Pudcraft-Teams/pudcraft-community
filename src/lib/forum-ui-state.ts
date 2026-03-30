import type {
  CircleDetail,
  ForumComment,
  PostDetail,
  PostItem,
  SectionItem,
} from "@/lib/types";

interface CirclePageStateInput {
  initialCircle?: CircleDetail;
  initialSections?: SectionItem[];
  initialPosts?: PostItem[];
  initialNextCursor?: string | null;
}

interface PostDetailStateInput {
  initialPost?: PostDetail;
  initialComments?: ForumComment[];
  initialNextCursor?: string | null;
}

export function buildCirclePageState({
  initialCircle,
  initialSections = [],
  initialPosts = [],
  initialNextCursor = null,
}: CirclePageStateInput) {
  return {
    circle: initialCircle ?? null,
    sections: initialSections,
    posts: initialPosts,
    nextCursor: initialNextCursor,
    isLoading: !initialCircle,
  };
}

export function buildPostDetailState({
  initialPost,
  initialComments,
  initialNextCursor = null,
}: PostDetailStateInput) {
  return {
    post: initialPost ?? null,
    liked: initialPost?.isLiked ?? false,
    likeCount: initialPost?.likeCount ?? 0,
    bookmarked: initialPost?.isBookmarked ?? false,
    isPinned: initialPost?.isPinned ?? false,
    comments: initialComments ?? [],
    commentNextCursor: initialNextCursor,
    isLoading: !initialPost,
  };
}
