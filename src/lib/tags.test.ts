import assert from "node:assert/strict";
import test from "node:test";
import { resolvePostTags } from "./tags";

test("resolvePostTags falls back to hashtags from content when explicit tags are absent", () => {
  const tags = resolvePostTags({
    content: "聊聊 #红石 和 #生存，再带一个重复 #红石",
  });

  assert.deepEqual(tags, ["红石", "生存"]);
});

test("resolvePostTags normalizes explicit tags before saving", () => {
  const tags = resolvePostTags({
    content: "这里的正文不重要",
    tags: ["  Alpha  ", "beta", "ALPHA", "Gamma", "Delta", "Epsilon", "Zeta"],
  });

  assert.deepEqual(tags, ["Alpha", "beta", "Gamma", "Delta", "Epsilon"]);
});

test("resolvePostTags preserves explicit empty tag lists instead of re-extracting from content", () => {
  const tags = resolvePostTags({
    content: "这里有 #不会 #被重新提取",
    tags: [],
  });

  assert.deepEqual(tags, []);
});
