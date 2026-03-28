import test from "node:test";
import assert from "node:assert/strict";
import {
  handleMobileLoginPost,
  handleMobileSessionGet,
  mergeSetCookieHeaders,
  readSetCookieHeaders,
  resolveAuthJsCredentialsCallback,
  toMobileLoginError,
  toMobileSessionUser,
  toRequestCookieHeader,
} from "./sessionFacade";

function readRequestHeaders(init?: RequestInit): Headers {
  return new Headers(init?.headers);
}

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

test("readSetCookieHeaders falls back to splitting a combined header without breaking expires commas", () => {
  const combinedHeader =
    "authjs.csrf-token=csrf-1; Path=/; HttpOnly; Expires=Wed, 01 Jan 2025 00:00:00 GMT, authjs.session-token=session-1; Path=/; HttpOnly; SameSite=Lax";
  const headers = {
    get(name: string) {
      return name === "set-cookie" ? combinedHeader : null;
    },
  };

  assert.deepEqual(readSetCookieHeaders(headers), [
    "authjs.csrf-token=csrf-1; Path=/; HttpOnly; Expires=Wed, 01 Jan 2025 00:00:00 GMT",
    "authjs.session-token=session-1; Path=/; HttpOnly; SameSite=Lax",
  ]);
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

test("handleMobileLoginPost forwards trusted client IP headers into the Auth.js proxy callback", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });

    if (url.endsWith("/api/auth/csrf")) {
      return new Response(JSON.stringify({ csrfToken: "csrf-1" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "authjs.csrf-token=csrf-1; Path=/; HttpOnly; SameSite=Lax",
        },
      });
    }

    if (url.endsWith("/api/auth/callback/credentials")) {
      return new Response(JSON.stringify({ url: "/" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "authjs.session-token=session-1; Path=/; HttpOnly; SameSite=Lax",
        },
      });
    }

    if (url.endsWith("/api/mobile/session")) {
      return Response.json({
        user: {
          id: "u1",
          uid: 100000001,
          name: "HePudding",
          email: "test@example.com",
          image: null,
          role: "user",
        },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const response = await handleMobileLoginPost(
    new Request("https://example.com/api/mobile/session/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "203.0.113.10",
        "cf-connecting-ip": "203.0.113.11",
      },
      body: JSON.stringify({
        email: "test@example.com",
        password: "secret",
      }),
    }),
    { fetchImpl },
  );

  assert.equal(response.status, 200);

  const csrfCall = calls.find((call) => call.url.endsWith("/api/auth/csrf"));
  assert.ok(csrfCall);
  assert.equal(readRequestHeaders(csrfCall.init).get("x-real-ip"), "203.0.113.10");
  assert.equal(readRequestHeaders(csrfCall.init).get("cf-connecting-ip"), "203.0.113.11");

  const authCall = calls.find((call) => call.url.endsWith("/api/auth/callback/credentials"));
  assert.ok(authCall);
  const authHeaders = readRequestHeaders(authCall.init);
  assert.equal(authHeaders.get("x-real-ip"), "203.0.113.10");
  assert.equal(authHeaders.get("cf-connecting-ip"), "203.0.113.11");
  assert.equal(authHeaders.get("x-auth-return-redirect"), "1");
  assert.equal(authHeaders.get("content-type"), "application/x-www-form-urlencoded");
  assert.match(authHeaders.get("cookie") ?? "", /authjs\.csrf-token=csrf-1/);
});

test("handleMobileSessionGet rejects stale JWTs for deleted users", async () => {
  const response = await handleMobileSessionGet({
    authImpl: async () => ({
      user: {
        id: "user-1",
      },
    }),
    loadUserById: async () => null,
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "用户不存在" });
});

test("handleMobileSessionGet rejects stale JWTs for banned users", async () => {
  const response = await handleMobileSessionGet({
    authImpl: async () => ({
      user: {
        id: "user-1",
      },
    }),
    loadUserById: async () => ({
      id: "user-1",
      uid: 100000001,
      name: "HePudding",
      email: "test@example.com",
      image: null,
      role: "user",
      isBanned: true,
    }),
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "账号已被封禁" });
});
