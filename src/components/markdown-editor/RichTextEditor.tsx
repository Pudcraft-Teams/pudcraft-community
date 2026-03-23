"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { type ChangeEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { sanitizeEditorHtml } from "@/lib/markdown-editor-conversion";

interface RichTextEditorProps {
  html: string;
  placeholder?: string;
  disabled?: boolean;
  onHtmlChange: (nextHtml: string) => void;
  onUploadImage?: (file: File) => Promise<string | null>;
}

interface ToolbarButtonProps {
  icon: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function ToolbarButton({ icon, title, onClick, active = false, disabled = false }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
        active
          ? "bg-accent-muted text-accent"
          : "text-warm-500 hover:bg-warm-200/60 hover:text-warm-700"
      } disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {icon}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px bg-warm-200" />;
}

/* ── SVG Icons (18×18) ── */

const iconH2 = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" />
    <path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" />
  </svg>
);

const iconH3 = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" />
    <path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2" />
    <path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2" />
  </svg>
);

const iconBold = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
  </svg>
);

const iconItalic = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
  </svg>
);

const iconUnderline = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4v6a6 6 0 0 0 12 0V4" /><line x1="4" y1="20" x2="20" y2="20" />
  </svg>
);

const iconStrikethrough = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4H9a3 3 0 0 0-2.83 4" /><path d="M14 12a4 4 0 0 1 0 8H6" /><line x1="4" y1="12" x2="20" y2="12" />
  </svg>
);

const iconBulletList = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
    <circle cx="5" cy="6" r="1" fill="currentColor" /><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="5" cy="18" r="1" fill="currentColor" />
  </svg>
);

const iconOrderedList = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
    <path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
  </svg>
);

const iconQuote = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
    <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
  </svg>
);

const iconCode = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
  </svg>
);

const iconCodeBlock = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <polyline points="10 8 6 12 10 16" /><polyline points="14 8 18 12 14 16" />
  </svg>
);

const iconLink = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const iconImage = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

const iconUndo = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
);

const iconRedo = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
  </svg>
);

export function RichTextEditor({
  html,
  placeholder,
  disabled = false,
  onHtmlChange,
  onUploadImage,
}: RichTextEditorProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handleUpdate = useCallback(
    ({ editor }: { editor: { getHTML: () => string } }) => {
      onHtmlChange(editor.getHTML());
    },
    [onHtmlChange],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: html || "<p></p>",
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Underline,
      Link.configure({
        autolink: true,
        openOnClick: false,
        linkOnPaste: true,
      }),
      Image.configure({
        allowBase64: false,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[220px] w-full rounded-b-xl px-4 py-3 text-sm leading-7 text-warm-800 focus:outline-none",
      },
      transformPastedHTML: (pastedHtml) => sanitizeEditorHtml(pastedHtml),
    },
    onUpdate: handleUpdate,
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const nextHtml = html.trim() ? html : "<p></p>";
    if (nextHtml === editor.getHTML()) {
      return;
    }

    editor.commands.setContent(nextHtml, { emitUpdate: false });
  }, [editor, html]);

  const setLink = useCallback(() => {
    if (!editor || disabled) {
      return;
    }

    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("请输入链接 URL", previousUrl ?? "https://");
    if (url === null) {
      return;
    }

    const nextUrl = url.trim();
    if (!nextUrl) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href: nextUrl,
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      })
      .run();
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || disabled) {
      return;
    }

    const dom = editor.view.dom;
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod) {
        return;
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLink();
      }
    };

    dom.addEventListener("keydown", handleKeyDown);
    return () => {
      dom.removeEventListener("keydown", handleKeyDown);
    };
  }, [disabled, editor, setLink]);

  const setImageByUrl = () => {
    if (!editor || disabled) {
      return;
    }

    const url = window.prompt("请输入图片 URL", "https://");
    if (!url) {
      return;
    }

    const nextUrl = url.trim();
    if (!nextUrl) {
      return;
    }

    editor.chain().focus().setImage({ src: nextUrl }).run();
  };

  const pickAndUploadImage = async () => {
    if (disabled) {
      return;
    }

    imageInputRef.current?.click();
  };

  const handleImageInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file || !editor) {
      return;
    }

    if (!onUploadImage) {
      setImageByUrl();
      return;
    }

    setIsUploadingImage(true);
    try {
      const uploadedUrl = await onUploadImage(file);
      if (!uploadedUrl) {
        return;
      }

      editor.chain().focus().setImage({ src: uploadedUrl }).run();
    } finally {
      setIsUploadingImage(false);
    }
  };

  const buttonDisabled = disabled || !editor || isUploadingImage;

  return (
    <div className="overflow-hidden rounded-xl border border-warm-200 bg-surface">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleImageInputChange}
      />

      <div className="flex flex-wrap items-center gap-0.5 border-b border-warm-200 bg-warm-50 px-2 py-1.5">
        <ToolbarButton
          icon={iconH2}
          title="二级标题"
          disabled={buttonDisabled}
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          icon={iconH3}
          title="三级标题"
          disabled={buttonDisabled}
          active={editor?.isActive("heading", { level: 3 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={iconBold}
          title="粗体"
          disabled={buttonDisabled}
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={iconItalic}
          title="斜体"
          disabled={buttonDisabled}
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={iconUnderline}
          title="下划线"
          disabled={buttonDisabled}
          active={editor?.isActive("underline")}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          icon={iconStrikethrough}
          title="删除线"
          disabled={buttonDisabled}
          active={editor?.isActive("strike")}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={iconBulletList}
          title="无序列表"
          disabled={buttonDisabled}
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={iconOrderedList}
          title="有序列表"
          disabled={buttonDisabled}
          active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={iconQuote}
          title="引用"
          disabled={buttonDisabled}
          active={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={iconCode}
          title="行内代码"
          disabled={buttonDisabled}
          active={editor?.isActive("code")}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        />
        <ToolbarButton
          icon={iconCodeBlock}
          title="代码块"
          disabled={buttonDisabled}
          active={editor?.isActive("codeBlock")}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        />

        <ToolbarDivider />

        <ToolbarButton
          icon={iconLink}
          title="链接"
          disabled={buttonDisabled}
          active={editor?.isActive("link")}
          onClick={setLink}
        />
        <ToolbarButton
          icon={isUploadingImage ? <span className="text-xs">...</span> : iconImage}
          title={isUploadingImage ? "上传中..." : "插入图片"}
          disabled={buttonDisabled}
          onClick={onUploadImage ? pickAndUploadImage : setImageByUrl}
        />

        <div className="flex-1" />

        <ToolbarButton
          icon={iconUndo}
          title="撤销"
          disabled={buttonDisabled || !editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        />
        <ToolbarButton
          icon={iconRedo}
          title="重做"
          disabled={buttonDisabled || !editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        />
      </div>

      <div className="relative">
        <EditorContent editor={editor} />
        {!editor && (
          <div className="min-h-[220px] px-4 py-3 text-sm text-warm-400">编辑器加载中...</div>
        )}
        {placeholder && editor?.isEmpty && (
          <span className="pointer-events-none absolute left-4 top-3 text-sm text-warm-400">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}
