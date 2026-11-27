import { fetchUrl, isTauri } from "../../lib/db";
import { stripHtml, truncate } from "../../lib/utils";
import { sanitizeHtml } from "../articles/fullTextService";
import { findArticleByFingerprint, insertArticle, setArticleAudio, setArticleContentHtml } from "../articles/articleRepo";
import type { Article, ArticleAudio, Feed } from "../../types";
import { updateFeed } from "./feedRepo";

/** Canonicalize a link for dedup: drop tracking params and trailing slash. */
export function canonicalize(link: string | null | undefined): string {
  if (!link) return "";
  try {
    const url = new URL(link);
    const drop = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    drop.forEach((key) => url.searchParams.delete(key));
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return link.trim().replace(/\/$/, "");
  }
}

export interface ParsedFeed {
  title: string;
  items: Array<{
    guid: string;
    title: string;
    link: string | null;
    author: string | null;
    summary: string;
    content: string;
    /** Sanitized feed-provided HTML when the description is a structured digest. */
    contentHtml: string;
    publishedAt: number;
    /** Podcast enclosure metadata; all empty/zero for ordinary articles. */
    audio: ArticleAudio;
  }>;
}

const EMPTY_AUDIO: ArticleAudio = {
  audioUrl: "",
  audioDurationSecs: 0,
  audioMime: "",
  audioSize: 0,
};

