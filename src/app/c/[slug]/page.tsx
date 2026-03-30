import { cache } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPublicUrl } from "@/lib/storage";
import { CirclePage } from "@/components/forum/CirclePage";

import type { CircleDetail, PostItem, SectionItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const POSTS_PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ slug: string }>;
}

function extractContentPreview(content: string, maxLength = 200): string {
  return content.replace(/\n+/g, " ").trim().substring(0, maxLength);
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
  isLiked?: boolean;
  isBookmarked?: boolean;
}): PostItem {
  return {
    id: post.id,
    title: post.title,
    contentPreview: extractContentPreview(post.content),
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
  };
}

const getCirclePageData = cache(async (slug: string) => {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const circle = await prisma.circle.findUnique({
    where: { slug },
    include: {
      creator: {
        select: { id: true, uid: true, name: true, image: true },
      },
      server: {
        select: { id: true, psid: true, name: true, iconUrl: true },
      },
    },
  });

  if (!circle) {
    return null;
  }

  let isMember = false;
  let memberRole: CircleDetail["memberRole"] = null;

  if (userId) {
    const membership = await prisma.circleMembership.findUnique({
      where: {
        unique_circle_membership: {
          userId,
          circleId: circle.id,
        },
      },
      select: { role: true },
    });

    if (membership) {
      isMember = true;
      memberRole = membership.role;
    }
  }

  const sections = await prisma.section.findMany({
    where: { circleId: circle.id },
    orderBy: { sortOrder: "asc" },
  });

  const posts = await prisma.post.findMany({
    where: {
      circleId: circle.id,
      status: "PUBLISHED",
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: POSTS_PAGE_SIZE + 1,
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

  const hasMore = posts.length > POSTS_PAGE_SIZE;
  const sliced = hasMore ? posts.slice(0, POSTS_PAGE_SIZE) : posts;
  const nextCursor = hasMore ? sliced[sliced.length - 1]?.id ?? null : null;

  let likedPostIdSet = new Set<string>();
  let bookmarkedPostIdSet = new Set<string>();
  if (userId && sliced.length > 0) {
    const postIds = sliced.map((post) => post.id);
    const [likes, bookmarks] = await Promise.all([
      prisma.postLike.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      }),
      prisma.bookmark.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      }),
    ]);
    likedPostIdSet = new Set(likes.map((like) => like.postId));
    bookmarkedPostIdSet = new Set(bookmarks.map((bookmark) => bookmark.postId));
  }

  return {
    circle: {
      id: circle.id,
      name: circle.name,
      slug: circle.slug,
      description: circle.description,
      icon: getPublicUrl(circle.icon),
      banner: getPublicUrl(circle.banner),
      memberCount: circle.memberCount,
      postCount: circle.postCount,
      creatorId: circle.creatorId,
      creator: circle.creator
        ? { ...circle.creator, image: getPublicUrl(circle.creator.image) }
        : null,
      server: circle.server
        ? { ...circle.server, iconUrl: getPublicUrl(circle.server.iconUrl) }
        : null,
      isMember,
      memberRole,
      createdAt: circle.createdAt.toISOString(),
    } satisfies CircleDetail,
    sections: sections.map((section) => ({
      id: section.id,
      name: section.name,
      description: section.description,
      sortOrder: section.sortOrder,
    })) satisfies SectionItem[],
    posts: sliced.map((post) =>
      mapPost({
        ...post,
        isLiked: likedPostIdSet.has(post.id),
        isBookmarked: bookmarkedPostIdSet.has(post.id),
      }),
    ),
    nextCursor,
  };
});

export default async function CirclePageRoute({ params }: PageProps) {
  const { slug } = await params;
  const data = await getCirclePageData(slug);
  if (!data) {
    notFound();
  }

  return (
    <CirclePage
      slug={slug}
      initialCircle={data.circle}
      initialSections={data.sections}
      initialPosts={data.posts}
      initialNextCursor={data.nextCursor}
    />
  );
}
