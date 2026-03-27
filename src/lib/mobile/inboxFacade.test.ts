import test from "node:test";
import assert from "node:assert/strict";
import { mergeInboxItems } from "./inboxFacade";

test("mergeInboxItems sorts forum and server notifications newest first", () => {
  const items = mergeInboxItems(
    [{ id: "server-1", createdAt: "2026-03-27T12:00:00.000Z", kind: "server", read: false, title: "s", body: "s", destination: null }],
    [{ id: "forum-1", createdAt: "2026-03-27T13:00:00.000Z", kind: "forum", read: true, title: "f", body: "f", destination: null }],
  );

  assert.equal(items[0]?.id, "forum-1");
  assert.equal(items[1]?.id, "server-1");
});
