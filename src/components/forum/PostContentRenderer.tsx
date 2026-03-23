"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";

type Segment =
  | { type: "text"; value: string }
  | { type: "hashtag"; tag: string }
  | { type: "mention"; name: string; uid: number }
  | { type: "url"; href: string };

/**
 * Parse plain text content into segments of text, #hashtags, @mentions, and URLs.
 * Mentions use the format @[DisplayName](uid:123) for precise user matching.
 * Also supports legacy plain @Name format (links to search).
 */
function parseContent(text: string): Segment[] {
  // Match:
  // 1. @[Name](uid:123) — structured mention with uid
  // 2. #话题 — hashtag
  // 3. @用户名 — legacy plain mention (fallback)
  // 4. https://... — URL
  const pattern =
    /@\[([^\]]+)\]\(uid:(\d+)\)|(#(?:[\w\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]+))|(@(?:[\w\u4e00-\u9fff\u3400-\u4dbf]+))|(https?:\/\/[^\s<]+)/g;

  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.substring(lastIndex, match.index) });
    }

    if (match[1] && match[2]) {
      // @[Name](uid:123)
      segments.push({ type: "mention", name: match[1], uid: Number(match[2]) });
    } else if (match[3]) {
      // #hashtag
      segments.push({ type: "hashtag", tag: match[3].substring(1) });
    } else if (match[4]) {
      // Legacy @mention — use uid 0 as fallback (will link to search)
      segments.push({ type: "mention", name: match[4].substring(1), uid: 0 });
    } else if (match[5]) {
      segments.push({ type: "url", href: match[5] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.substring(lastIndex) });
  }

  return segments;
}

interface PostContentRendererProps {
  content: string;
}

/**
 * 纯文本帖子内容渲染器。
 * 自动解析 #话题 为可点击标签，@用户名 为链接，URL 为外链。
 * 保留换行。
 */
export function PostContentRenderer({ content }: PostContentRendererProps) {
  const segments = useMemo(() => parseContent(content), [content]);

  return (
    <div className="whitespace-pre-wrap break-words text-warm-700 leading-relaxed">
      {segments.map((seg, i) => {
        switch (seg.type) {
          case "text":
            return <Fragment key={i}>{seg.value}</Fragment>;

          case "hashtag":
            return (
              <Link
                key={i}
                href={`/search?q=${encodeURIComponent("#" + seg.tag)}`}
                className="-mx-0.5 inline-block rounded px-0.5 text-accent transition-colors hover:text-teal-700 hover:underline active:bg-accent-muted"
                onClick={(e) => e.stopPropagation()}
              >
                #{seg.tag}
              </Link>
            );

          case "mention":
            return (
              <Link
                key={i}
                href={seg.uid > 0 ? `/u/${seg.uid}` : `/search?q=${encodeURIComponent("@" + seg.name)}`}
                className="-mx-0.5 inline-block rounded px-0.5 font-medium text-accent transition-colors hover:text-teal-700 hover:underline active:bg-accent-muted"
                onClick={(e) => e.stopPropagation()}
              >
                @{seg.name}
              </Link>
            );

          case "url":
            return (
              <a
                key={i}
                href={seg.href}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-accent underline decoration-accent/30 transition-colors hover:text-teal-700 hover:decoration-teal-700/50 active:bg-accent-muted"
                onClick={(e) => e.stopPropagation()}
              >
                {seg.href}
              </a>
            );
        }
      })}
    </div>
  );
}
