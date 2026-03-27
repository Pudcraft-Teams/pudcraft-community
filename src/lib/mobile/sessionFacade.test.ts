import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeSetCookieHeaders,
  resolveAuthJsCredentialsCallback,
  toMobileLoginError,
  toMobileSessionUser,
  toRequestCookieHeader,
} from "./sessionFacade";

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

test("toMobileSessionUser normalizes missing optional fields for native consumers", () => {
  const result = toMobileSessionUser({
    id: "u1",
    uid: 100000001,
    name: undefined,
    email: undefined,
    image: undefined,
    role: undefined,
  });

  assert.deepEqual(result, {
    id: "u1",
    uid: 100000001,
    name: null,
    email: "",
    image: null,
    role: "user",
  });
});

test("mergeSetCookieHeaders keeps the latest cookie values and builds a request cookie header", () => {
  const merged = mergeSetCookieHeaders(
    [
      "authjs.csrf-token=csrf-1; Path=/; HttpOnly; SameSite=Lax",
      "authjs.callback-url=https%3A%2F%2Fexample.com%2F; Path=/; HttpOnly; SameSite=Lax",
    ],
    [
      "authjs.session-token=session-1; Path=/; HttpOnly; SameSite=Lax",
      "authjs.csrf-token=csrf-2; Path=/; HttpOnly; SameSite=Lax",
    ],
  );

  assert.deepEqual(merged, [
    "authjs.csrf-token=csrf-2; Path=/; HttpOnly; SameSite=Lax",
    "authjs.callback-url=https%3A%2F%2Fexample.com%2F; Path=/; HttpOnly; SameSite=Lax",
    "authjs.session-token=session-1; Path=/; HttpOnly; SameSite=Lax",
  ]);
  assert.equal(
    toRequestCookieHeader(merged),
    "authjs.csrf-token=csrf-2; authjs.callback-url=https%3A%2F%2Fexample.com%2F; authjs.session-token=session-1",
  );
});

test("resolveAuthJsCredentialsCallback reads invalid credentials from the redirect payload", () => {
  const result = resolveAuthJsCredentialsCallback(
    200,
    { url: "/login?error=CredentialsSignin&code=credentials" },
    "https://example.com",
  );

  assert.deepEqual(result, {
    kind: "auth_error",
    reason: "invalid_credentials",
    url: "https://example.com/login?error=CredentialsSignin&code=credentials",
  });
});

test("resolveAuthJsCredentialsCallback preserves the banned-user branch from Auth.js", () => {
  const result = resolveAuthJsCredentialsCallback(
    200,
    { url: "/login?error=CredentialsSignin&code=banned" },
    "https://example.com",
  );

  assert.deepEqual(result, {
    kind: "auth_error",
    reason: "banned",
    url: "https://example.com/login?error=CredentialsSignin&code=banned",
  });
});

test("resolveAuthJsCredentialsCallback accepts a successful redirect payload without relying on 2xx only", () => {
  const result = resolveAuthJsCredentialsCallback(302, { url: "/" }, "https://example.com");

  assert.deepEqual(result, {
    kind: "success",
    url: "https://example.com/",
  });
});

test("toMobileLoginError returns structured banned and invalid credential responses", () => {
  assert.deepEqual(toMobileLoginError("invalid_credentials"), {
    status: 401,
    body: {
      error: "邮箱或密码错误",
      code: "credentials",
    },
  });

  assert.deepEqual(toMobileLoginError("banned"), {
    status: 403,
    body: {
      error: "账号已被封禁",
      code: "banned",
    },
  });
});
