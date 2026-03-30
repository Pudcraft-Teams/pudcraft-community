import assert from "node:assert/strict";
import test from "node:test";
import {
  canJoinServerViaInvite,
  shouldDeletePendingApplicationAfterInviteJoin,
  shouldInvalidateInvitesWhenJoinModeChanges,
} from "./server-membership";

test("canJoinServerViaInvite only allows invite-capable join modes", () => {
  assert.equal(canJoinServerViaInvite("invite"), true);
  assert.equal(canJoinServerViaInvite("apply_and_invite"), true);
  assert.equal(canJoinServerViaInvite("apply"), false);
  assert.equal(canJoinServerViaInvite("open"), false);
});

test("shouldInvalidateInvitesWhenJoinModeChanges deletes stale invites once invite access is removed", () => {
  assert.equal(shouldInvalidateInvitesWhenJoinModeChanges("apply_and_invite", "apply"), true);
  assert.equal(shouldInvalidateInvitesWhenJoinModeChanges("invite", "open"), true);
  assert.equal(shouldInvalidateInvitesWhenJoinModeChanges("invite", "invite"), false);
});

test("shouldDeletePendingApplicationAfterInviteJoin only clears pending applications", () => {
  assert.equal(shouldDeletePendingApplicationAfterInviteJoin("pending"), true);
  assert.equal(shouldDeletePendingApplicationAfterInviteJoin("approved"), false);
  assert.equal(shouldDeletePendingApplicationAfterInviteJoin("rejected"), false);
  assert.equal(shouldDeletePendingApplicationAfterInviteJoin(null), false);
});
