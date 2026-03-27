import test from "node:test";
import assert from "node:assert/strict";
import { toMobileSessionUser } from "./sessionFacade";

test("toMobileSessionUser strips web-only fields and keeps the native summary", () => {
  const result = toMobileSessionUser({
    id: "u1",
    uid: 100000001,
    name: "HePudding",
    email: "test@example.com",
    image: "https://example.com/a.png",
    role: "user",
  });

  assert.deepEqual(result, {
    id: "u1",
    uid: 100000001,
    name: "HePudding",
    email: "test@example.com",
    image: "https://example.com/a.png",
    role: "user",
  });
});
