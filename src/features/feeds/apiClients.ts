import { fetchUrl, getFeedToken } from "../../lib/db";
import { stripHtml, truncate } from "../../lib/utils";
import { findArticleByFingerprint, insertArticle } from "../articles/articleRepo";
import type { Article, Feed } from "../../types";
import type { RefreshResult } from "./rssService";

interface SavedArticle {
  id: string;
  title: string;
  link: string | null;
  author: string | null;
  summary: string;
  content: string;
  publishedAt: number;
  fingerprint: string;
}

async function requireApiToken(feed: Feed): Promise<string> {
  const token = await getFeedToken(feed.id);
  if (!token) throw new Error("未配置 API Token，请删除并重新添加订阅源");
  return token;
}

async function persist(articles: SavedArticle[], feed: Feed): Promise<{ added: number; duplicates: number }> {
  let added = 0;
  let duplicates = 0;
  for (const item of articles) {
    const existing = await findArticleByFingerprint(item.fingerprint);
    if (existing) {
      duplicates += 1;
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
      fingerprint: item.fingerprint,
      entities: "[]",
      contentHtml: "",
      fullContent: "",
      fullContentFetchedAt: 0,
      fullContentHtml: "",
      audioUrl: "",
      audioDurationSecs: 0,
      audioMime: "",
      audioSize: 0,
    };
    await insertArticle(article);
    added += 1;
  }
  return { added, duplicates };
}

/** Miniflux REST API: GET /v1/entries with X-Auth-Token header. */
export async function refreshMiniflux(feed: Feed): Promise<RefreshResult> {
  try {
    const token = await requireApiToken(feed);
    const base = (feed.apiBase ?? "").replace(/\/+$/, "");
    if (!base) throw new Error("未配置服务地址，请删除并重新添加订阅源");
    // feed.url is a local identifier only. Sending the token to it would leak
    // credentials to an arbitrary user-supplied host.
    const target = `${base}/v1/entries?limit=200&order=desc&direction=desc`;
    const result = await fetchUrl(target, { "X-Auth-Token": token }, 25);
    if (result.status >= 400) {
      return { added: 0, duplicates: 0, total: 0, error: `HTTP ${result.status}` };
    }
    const payload = JSON.parse(result.body) as {
      total?: number;
      entries?: Array<{
        id: number;
        title: string;
        url: string;
        author?: string;
        content?: string;
        published_at?: string;
      }>;
    };
    const entries = payload.entries ?? [];
    const saved: SavedArticle[] = entries.map((entry) => {
      const fingerprint = entry.url || `miniflux-${entry.id}`;
      return {
        id: `miniflux-${entry.id}`,
        title: entry.title || "无标题",
        link: entry.url || null,
        author: entry.author ?? null,
        summary: truncate(stripHtml(entry.content ?? ""), 400),
        content: stripHtml(entry.content ?? "").slice(0, 6000),
        publishedAt: entry.published_at ? new Date(entry.published_at).getTime() : Date.now(),
        fingerprint,
      };
    });
    const { added, duplicates } = await persist(saved, feed);
    return { added, duplicates, total: saved.length };
  } catch (error) {
    return {
      added: 0,
      duplicates: 0,
      total: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** FreshRSS Google Reader compatible API: subscription/list + stream/contents. */
export async function refreshFreshRss(feed: Feed): Promise<RefreshResult> {
  try {
    const token = await requireApiToken(feed);
    const base = (feed.apiBase ?? "").replace(/\/+$/, "");
    if (!base) throw new Error("未配置服务地址，请删除并重新添加订阅源");
    const headers = { Authorization: `GoogleLogin auth=${token}` };
    const streamUrl = `${base}/reader/api/0/stream/contents/${encodeURIComponent(feed.url)}?n=200&xt=`;
    const result = await fetchUrl(streamUrl, headers, 25);
    if (result.status >= 400) {
      return { added: 0, duplicates: 0, total: 0, error: `HTTP ${result.status}` };
    }
    const payload = JSON.parse(result.body) as {
      items?: Array<{
        id: string;
        title: string;
        canonical?: Array<{ href: string }>;
        origin?: { title?: string };
        author?: string;
        summary?: { content?: string };
        content?: { content?: string };
        published?: number;
      }>;
    };
    const items = payload.items ?? [];
    const saved: SavedArticle[] = items.map((item) => {
      const link = item.canonical?.[0]?.href ?? item.id;
      return {
        id: `freshrss-${item.id}`,
        title: item.title || "无标题",
        link,
        author: item.author ?? null,
        summary: truncate(stripHtml(item.summary?.content ?? ""), 400),
        content: stripHtml(item.content?.content ?? "").slice(0, 6000),
        publishedAt: item.published ? item.published * 1000 : Date.now(),
        fingerprint: link,
      };
    });
    const { added, duplicates } = await persist(saved, feed);
    return { added, duplicates, total: saved.length };
  } catch (error) {
    return {
      added: 0,
      duplicates: 0,
      total: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function refreshFeed(feed: Feed): Promise<RefreshResult> {
  if (feed.kind === "miniflux") return refreshMiniflux(feed);
  if (feed.kind === "freshrss") return refreshFreshRss(feed);
  const { refreshRssFeed } = await import("./rssService");
  return refreshRssFeed(feed);
}
