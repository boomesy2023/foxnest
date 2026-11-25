import DOMPurify from "dompurify";
import { Readability } from "@mozilla/readability";
import { fetchUrl } from "../../lib/db";
import { setArticleFullContent } from "./articleRepo";
import type { Article } from "../../types";

export interface FullTextResult {
  /** Plain text, kept for summaries and future full-text search. */
  text: string;
  /** Sanitized HTML preserving images and links, ready for controlled rendering. */
  html: string;
  status: "ok" | "empty" | "error";
  message?: string;
}

const ALLOWED_TAGS = [
  "p", "br", "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "mark", "small", "sub", "sup",
  "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "pre", "code", "hr",
  "a", "img", "figure", "figcaption", "picture", "source",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "div", "span",
];

const ALLOWED_ATTR = [
  "href", "src", "srcset", "alt", "title", "width", "height",
  "class", "id", "colspan", "rowspan", "loading", "target", "rel",
];

/**
 * Fetch the original page and extract its readable content via Mozilla Readability.
 * HTML is sanitized with DOMPurify before it reaches the renderer: scripts,
 * event handlers, iframes and javascript: URLs are stripped.
 */
export async function fetchFullText(article: Article): Promise<FullTextResult> {
  if (!article.link) {
    return { text: "", html: "", status: "error", message: "该文章没有原文链接" };
  }

  try {
    const response = await fetchUrl(article.link, undefined, 30);
    if (response.status >= 400) {
      return { text: "", html: "", status: "error", message: `HTTP ${response.status}` };
    }
    if (!response.body || response.body.length < 200) {
      return { text: "", html: "", status: "error", message: "页面内容为空" };
    }

    const doc = new DOMParser().parseFromString(response.body, "text/html");
    const parsed = new Readability(doc).parse();
    if (!parsed || !parsed.textContent || parsed.textContent.trim().length < 80) {
      return { text: "", html: "", status: "empty", message: "未能提取到正文" };
    }

    const safeHtml = sanitizeHtml(parsed.content ?? "", article.link);
    const text = plainTextFromHtml(safeHtml) || parsed.textContent.trim();
    if (text.length < 40) {
      return { text: "", html: "", status: "empty", message: "正文内容过短" };
    }
    return { text: text.slice(0, 100000), html: safeHtml, status: "ok" };
  } catch (error) {
    return {
      text: "",
      html: "",
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Clean extracted HTML and normalize resource URLs against the article link. */
export function sanitizeHtml(rawHtml: string, baseUrl: string): string {
  const container = document.createElement("div");
  container.innerHTML = rawHtml;

  // Resolve relative URLs before sanitizing so DOMPurify can validate them.
  for (const el of Array.from(container.querySelectorAll("a[href], img[src], source[src]"))) {
    const attr = el.tagName === "A" ? "href" : "src";
    const value = el.getAttribute(attr);
    if (!value) continue;
    const absolute = toAbsoluteUrl(value, baseUrl);
    if (absolute) el.setAttribute(attr, absolute);
    if (attr === "src") el.setAttribute("loading", "lazy");
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  }

  const cleaned = DOMPurify.sanitize(container.innerHTML, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "svg", "math"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "style", "srcdoc"],
  });

  // Second pass: drop any unsafe URLs that survived in unexpected attributes.
  const finalHolder = document.createElement("div");
  finalHolder.innerHTML = cleaned;
  for (const el of Array.from(finalHolder.querySelectorAll("a, img, source"))) {
    for (const attr of ["href", "src", "srcset"]) {
      const value = el.getAttribute(attr);
      if (value && !isSafeUrl(value)) el.removeAttribute(attr);
    }
    // Re-apply after sanitization so these are guaranteed to survive.
    if (el.tagName === "A" && el.hasAttribute("href")) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
    if (el.tagName === "IMG") el.setAttribute("loading", "lazy");
  }
  return finalHolder.innerHTML.slice(0, 300000);
}

function toAbsoluteUrl(value: string, baseUrl: string): string | null {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function isSafeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("data:image/");
}

/** Derive plain text from the sanitized HTML for summary/search purposes. */
function plainTextFromHtml(html: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  const blocks = holder.querySelectorAll("p, h1, h2, h3, li, blockquote, pre, figcaption, td");
  const parts: string[] = [];
  if (blocks.length > 0) {
    for (const block of blocks) {
      const text = (block.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
    }
  } else {
    const text = (holder.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

/** Persist both text and HTML (empty on failure still records the attempt). */
export async function cacheFullText(
  articleId: string,
  result: FullTextResult,
): Promise<void> {
  await setArticleFullContent(articleId, result.text, result.html, Date.now());
}
