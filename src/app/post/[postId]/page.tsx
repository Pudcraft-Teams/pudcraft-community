import { cache } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPublicUrl } from "@/lib/storage";
import { PostDetailPage } from "@/components/forum/PostDetailPage";

import type { ForumComment, PostDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

const COMMENTS_PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ postId: string }>;
}

function mapPost(post: {
  id: string;
  title: string;
  content: string;
  authorId: string;
  author: { id: string; uid: number; name: string | null; image: string | null };
  circleId: string | null;
  circle: { id: string; name: string; slug: string } | null;
  sectionId: string | null;
  section: { id: string; name: string } | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isPinned: boolean;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
  isLiked?: boolean;
  isBookmarked?: boolean;
}): PostDetail {
  return {
    id: post.id,
    title: post.title,
    content: post.content,
    authorId: post.authorId,
    author: {
      ...post.author,
      image: getPublicUrl(post.author.image),
    },
    circleId: post.circleId,
    circle: post.circle,
    sectionId: post.sectionId,
    section: post.section,
    viewCount: post.viewCount,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    isPinned: post.isPinned,
    images: post.images.map((img) => getPublicUrl(img) ?? img),
    isLiked: post.isLiked,
    isBookmarked: post.isBookmarked,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function mapComments(comments: Array<{
  id: string;
  content: string;
  authorId: string;
  parentCommentId: string | null;
  likeCount: number;
  createdAt: Date;
  author: { id: string; uid: number; name: string | null; image: string | null };
}>, parentAuthors: Map<string, { id: string; name: string | null }>, likedSet: Set<string>): ForumComment[] {
  return comments.map((comment) => ({
    id: comment.id,
    content: comment.content,
    authorId: comment.authorId,
    author: {
      id: comment.author.id,
      uid: comment.author.uid,
      name: comment.author.name,
      image: getPublicUrl(comment.author.image),
    },
    parentCommentId: comment.parentCommentId,
    parentAuthor: comment.parentCommentId
      ? (parentAuthors.get(comment.parentCommentId) ?? null)
      : null,
    likeCount: comment.likeCount,
    isLiked: likedSet.has(comment.id),
    createdAt: comment.createdAt.toISOString(),
  }));
}

export const getPostPageData = cache(async (postId: string) => {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const isAdmin = session?.user?.role === "admin";

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: {
        select: { id: true, uid: true, name: true, image: true },
      },
      circle: {
        select: { id: true, name: true, slug: true },
      },
      section: {
        select: { id: true, name: true },
      },
    },
  });

  if (!post || post.status === "DELETED") {
    return null;
  }

  if (post.status === "HIDDEN") {
    const isAuthor = userId === post.authorId;
    let isCircleAdmin = false;

    if (userId && post.circleId && !isAdmin && !isAuthor) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: {
            userId,
            circleId: post.circleId,
          },
        },
        select: { role: true },
      });
      isCircleAdmin = membership?.role === "OWNER" || membership?.role === "ADMIN";
    }

    if (!isAuthor && !isAdmin && !isCircleAdmin) {
      return null;
    }
  }

  let isLiked: boolean | undefined;
  let isBookmarked: boolean | undefined;
  if (userId) {
    const [like, bookmark] = await Promise.all([
      prisma.postLike.findUnique({
        where: {
          unique_post_like: {
            userId,
            postId,
          },
        },
        select: { id: true },
      }),
      prisma.bookmark.findUnique({
        where: {
          unique_bookmark: {
            userId,
            postId,
          },
        },
        select: { id: true },
      }),
    ]);
    isLiked = !!like;
    isBookmarked = !!bookmark;
  }

  let comments: ForumComment[] = [];
  let nextCursor: string | null = null;

  if (post.status === "PUBLISHED") {
    const commentRows = await prisma.comment.findMany({
      where: {
        postId,
        status: "PUBLISHED",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: COMMENTS_PAGE_SIZE + 1,
      include: {
        author: {
          select: { id: true, uid: true, name: true, image: true },
        },
      },
    });

    const hasMore = commentRows.length > COMMENTS_PAGE_SIZE;
    const sliced = hasMore ? commentRows.slice(0, COMMENTS_PAGE_SIZE) : commentRows;
    nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

    const parentIds = sliced
      .map((comment) => comment.parentCommentId)
      .filter((value): value is string => value !== null);
    const parentAuthors = new Map<string, { id: string; name: string | null }>();

    if (parentIds.length > 0) {
      const parentComments = await prisma.comment.findMany({
        where: { id: { in: [...new Set(parentIds)] } },
        select: {
          id: true,
          author: { select: { id: true, name: true } },
        },
      });
      for (const parentComment of parentComments) {
        parentAuthors.set(parentComment.id, {
          id: parentComment.author.id,
          name: parentComment.author.name,
        });
      }
    }

    let likedSet = new Set<string>();
    if (userId && sliced.length > 0) {
      const commentIds = sliced.map((comment) => comment.id);
      const likes = await prisma.commentLike.findMany({
        where: {
          userId,
          commentId: { in: commentIds },
        },
        select: { commentId: true },
      });
      likedSet = new Set(likes.map((like) => like.commentId));
    }

    comments = mapComments(sliced, parentAuthors, likedSet);
  }

  return {
    post: mapPost({
      ...post,
      isLiked,
      isBookmarked,
    }),
    comments,
    nextCursor,
  };
});

export default async function PublicPostPage({ params }: PageProps) {
  const { postId } = await params;
  const data = await getPostPageData(postId);
  if (!data) {
    notFound();
  }

  return (
    <PostDetailPage
      postId={postId}
      initialPost={data.post}
      initialComments={data.comments}
      initialNextCursor={data.nextCursor}
    />
  );
}