/** Only real audio enclosures count — RSS image enclosures must not become "episodes". */
function isAudioEnclosure(type: string | null, url: string | null): boolean {
  if (type?.toLowerCase().startsWith("audio/")) return true;
  return Boolean(url && /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\?|#|$)/i.test(url));
}

/** Parse itunes:duration in SS, MM:SS or HH:MM:SS form. */
function parseItunesDuration(raw: string): number {
  const parts = raw.trim().split(":").map((part) => Number(part.replace(/,/g, "").trim()));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}

/**
 * Read a podcast enclosure from RSS 2.0 (<enclosure>) or Atom
 * (<link rel="enclosure">), plus the itunes:duration hint.
 */
function extractAudio(el: Element): ArticleAudio {
  const rssEnclosures = Array.from(el.getElementsByTagName("enclosure"));
  const atomEnclosures = Array.from(el.getElementsByTagName("link")).filter(
    (node) => node.getAttribute("rel") === "enclosure",
  );
  const source = [...rssEnclosures, ...atomEnclosures].find((node) =>
    isAudioEnclosure(node.getAttribute("type"), node.getAttribute("url") ?? node.getAttribute("href")),
  );
  if (!source) return EMPTY_AUDIO;

  const url = source.getAttribute("url") ?? source.getAttribute("href") ?? "";
  // Feed-supplied URLs are later fed to an <audio> element; never store a
  // non-http scheme that could reach the WebView.
  if (!/^https?:\/\//i.test(url)) return EMPTY_AUDIO;
  const size = Number(source.getAttribute("length") ?? 0);
  const durationText = childText(el, "itunes:duration", "duration");
  return {
    audioUrl: url,
    audioDurationSecs: parseItunesDuration(durationText),
    audioMime: source.getAttribute("type") ?? "",
    audioSize: Number.isFinite(size) && size > 0 ? Math.trunc(size) : 0,
  };
}

/** Read child text by tag name, tolerating namespaced tags (content:encoded). */
function childText(el: Element, ...names: string[]): string {
  for (const name of names) {
    const direct = el.getElementsByTagName(name)[0];
    if (direct?.textContent) return direct.textContent.trim();
    // Fall back to any child whose local name matches (e.g. dc:creator).
    for (const child of Array.from(el.children)) {
      if (child.localName === name && child.textContent) return child.textContent.trim();
    }
  }
  return "";
}

function decodeEntities(text: string): string {
  const doc = new DOMParser().parseFromString(`<x>${text}</x>`, "text/xml");
  return doc.documentElement.textContent ?? text;
}

/** Some sites return an HTML challenge page with HTTP 200 instead of RSS. */
function looksLikeHtml(xml: string): boolean {
  const head = xml.slice(0, 512).toLowerCase();
  return head.startsWith("<!doctype html") || head.includes("<html");
}

const FEED_ACCEPT = "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8";

/**
 * Some feeds (e.g. Readhub daily) put a whole digest in one description:
 * <ol><li><p><a>headline</a></p><p>summary</p></li>...</ol>. Return sanitized
 * HTML only when the markup really looks like a structured digest, so normal
 * articles keep their plain-text rendering.
 */
function digestHtml(rawContent: string, link: string | null): string {
  if (!/<(ol|ul|li)\b/i.test(rawContent)) return "";
  const listItems = (rawContent.match(/<li\b/gi) ?? []).length;
  const links = (rawContent.match(/<a\b/gi) ?? []).length;
  if (listItems < 2 || links < 2) return "";
  try {
    return sanitizeHtml(rawContent, link ?? "").slice(0, 200000);
  } catch {
    return "";
  }
}

/** Build the www / naked-domain twin of a URL, if one exists. */
function alternateHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    // Skip localhost, IP addresses and other hosts without a dotted domain.
    if (!host.includes(".")) return null;
    parsed.hostname = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchFeedViaProxy(url: string, timeoutSecs: number): Promise<{ status: number; body: string }> {
  const endpoint = new URL("/functions/v1/app/api/feed", window.location.origin);
  endpoint.searchParams.set("url", url);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutSecs * 1000);
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: FEED_ACCEPT },
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.text();
    if (response.status >= 500) {
      let message = "订阅源代理暂时不可用，请稍后重试";
      try {
        const payload = JSON.parse(body) as { error?: unknown };
        if (typeof payload.error === "string") message = payload.error;
      } catch {
        // The gateway may return HTML for an unavailable function.
      }
      throw new Error(message);
    }
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`订阅源代理请求超时（${timeoutSecs} 秒）`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchFeedTarget(url: string, timeoutSecs: number): Promise<{ status: number; body: string }> {
  try {
    return await fetchUrl(url, { Accept: FEED_ACCEPT }, timeoutSecs);
  } catch (error) {
    if (isTauri()) throw error;
    return fetchFeedViaProxy(url, timeoutSecs);
  }
}

/**
 * Fetch a feed, retrying the www/naked-domain twin when the original address
 * answers with an HTML page (typically a WAF challenge such as 36kr.com/feed,
 * while www.36kr.com/feed serves the real RSS).
 */
async function fetchFeedResponse(
  url: string,
  timeoutSecs: number,
): Promise<{ status: number; body: string }> {
  const primary = await fetchFeedTarget(url, timeoutSecs);
  if (primary.status >= 400 || !looksLikeHtml(primary.body)) return primary;

  const alternate = alternateHost(url);
  if (alternate && alternate !== url) {
    try {
      const retry = await fetchFeedTarget(alternate, timeoutSecs);
      if (retry.status < 400 && !looksLikeHtml(retry.body)) return retry;
    } catch {
      // Keep the original response so the caller reports its specific error.
    }
  }
  return primary;
}

/**
 * Parse RSS 2.0 / Atom using the WebView's native DOMParser.
 * rss-parser depends on xml2js (Node EventEmitter), which crashes inside
 * Tauri's WKWebView with "removeAllListeners is not a function".
 */
export async function parseRssXml(xml: string): Promise<ParsedFeed> {
  const clean = xml.replace(/^\uFEFF/, "").trim();
  if (looksLikeHtml(clean)) {
    const bodyOnly = clean.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
    const hint = stripHtml(bodyOnly).replace(/\s+/g, " ").trim().slice(0, 80);
    throw new Error(`站点返回的是网页而非 RSS（可能被安全检测拦截）：${hint || "HTML 页面"}`);
  }

  const doc = new DOMParser().parseFromString(clean, "text/xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) throw new Error(`XML 解析失败：${parseError.textContent?.slice(0, 120)}`);

  const rssItems = Array.from(doc.getElementsByTagName("item"));
  const atomEntries = Array.from(doc.getElementsByTagName("entry"));
  const isAtom = atomEntries.length > 0 && rssItems.length === 0;

  const channel = doc.getElementsByTagName("channel")[0] ?? doc.getElementsByTagName("feed")[0];
  const title = channel ? childText(channel, "title") || "未命名订阅" : "未命名订阅";

  const items = isAtom
    ? atomEntries.map((entry, index) => {
        const linkEl = Array.from(entry.getElementsByTagName("link")).find(
          (l) => l.getAttribute("rel") === "alternate" || !l.getAttribute("rel"),
        );
        const link = linkEl?.getAttribute("href") ?? childText(entry, "link") ?? null;
        const rawDate =
          childText(entry, "published", "updated", "dc:date") || new Date().toISOString();
        const rawContent = childText(entry, "content", "summary");
        return {
          guid: childText(entry, "id") || link || `idx-${index}`,
          title: decodeEntities(childText(entry, "title") || "无标题"),
          link,
          author: childText(entry, "author", "dc:creator") || null,
          summary: truncate(stripHtml(childText(entry, "summary")), 400),
          content: stripHtml(rawContent).slice(0, 6000),
          contentHtml: digestHtml(rawContent, link),
          publishedAt: Number.isFinite(new Date(rawDate).getTime())
            ? new Date(rawDate).getTime()
            : Date.now(),
          audio: extractAudio(entry),
        };
      })
    : rssItems.map((item, index) => {
        const link = childText(item, "link") || null;
        const rawDate = childText(item, "pubDate", "dc:date", "lastBuildDate");
        const rawContent = childText(item, "content:encoded", "content", "description");
        const guid = childText(item, "guid", "id") || link || `idx-${index}`;
        return {
          guid,
          title: decodeEntities(childText(item, "title") || "无标题"),
          link,
          author: childText(item, "dc:creator", "author") || null,
          summary: truncate(stripHtml(childText(item, "description")), 400),
          content: stripHtml(rawContent).slice(0, 6000),
          contentHtml: digestHtml(rawContent, link),
          publishedAt: rawDate && Number.isFinite(new Date(rawDate).getTime())
            ? new Date(rawDate).getTime()
            : Date.now(),
          audio: extractAudio(item),
        };
      });

  return { title, items };
}

export interface RefreshResult {
  added: number;
  duplicates: number;
  total: number;
  error?: string;
}

/** Give a specific, actionable message for anti-bot responses instead of a bare HTTP code. */
function describeHttpError(status: number, body: string): string {
  const head = body.slice(0, 2000).toLowerCase();
  if (
    head.includes("just a moment") ||
    head.includes("cf-mitigated") ||
    head.includes("challenges.cloudflare.com") ||
    head.includes("cf-browser-verification")
  ) {
    return "站点启用了 Cloudflare 人机验证：请点击该订阅源右侧的盾牌按钮，在弹出窗口完成验证后会自动抓取。";
  }
  if (status === 403) {
    return "HTTP 403：站点拒绝抓取（可能有人机验证或访问限制）";
  }
  return `HTTP ${status}`;
}

/** Fetch, parse, dedup by canonical link, and persist new articles for one feed. */
export async function refreshRssFeed(feed: Feed): Promise<RefreshResult> {
  try {
    const result = await fetchFeedResponse(feed.url, 25);
    if (result.status >= 400) {
      return { added: 0, duplicates: 0, total: 0, error: describeHttpError(result.status, result.body) };
    }
    const parsed = await parseRssXml(result.body);
    let added = 0;
    let duplicates = 0;

    for (const item of parsed.items) {
      const fingerprint = canonicalize(item.link) || item.guid;
      const existing = await findArticleByFingerprint(fingerprint);
      if (existing) {
        duplicates += 1;
        // Backfill data introduced after these articles were first saved.
        if (item.contentHtml && !existing.contentHtml) {
          await setArticleContentHtml(existing.id, item.contentHtml);
        }
        if (item.audio.audioUrl && !existing.audioUrl) {
          await setArticleAudio(existing.id, item.audio);
        }
        continue;
      }
      const article: Article = {
        id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        feedId: feed.id,
        feedTitle: feed.title,
        title: item.title,
        link: item.link,
        author: item.author,
        summary: item.summary,
        content: item.content,
        publishedAt: item.publishedAt,
        fetchedAt: Date.now(),
        isRead: 0,
        isStarred: 0,
        fingerprint,
        entities: "[]",
        contentHtml: item.contentHtml,
        fullContent: "",
        fullContentFetchedAt: 0,
        fullContentHtml: "",
        ...item.audio,
      };
      await insertArticle(article);
      added += 1;
    }

    await updateFeed(feed.id, { title: parsed.title || feed.title, lastFetchedAt: Date.now() });
    return { added, duplicates, total: parsed.items.length };
  } catch (error) {
    return {
      added: 0,
      duplicates: 0,
      total: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Probe a feed URL and return its title, for the add-feed dialog. */
export async function probeFeedTitle(url: string): Promise<string> {
  const result = await fetchFeedResponse(url, 15);
  if (result.status >= 400) throw new Error(describeHttpError(result.status, result.body));
  const parsed = await parseRssXml(result.body);
  return parsed.title;
}
