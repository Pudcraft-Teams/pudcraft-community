import MarkdownIt from "markdown-it";
import sanitizeHtml, {
  type Attributes as SanitizeAttributes,
  type IOptions as SanitizeHtmlOptions,
} from "sanitize-html";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

const ALLOWED_EDITOR_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "s",
  "u",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "a",
  "img",
] as const;

const SANITIZE_OPTIONS: SanitizeHtmlOptions = {
  allowedTags: [...ALLOWED_EDITOR_TAGS],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName: string, attribs: SanitizeAttributes) => ({
      tagName,
      attribs: {
        ...attribs,
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      },
    }),
  },
};

const markdownParser = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
});

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  bulletListMarker: "-",
});

turndown.use(gfm);

turndown.addRule("underline", {
  filter: ["u"],
  replacement(content: string) {
    return content ? `<u>${content}</u>` : "";
  },
});

function normalizeMarkdown(markdown: string): string {
  const unifiedNewline = markdown.replace(/\r\n?/g, "\n");
  const collapsedBlankLines = unifiedNewline.replace(/\n{3,}/g, "\n\n");
  const cleanedTrailingSpace = collapsedBlankLines.replace(/[ \t]+\n/g, "\n");
  return cleanedTrailingSpace.trim();
}

export function sanitizeEditorHtml(inputHtml: string): string {
  if (!inputHtml.trim()) {
    return "";
  }
  return sanitizeHtml(inputHtml, SANITIZE_OPTIONS);
}

export function markdownToEditorHtml(markdown: string): string {
  if (!markdown.trim()) {
    return "<p></p>";
  }
  const unsafeHtml = markdownParser.render(markdown);
  const safeHtml = sanitizeEditorHtml(unsafeHtml);
  return safeHtml.trim() ? safeHtml : "<p></p>";
}

export function editorHtmlToMarkdown(inputHtml: string): string {
  if (!inputHtml.trim()) {
    return "";
  }
  const safeHtml = sanitizeEditorHtml(inputHtml);
  const markdown = turndown.turndown(safeHtml);
  return normalizeMarkdown(markdown);
}
