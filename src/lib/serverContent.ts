const META_HEADER = "## 基础信息";
const VERSION_PREFIX = "- 游戏版本：";
const MAX_PLAYERS_PREFIX = "- 最大玩家数：";
const QQ_GROUP_PREFIX = "- QQ 群：";

export interface ServerContentMetadata {
  body: string;
  version: string | null;
  maxPlayers: number | null;
  qqGroup: string | null;
}

function normalizeBody(body: string | undefined): string {
  return body?.trim() ?? "";
}

/**
 * 构建服务器 Markdown 内容，自动附加基础信息区块。
 */
export function buildServerContent({
  version,
  content,
  maxPlayers,
  qqGroup,
}: {
  version: string;
  content: string | undefined;
  maxPlayers: number | undefined;
  qqGroup: string | undefined;
}): string {
  const normalizedVersion = version.trim() || "未知";
  const metadataLines = [`${VERSION_PREFIX}${normalizedVersion}`];

  if (typeof maxPlayers === "number") {
    metadataLines.push(`${MAX_PLAYERS_PREFIX}${maxPlayers}`);
  }

  if (qqGroup) {
    metadataLines.push(`${QQ_GROUP_PREFIX}${qqGroup.trim()}`);
  }

  const mainContent = normalizeBody(content);
  if (!mainContent) {
    return `${META_HEADER}\n${metadataLines.join("\n")}`;
  }

  return `${mainContent}\n\n${META_HEADER}\n${metadataLines.join("\n")}`;
}

/**
 * 从服务器 Markdown 内容中提取基础信息区块，便于编辑时预填充。
 */
export function extractServerContentMetadata(content: string | null): ServerContentMetadata {
  if (!content) {
    return {
      body: "",
      version: null,
      maxPlayers: null,
      qqGroup: null,
    };
  }

  const raw = content.trim();
  const markerWithBreak = `\n${META_HEADER}\n`;
  const inlineMarker = `${META_HEADER}\n`;

  let body = raw;
  let metaBlock = "";

  const markerIndex = raw.lastIndexOf(markerWithBreak);
  if (markerIndex >= 0) {
    body = raw.slice(0, markerIndex).trim();
    metaBlock = raw.slice(markerIndex + markerWithBreak.length).trim();
  } else if (raw.startsWith(inlineMarker)) {
    body = "";
    metaBlock = raw.slice(inlineMarker.length).trim();
  }

  let version: string | null = null;
  let maxPlayers: number | null = null;
  let qqGroup: string | null = null;

  if (metaBlock) {
    const lines = metaBlock.split("\n").map((line) => line.trim());
    for (const line of lines) {
      if (line.startsWith(VERSION_PREFIX)) {
        version = line.slice(VERSION_PREFIX.length).trim() || null;
        continue;
      }

      if (line.startsWith(MAX_PLAYERS_PREFIX)) {
        const rawValue = line.slice(MAX_PLAYERS_PREFIX.length).trim();
        const parsed = Number(rawValue);
        maxPlayers = Number.isFinite(parsed) ? parsed : null;
        continue;
      }

      if (line.startsWith(QQ_GROUP_PREFIX)) {
        qqGroup = line.slice(QQ_GROUP_PREFIX.length).trim() || null;
      }
    }
  }

  return {
    body,
    version,
    maxPlayers,
    qqGroup,
  };
}
