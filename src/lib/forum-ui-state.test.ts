import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeedCircleCardKey,
  buildCirclePageState,
  buildPostDetailState,
} from "@/lib/forum-ui-state";

import type { CircleDetail, ForumComment, PostDetail, PostItem, SectionItem } from "@/lib/types";

const circleA: CircleDetail = {
  id: "circle-a",
  name: "Circle A",
  slug: "circle-a",
  description: "first circle",
  icon: null,
  banner: null,
  memberCount: 10,
  postCount: 2,
  creatorId: "user-a",
  creator: null,
  createdAt: "2026-03-30T00:00:00.000Z",
  isMember: true,
  memberRole: "MEMBER",
};

const sectionA: SectionItem = {
  id: "section-a",
  name: "General",
  description: null,
  sortOrder: 1,
};

const postItemA: PostItem = {
  id: "post-a",
  title: "Post A",
  contentPreview: "preview a",
  authorId: "user-a",
  author: { id: "user-a", uid: 1, name: "A", image: null },
  circleId: "circle-a",
  circle: { id: "circle-a", name: "Circle A", slug: "circle-a" },
  sectionId: "section-a",
  section: { id: "section-a", name: "General" },
  viewCount: 1,
  likeCount: 2,
  commentCount: 3,
  isPinned: false,
  isLiked: false,
  images: [],
  isBookmarked: false,
  createdAt: "2026-03-30T00:00:00.000Z",
};

const postDetailA: PostDetail = {
  ...postItemA,
  content: "full content a",
  updatedAt: "2026-03-30T00:00:00.000Z",
};

const commentA: ForumComment = {
  id: "comment-a",
  content: "comment a",
  authorId: "user-a",
  author: { id: "user-a", uid: 1, name: "A", image: null },
  parentCommentId: null,
  parentAuthor: null,
  likeCount: 0,
  isLiked: false,
  createdAt: "2026-03-30T00:00:00.000Z",
};

test("buildCirclePageState keeps incoming server props as the next client state", () => {
  assert.deepEqual(
    buildCirclePageState({
      initialCircle: circleA,
      initialSections: [sectionA],
      initialPosts: [postItemA],
      initialNextCursor: "cursor-a",
    }),
    {
      circle: circleA,
      sections: [sectionA],
      posts: [postItemA],
      nextCursor: "cursor-a",
      isLoading: false,
    },
  );
});

test("buildPostDetailState keeps post and derived flags synchronized with initialPost", () => {
  assert.deepEqual(
    buildPostDetailState({
      initialPost: {
        ...postDetailA,
        isLiked: true,
        likeCount: 9,
        isBookmarked: true,
        isPinned: true,
      },
      initialComments: [commentA],
      initialNextCursor: "next-comment",
    }),
    {
      post: {
        ...postDetailA,
        isLiked: true,
        likeCount: 9,
        isBookmarked: true,
        isPinned: true,
      },
      liked: true,
      likeCount: 9,
      bookmarked: true,
      isPinned: true,
      comments: [commentA],
      commentNextCursor: "next-comment",
      isLoading: false,
    },
  );
});

test("buildFeedCircleCardKey stays stable across optimistic membership updates", () => {
  const beforeJoin = {
    id: "circle-a",
    isMember: false,
    memberCount: 10,
  };
  const afterJoin = {
    id: "circle-a",
    isMember: true,
    memberCount: 11,
  };

  assert.equal(
    buildFeedCircleCardKey("popular", "desktop", beforeJoin),
    buildFeedCircleCardKey("popular", "desktop", afterJoin),
  );
  assert.equal(
    buildFeedCircleCardKey("joined", "mobile", beforeJoin),
    "joined-mobile-circle-a",
  );
});
