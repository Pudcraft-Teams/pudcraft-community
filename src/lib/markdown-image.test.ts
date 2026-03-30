import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedMarkdownImageSrc } from "@/components/MarkdownRenderer";

const TRUSTED_ORIGIN = "https://community.example.com";

test("isAllowedMarkdownImageSrc allows relative and same-origin image urls", () => {
  assert.equal(isAllowedMarkdownImageSrc("/uploads/a.webp"), true);
  assert.equal(
    isAllowedMarkdownImageSrc("https://community.example.com/uploads/a.webp", TRUSTED_ORIGIN),
    true,
  );
});

test("isAllowedMarkdownImageSrc blocks remote origins and malformed urls", () => {
  assert.equal(isAllowedMarkdownImageSrc("https://evil.example.com/a.webp", TRUSTED_ORIGIN), false);
  assert.equal(isAllowedMarkdownImageSrc("not a url", TRUSTED_ORIGIN), false);
});

test("isAllowedMarkdownImageSrc allows blob and data urls", () => {
  assert.equal(isAllowedMarkdownImageSrc("blob:abc123", TRUSTED_ORIGIN), true);
  assert.equal(isAllowedMarkdownImageSrc("data:image/png;base64,AAAA", TRUSTED_ORIGIN), true);
});
