import test from "node:test";
import assert from "node:assert/strict";
import { buildMobileInboxUnreadSummary, handleMobileInboxGet, mergeInboxItems } from "./inboxFacade";

test("mergeInboxItems sorts forum and server notifications newest first", () => {
  const items = mergeInboxItems(
    [{ id: "server-1", createdAt: "2026-03-27T12:00:00.000Z", kind: "server", read: false, title: "s", body: "s", destination: null }],
    [{ id: "forum-1", createdAt: "2026-03-27T13:00:00.000Z", kind: "forum", read: true, title: "f", body: "f", destination: null }],
  );

  assert.equal(items[0]?.id, "forum-1");
  assert.equal(items[1]?.id, "server-1");
});

test("buildMobileInboxUnreadSummary preserves split unread counts", () => {
  assert.deepEqual(buildMobileInboxUnreadSummary(7, 5), {
    serverUnread: 7,
    forumUnread: 5,
    unreadCount: 12,
  });
});

test("handleMobileInboxGet caps totalPages to the supported merged fetch window", async () => {
  const response = await handleMobileInboxGet(new Request("https://example.com/api/mobile/inbox?page=1&limit=20"), {
    requireActiveUserImpl: async () => ({
      user: {
        id: "user-1",
      },
    }),
    loadInboxData: async () => ({
      serverTotal: 360,
      forumTotal: 240,
      serverUnread: 7,
      forumUnread: 5,
      serverNotifications: [],
      forumNotifications: [],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    notifications: [],
    total: 600,
    unreadCount: 12,
    serverUnread: 7,
    forumUnread: 5,
    page: 1,
    totalPages: 25,
  });
});

test("handleMobileInboxGet rejects pages beyond the supported merged fetch window", async () => {
  let loadInboxDataCalled = false;

  const response = await handleMobileInboxGet(new Request("https://example.com/api/mobile/inbox?page=26&limit=20"), {
    requireActiveUserImpl: async () => ({
      user: {
        id: "user-1",
      },
    }),
    loadInboxData: async () => {
      loadInboxDataCalled = true;
      return {
        serverTotal: 0,
        forumTotal: 0,
        serverUnread: 0,
        forumUnread: 0,
        serverNotifications: [],
        forumNotifications: [],
      };
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "分页过深" });
  assert.equal(loadInboxDataCalled, false);
});
