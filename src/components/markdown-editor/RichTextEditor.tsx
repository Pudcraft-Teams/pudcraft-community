"use client";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { sanitizeEditorHtml } from "@/lib/markdown-editor-conversion";

interface RichTextEditorProps {
  html: string;
  placeholder?: string;
  disabled?: boolean;
  onHtmlChange: (nextHtml: string) => void;
  onUploadImage?: (file: File) => Promise<string | null>;
}

interface ToolbarButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function ToolbarButton({ label, onClick, active = false, disabled = false }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-medium transition-colors ${
        active
          ? "border-coral/30 bg-coral-light text-coral"
          : "border-warm-200 bg-[#FFFAF6] text-warm-600 hover:bg-warm-100"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

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
          "min-h-[220px] w-full rounded-b-xl px-4 py-3 text-sm leading-7 text-warm-700 focus:outline-none",
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
    <div className="overflow-hidden rounded-xl border border-warm-200 bg-[#FFFAF6]">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleImageInputChange}
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-warm-200 bg-warm-100 px-3 py-2">
        <ToolbarButton
          label="H2"
          disabled={buttonDisabled}
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          label="H3"
          disabled={buttonDisabled}
          active={editor?.isActive("heading", { level: 3 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <ToolbarButton
          label="B"
          disabled={buttonDisabled}
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="I"
          disabled={buttonDisabled}
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="U"
          disabled={buttonDisabled}
          active={editor?.isActive("underline")}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          label="S"
          disabled={buttonDisabled}
          active={editor?.isActive("strike")}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          label="• 列表"
          disabled={buttonDisabled}
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="1. 列表"
          disabled={buttonDisabled}
          active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="引用"
          disabled={buttonDisabled}
          active={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          label="`code`"
          disabled={buttonDisabled}
          active={editor?.isActive("code")}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        />
        <ToolbarButton
          label="代码块"
          disabled={buttonDisabled}
          active={editor?.isActive("codeBlock")}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarButton
          label="链接"
          disabled={buttonDisabled}
          active={editor?.isActive("link")}
          onClick={setLink}
        />
        <ToolbarButton
          label={isUploadingImage ? "上传中..." : "图片"}
          disabled={buttonDisabled}
          onClick={onUploadImage ? pickAndUploadImage : setImageByUrl}
        />
        <ToolbarButton
          label="撤销"
          disabled={buttonDisabled || !editor?.can().undo()}
          onClick={() => editor?.chain().focus().undo().run()}
        />
        <ToolbarButton
          label="重做"
          disabled={buttonDisabled || !editor?.can().redo()}
          onClick={() => editor?.chain().focus().redo().run()}
        />
      </div>

      <div className="relative">
        <EditorContent editor={editor} />
        {!editor && (
          <div className="min-h-[220px] px-4 py-3 text-sm text-warm-500">编辑器加载中...</div>
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
