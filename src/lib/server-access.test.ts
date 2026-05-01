import assert from "node:assert/strict";
import test from "node:test";
import {
  canListServerInPublicOwnerContext,
  canViewServerDetails,
  getAutoApprovedSubmissionState,
  getRejectedSubmissionState,
  shouldExposeServerOwnerId,
  toPublicUserLookupId,
} from "./server-access";

test("getAutoApprovedSubmissionState auto-approves submitted servers", () => {
  assert.deepEqual(getAutoApprovedSubmissionState(), {
    status: "approved",
    reviewStatus: "unreviewed",
  });
});

test("getRejectedSubmissionState marks submitted servers as rejected with reason", () => {
  assert.deepEqual(getRejectedSubmissionState("政治内容"), {
    status: "rejected",
    reviewStatus: "unreviewed",
    rejectReason: "政治内容",
  });
});

test("canViewServerDetails hides private server metadata from strangers", () => {
  assert.equal(
    canViewServerDetails({
      status: "approved",
      visibility: "private",
      ownerId: "owner-1",
      currentUserId: "user-2",
      currentUserRole: "user",
      isMember: false,
    }),
    false,
  );
});

test("canViewServerDetails allows private server members", () => {
  assert.equal(
    canViewServerDetails({
      status: "approved",
      visibility: "private",
      ownerId: "owner-1",
      currentUserId: "user-2",
      currentUserRole: "user",
      isMember: true,
    }),
    true,
  );
});

test("canViewServerDetails keeps non-approved private servers owner/admin-only", () => {
  assert.equal(
    canViewServerDetails({
      status: "pending",
      visibility: "private",
      ownerId: "owner-1",
      currentUserId: "user-2",
      currentUserRole: "user",
      isMember: true,
    }),
    false,
  );
});

test("canListServerInPublicOwnerContext only exposes public servers to strangers", () => {
  assert.equal(
    canListServerInPublicOwnerContext({
      status: "approved",
      visibility: "private",
      ownerId: "owner-1",
      currentUserId: "user-2",
      currentUserRole: "user",
      isMember: false,
    }),
    false,
  );

  assert.equal(
    canListServerInPublicOwnerContext({
      status: "approved",
      visibility: "public",
      ownerId: "owner-1",
      currentUserId: "user-2",
      currentUserRole: "user",
      isMember: false,
    }),
    true,
  );
});

test("shouldExposeServerOwnerId stays false for public viewers", () => {
  assert.equal(
    shouldExposeServerOwnerId({
      status: "approved",
      visibility: "public",
      ownerId: "owner-1",
      currentUserId: "user-2",
      currentUserRole: "user",
      isMember: false,
    }),
    false,
  );
});

test("toPublicUserLookupId returns the upstream Misskey id verbatim", () => {
  assert.equal(toPublicUserLookupId("9abc1234de"), "9abc1234de");
});
