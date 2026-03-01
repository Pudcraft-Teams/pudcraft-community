"use client";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
}

/**
 * 安全 Markdown 渲染器。
 * 支持 GFM、XSS 过滤与代码高亮，适配浅色主题。
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-slate max-w-none text-slate-700">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-4 mt-8 text-3xl font-bold tracking-tight text-slate-900">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-3 mt-7 text-2xl font-semibold text-slate-900">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-3 mt-6 text-xl font-semibold text-slate-900">{children}</h3>
          ),
          p: ({ children }) => <p className="my-3 leading-7 text-slate-700">{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="m3-link font-medium underline decoration-[#2c6d78]/30 underline-offset-4"
            >
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              {children}
            </pre>
          ),
          code: ({ className, children }) => {
            const isInline = !className;
            return (
              <code
                className={
                  isInline
                    ? "rounded-md bg-[#e2f4f7] px-1 py-0.5 text-sm text-[#12373e]"
                    : `font-mono text-sm ${className ?? ""}`
                }
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm text-slate-700">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold text-slate-900">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-slate-200 px-3 py-2">{children}</td>,
          img: ({ src, alt }) => (
            // react-markdown 已配合 rehype-sanitize 过滤，src/alt 在此仅做展示。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src ?? ""}
              alt={alt ?? "图片"}
              className="my-4 h-auto max-w-full rounded-xl border border-slate-200"
              loading="lazy"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
