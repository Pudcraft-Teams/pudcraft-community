import assert from "node:assert/strict";
import test from "node:test";

import { getClientIp } from "@/lib/request-ip";

const originalTrustedProxyIpHeader = process.env.TRUSTED_PROXY_IP_HEADER;

test.after(() => {
  if (typeof originalTrustedProxyIpHeader === "string") {
    process.env.TRUSTED_PROXY_IP_HEADER = originalTrustedProxyIpHeader;
    return;
  }

  delete process.env.TRUSTED_PROXY_IP_HEADER;
});

test("getClientIp uses the terminal trusted proxy IP from forwarded chains", () => {
  process.env.TRUSTED_PROXY_IP_HEADER = "x-forwarded-for";

  const headers = new Headers({
    "x-forwarded-for": "198.51.100.10, 203.0.113.25",
  });

  assert.equal(getClientIp(headers), "203.0.113.25");
});

test("getClientIp ignores unsupported configured header names", () => {
  process.env.TRUSTED_PROXY_IP_HEADER = "x-evil-ip";

  const headers = new Headers({
    "x-evil-ip": "203.0.113.25",
  });

  assert.equal(getClientIp(headers), "unknown");
});

test("getClientIp ignores malformed IP values", () => {
  process.env.TRUSTED_PROXY_IP_HEADER = "cf-connecting-ip";

  const headers = new Headers({
    "cf-connecting-ip": "not-an-ip",
  });

  assert.equal(getClientIp(headers), "unknown");
});
