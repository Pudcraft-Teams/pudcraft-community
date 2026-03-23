"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import Image from "next/image";
import { normalizeImageSrc } from "@/lib/image-url";

interface MentionUser {
  id: string;
  uid: number;
  name: string | null;
  image: string | null;
}

interface TagResult {
  tag: string;
  count: number;
}

type TriggerType = "mention" | "hashtag";

export interface PostTextareaHandle {
  insertTrigger: (char: "#" | "@") => void;
}

interface PostTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

/**
 * 纯文本输入框，支持 @用户 和 #话题 自动补全。
 * - 输入 @ 后跟文字 → 搜索用户
 * - 输入 # 后跟文字 → 搜索已有话题，未找到时空格结束即创建新话题
 */
export const PostTextarea = forwardRef<PostTextareaHandle, PostTextareaProps>(
  function PostTextarea({ value, onChange, placeholder, maxLength = 20000, disabled }, ref) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Unified autocomplete state ──
  const [trigger, setTrigger] = useState<TriggerType | null>(null);
  const [query, setQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [tagResults, setTagResults] = useState<TagResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [replaceRange, setReplaceRange] = useState<{
    start: number;
    end: number;
  } | null>(null);

  const resultCount =
    trigger === "mention" ? mentionResults.length : tagResults.length;

  // ── Expose insertTrigger to parent ──
  useImperativeHandle(ref, () => ({
    insertTrigger(char: "#" | "@") {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursor = textarea.selectionStart;
      const before = value.substring(0, cursor);
      const after = value.substring(cursor);
      // Add space before trigger if there's text immediately before
      const needsSpace = before.length > 0 && !/\s$/.test(before);
      const insert = (needsSpace ? " " : "") + char;
      const newValue = before + insert + after;
      onChange(newValue);

      const newCursor = cursor + insert.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursor, newCursor);
      });
    },
  }), [value, onChange]);

  // ── Detect trigger word at cursor ──
  const detectTrigger = useCallback(
    (textarea: HTMLTextAreaElement) => {
      const text = textarea.value;
      const cursor = textarea.selectionStart;

      // Walk backwards to find the start of the current word
      let start = cursor;
      while (start > 0 && !/\s/.test(text[start - 1]!)) {
        start--;
      }

      const word = text.substring(start, cursor);

      if (word.startsWith("@") && word.length > 1) {
        setTrigger("mention");
        setQuery(word.substring(1));
        setReplaceRange({ start, end: cursor });
        setSelectedIndex(0);
      } else if (word.startsWith("#") && word.length > 1) {
        setTrigger("hashtag");
        setQuery(word.substring(1));
        setReplaceRange({ start, end: cursor });
        setSelectedIndex(0);
      } else {
        resetAutocomplete();
      }
    },
    [],
  );

  function resetAutocomplete() {
    setTrigger(null);
    setQuery("");
    setMentionResults([]);
    setTagResults([]);
  }

  // ── Handle text change ──
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      detectTrigger(e.target);
    },
    [onChange, detectTrigger],
  );

  // ── Detect on cursor move ──
  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      detectTrigger(textareaRef.current);
    }
  }, [detectTrigger]);

  // ── Debounced search: users or tags ──
  useEffect(() => {
    if (!trigger || query.length === 0) {
      setMentionResults([]);
      setTagResults([]);
      return;
    }

    setLoading(true);
    const timeout = setTimeout(async () => {
      try {
        if (trigger === "mention") {
          const res = await fetch(
            `/api/users/search?q=${encodeURIComponent(query)}&limit=6`,
          );
          if (res.ok) {
            const data = (await res.json()) as { users: MentionUser[] };
            setMentionResults(data.users);
          }
        } else {
          const res = await fetch(
            `/api/tags/search?q=${encodeURIComponent(query)}&limit=8`,
          );
          if (res.ok) {
            const data = (await res.json()) as { tags: TagResult[] };
            setTagResults(data.tags);
          }
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timeout);
  }, [trigger, query]);

  // ── Select a mention ──
  const selectMention = useCallback(
    (user: MentionUser) => {
      if (!replaceRange || !textareaRef.current) return;

      const displayName = user.name ?? `用户${user.uid}`;
      // Store as @[DisplayName](uid:123) for precise matching
      const mention = `@[${displayName}](uid:${user.uid})`;
      const before = value.substring(0, replaceRange.start);
      const after = value.substring(replaceRange.end);
      const newValue = `${before}${mention} ${after}`;
      onChange(newValue);
      resetAutocomplete();

      const cursorPos = replaceRange.start + mention.length + 1;
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [replaceRange, value, onChange],
  );

  // ── Select a tag ──
  const selectTag = useCallback(
    (tag: string) => {
      if (!replaceRange || !textareaRef.current) return;

      const before = value.substring(0, replaceRange.start);
      const after = value.substring(replaceRange.end);
      const newValue = `${before}#${tag} ${after}`;
      onChange(newValue);
      resetAutocomplete();

      const cursorPos = replaceRange.start + tag.length + 2; // # + tag + space
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(cursorPos, cursorPos);
      });
    },
    [replaceRange, value, onChange],
  );

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!trigger || resultCount === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, resultCount - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (trigger === "mention") {
            selectMention(mentionResults[selectedIndex]!);
          } else {
            selectTag(tagResults[selectedIndex]!.tag);
          }
          break;
        case "Escape":
          resetAutocomplete();
          break;
      }
    },
    [
      trigger,
      resultCount,
      selectedIndex,
      selectMention,
      selectTag,
      mentionResults,
      tagResults,
    ],
  );

  // ── Close dropdown on outside click ──
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        resetAutocomplete();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown =
    trigger !== null && (resultCount > 0 || loading);

  // For hashtag: also show "create new" hint when no results
  const showTagEmpty =
    trigger === "hashtag" && !loading && tagResults.length === 0 && query.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className="m3-input min-h-[100px] w-full resize-none text-[15px] leading-relaxed sm:min-h-[120px]"
        rows={4}
      />

      {/* ── Autocomplete dropdown ── */}
      {(showDropdown || showTagEmpty) && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 z-20 mt-1.5 max-h-60 overflow-y-auto rounded-2xl border border-warm-200 bg-surface p-1 shadow-xl"
        >
          {loading && resultCount === 0 && (
            <div className="px-3 py-3 text-center text-sm text-warm-400">搜索中...</div>
          )}

          {/* ── Mention results ── */}
          {trigger === "mention" &&
            mentionResults.map((user, i) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMention(user);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  i === selectedIndex
                    ? "bg-accent-muted"
                    : "hover:bg-warm-50"
                }`}
              >
                <span className="relative inline-flex h-8 w-8 shrink-0 overflow-hidden rounded-full">
                  <Image
                    src={normalizeImageSrc(user.image) || "/default-avatar.png"}
                    alt=""
                    width={32}
                    height={32}
                    className="h-full w-full object-cover"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-warm-800">
                    {user.name ?? `用户${user.uid}`}
                  </div>
                  <div className="text-xs text-warm-400">UID {user.uid}</div>
                </div>
              </button>
            ))}

          {trigger === "mention" &&
            !loading &&
            mentionResults.length === 0 &&
            query && (
              <div className="px-3 py-3 text-center text-sm text-warm-400">
                未找到匹配的用户
              </div>
            )}

          {/* ── Tag results ── */}
          {trigger === "hashtag" &&
            tagResults.map((item, i) => (
              <button
                key={item.tag}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectTag(item.tag);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  i === selectedIndex
                    ? "bg-accent-muted"
                    : "hover:bg-warm-50"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                  #
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-warm-800">{item.tag}</div>
                  <div className="text-xs text-warm-400">{item.count} 篇帖子</div>
                </div>
              </button>
            ))}

          {/* ── No existing tag: hint to create new ── */}
          {showTagEmpty && (
            <div className="flex items-center gap-2.5 px-3 py-3 text-sm text-warm-500">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warm-100 text-sm text-warm-400">
                +
              </span>
              <span>
                空格键创建 <span className="font-medium text-accent">#{query}</span>
              </span>
            </div>
          )}
        </div>
      )}

    </div>
  );
});
