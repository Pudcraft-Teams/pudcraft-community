import assert from "node:assert/strict";
import test from "node:test";

import { canViewerSeeServerAddress } from "@/lib/serverListPage";

test("canViewerSeeServerAddress keeps public server addresses visible", () => {
  assert.equal(
    canViewerSeeServerAddress(
      {
        serverId: "server-1",
        visibility: "public",
        ownerId: null,
      },
      {
        viewerUserId: null,
        viewerRole: null,
        memberServerIds: new Set(),
      },
    ),
    true,
  );
});

test("canViewerSeeServerAddress preserves private server addresses for members, owners, and admins", () => {
  assert.equal(
    canViewerSeeServerAddress(
      {
        serverId: "server-member",
        visibility: "private",
        ownerId: "owner-1",
      },
      {
        viewerUserId: "member-1",
        viewerRole: "user",
        memberServerIds: new Set(["server-member"]),
      },
    ),
    true,
  );

  assert.equal(
    canViewerSeeServerAddress(
      {
        serverId: "server-owner",
        visibility: "unlisted",
        ownerId: "owner-1",
      },
      {
        viewerUserId: "owner-1",
        viewerRole: "user",
        memberServerIds: new Set(),
      },
    ),
    true,
  );

  assert.equal(
    canViewerSeeServerAddress(
      {
        serverId: "server-admin",
        visibility: "private",
        ownerId: "owner-1",
      },
      {
        viewerUserId: "admin-1",
        viewerRole: "admin",
        memberServerIds: new Set(),
      },
    ),
    true,
  );
});

test("canViewerSeeServerAddress still hides private server addresses from strangers", () => {
  assert.equal(
    canViewerSeeServerAddress(
      {
        serverId: "server-hidden",
        visibility: "private",
        ownerId: "owner-1",
      },
      {
        viewerUserId: "stranger-1",
        viewerRole: "user",
        memberServerIds: new Set(),
      },
    ),
    false,
  );
});
