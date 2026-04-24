import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "messages");
const zh = JSON.parse(fs.readFileSync(path.join(root, "zh.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(root, "en.json"), "utf8"));

function collect(obj: unknown, prefix: string, into: Set<string>): void {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const next = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        collect(v, next, into);
      } else {
        into.add(next);
      }
    }
  }
}

function collectDottedKeyNames(obj: unknown, prefix: string, into: string[]): void {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;

  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const current = prefix ? `${prefix}.${k}` : k;
    if (k.includes(".")) into.push(current);
    collectDottedKeyNames(v, current, into);
  }
}

const zhKeys = new Set<string>();
const enKeys = new Set<string>();
collect(zh, "", zhKeys);
collect(en, "", enKeys);

const dottedZhKeys: string[] = [];
const dottedEnKeys: string[] = [];
collectDottedKeyNames(zh, "", dottedZhKeys);
collectDottedKeyNames(en, "", dottedEnKeys);

const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k)).sort();
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k)).sort();

if (
  missingInEn.length === 0 &&
  missingInZh.length === 0 &&
  dottedZhKeys.length === 0 &&
  dottedEnKeys.length === 0
) {
  console.log(`i18n:check OK — ${zhKeys.size} keys in sync.`);
  process.exit(0);
}

if (missingInEn.length > 0) {
  console.error(`Missing in messages/en.json (${missingInEn.length}):`);
  for (const k of missingInEn) console.error(`  - ${k}`);
}
if (missingInZh.length > 0) {
  console.error(`Missing in messages/zh.json (${missingInZh.length}):`);
  for (const k of missingInZh) console.error(`  - ${k}`);
}
if (dottedZhKeys.length > 0) {
  console.error(`Dotted key names in messages/zh.json (${dottedZhKeys.length}):`);
  for (const k of dottedZhKeys.sort()) console.error(`  - ${k}`);
}
if (dottedEnKeys.length > 0) {
  console.error(`Dotted key names in messages/en.json (${dottedEnKeys.length}):`);
  for (const k of dottedEnKeys.sort()) console.error(`  - ${k}`);
}
process.exit(1);
