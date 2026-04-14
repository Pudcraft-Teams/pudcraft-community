import test from "node:test";
import assert from "node:assert/strict";
import { buildMobileInboxUnreadSummary, handleMobileInboxGet, mergeInboxItems } from "./inboxFacade";

test("mergeInboxItems sorts notifications newest first", () => {
  const items = mergeInboxItems(
    [{ id: "server-1", createdAt: "2026-03-27T12:00:00.000Z", kind: "server", read: false, title: "s", body: "s", destination: null }],
    [],
  );

  assert.equal(items[0]?.id, "server-1");
});

test("buildMobileInboxUnreadSummary returns a server-only unread split", () => {
  assert.deepEqual(buildMobileInboxUnreadSummary(7), {
    serverUnread: 7,
    forumUnread: 0,
    unreadCount: 7,
  });
});

test("handleMobileInboxGet caps totalPages to the supported merged fetch window", async () => {
  const response = await handleMobileInboxGet(new Request("https://example.com/api/mobile/inbox?page=1&limit=20"), {
    requireActiveUserImpl: async () => ({
      user: {
        id: "user-1",
      },
    }),
    loadServerInboxData: async () => ({
      serverTotal: 360,
      serverUnread: 7,
      serverNotifications: [],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    notifications: [],
    total: 360,
    unreadCount: 7,
    serverUnread: 7,
    forumUnread: 0,
    page: 1,
    totalPages: 18,
  });
});

test("handleMobileInboxGet returns only server notifications with a stable unread shape", async () => {
  const response = await handleMobileInboxGet(new Request("https://example.com/api/mobile/inbox?page=1&limit=20"), {
    requireActiveUserImpl: async () => ({
      user: {
        id: "user-1",
      },
    }),
    loadServerInboxData: async () => ({
      serverTotal: 2,
      serverUnread: 1,
      serverNotifications: [
        {
          id: "server-2",
          title: "服务器已上线",
          message: "你收藏的服务器恢复在线。",
          link: "/servers/server-2",
          readAt: null,
          createdAt: new Date("2026-03-27T13:00:00.000Z"),
        },
        {
          id: "server-1",
          title: "审核通过",
          message: "你的服务器已通过审核。",
          link: "/console/servers/server-1",
          readAt: new Date("2026-03-27T11:00:00.000Z"),
          createdAt: new Date("2026-03-27T12:00:00.000Z"),
        },
      ],
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    notifications: [
      {
        id: "server-2",
        kind: "server",
        title: "服务器已上线",
        body: "你收藏的服务器恢复在线。",
        destination: "/servers/server-2",
        read: false,
        createdAt: "2026-03-27T13:00:00.000Z",
      },
      {
        id: "server-1",
        kind: "server",
        title: "审核通过",
        body: "你的服务器已通过审核。",
        destination: "/console/servers/server-1",
        read: true,
        createdAt: "2026-03-27T12:00:00.000Z",
      },
    ],
    total: 2,
    unreadCount: 1,
    serverUnread: 1,
    forumUnread: 0,
    page: 1,
    totalPages: 1,
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
    loadServerInboxData: async () => {
      loadInboxDataCalled = true;
      return {
        serverTotal: 0,
        serverUnread: 0,
        serverNotifications: [],
      };
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "分页过深" });
  assert.equal(loadInboxDataCalled, false);
});
