import assert from "node:assert/strict";
import test from "node:test";
import {
  canListServerInPublicOwnerContext,
  canViewServerDetails,
  getInitialServerSubmissionState,
  shouldExposeServerOwnerId,
  toPublicUserLookupId,
} from "./server-access";

test("getInitialServerSubmissionState keeps newly submitted servers pending review", () => {
  assert.deepEqual(getInitialServerSubmissionState(), {
    status: "pending",
    reviewStatus: "unreviewed",
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

test("toPublicUserLookupId returns the external uid string instead of a cuid", () => {
  assert.equal(toPublicUserLookupId(100000001), "100000001");
});
