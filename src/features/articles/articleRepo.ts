import { getDb } from "../../lib/db";
import type { Article, ArticleAudio } from "../../types";

interface ArticleRow {
  id: string;
  feed_id: string;
  feed_title: string;
  title: string;
  link: string | null;
  author: string | null;
  summary: string;
  content: string;
  published_at: number;
  fetched_at: number;
  is_read: number;
  is_starred: number;
  fingerprint: string;
  entities: string;
  content_html: string;
  full_content: string;
  full_content_fetched_at: number;
  full_content_html: string;
  audio_url: string;
  audio_duration_secs: number;
  audio_mime: string;
  audio_size: number;
}

function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    feedId: row.feed_id,
    feedTitle: row.feed_title,
    title: row.title,
    link: row.link,
    author: row.author,
    summary: row.summary,
    content: row.content,
    publishedAt: row.published_at,
    fetchedAt: row.fetched_at,
    isRead: row.is_read,
    isStarred: row.is_starred,
    fingerprint: row.fingerprint,
    entities: row.entities,
    contentHtml: row.content_html ?? "",
    fullContent: row.full_content ?? "",
    fullContentFetchedAt: row.full_content_fetched_at ?? 0,
    fullContentHtml: row.full_content_html ?? "",
    audioUrl: row.audio_url ?? "",
    audioDurationSecs: row.audio_duration_secs ?? 0,
    audioMime: row.audio_mime ?? "",
    audioSize: row.audio_size ?? 0,
  };
}

const SELECT_WITH_FEED = `
  SELECT a.*, f.title AS feed_title
  FROM articles a JOIN feeds f ON a.feed_id = f.id
`;

export async function listArticles(limit = 500): Promise<Article[]> {
  const db = await getDb();
  const rows = await db.select<ArticleRow[]>(
    `${SELECT_WITH_FEED} ORDER BY a.published_at DESC LIMIT ?`,
    [limit],
  );
  return rows.map(toArticle);
}

export async function getArticle(id: string): Promise<Article | null> {
  const db = await getDb();
  const rows = await db.select<ArticleRow[]>(
    `${SELECT_WITH_FEED} WHERE a.id = ? LIMIT 1`,
    [id],
  );
  return rows[0] ? toArticle(rows[0]) : null;
}

export async function listArticlesByFeed(feedId: string, limit = 300): Promise<Article[]> {
  const db = await getDb();
  const rows = await db.select<ArticleRow[]>(
    `${SELECT_WITH_FEED} WHERE a.feed_id = ? ORDER BY a.published_at DESC LIMIT ?`,
    [feedId, limit],
  );
  return rows.map(toArticle);
}

export async function findArticleByFingerprint(
  fingerprint: string,
): Promise<Article | null> {
  const db = await getDb();
  const rows = await db.select<ArticleRow[]>(
    `${SELECT_WITH_FEED} WHERE a.fingerprint = ? LIMIT 1`,
    [fingerprint],
  );
  return rows[0] ? toArticle(rows[0]) : null;
}

export async function insertArticle(article: Article): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR IGNORE INTO articles
      (id, feed_id, title, link, author, summary, content, published_at, fetched_at, is_read, is_starred, fingerprint, entities, content_html, full_content, full_content_fetched_at, full_content_html, audio_url, audio_duration_secs, audio_mime, audio_size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      article.id,
      article.feedId,
      article.title,
      article.link,
      article.author,
      article.summary,
      article.content,
      article.publishedAt,
      article.fetchedAt,
      article.isRead,
      article.isStarred,
      article.fingerprint,
      article.entities,
      article.contentHtml ?? "",
      article.fullContent ?? "",
      article.fullContentFetchedAt ?? 0,
      article.fullContentHtml ?? "",
      article.audioUrl ?? "",
      article.audioDurationSecs ?? 0,
      article.audioMime ?? "",
      article.audioSize ?? 0,
    ],
  );
}

/** Backfill feed-provided HTML on an existing article (e.g. after a migration). */
export async function setArticleContentHtml(id: string, contentHtml: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE articles SET content_html = ? WHERE id = ?", [contentHtml, id]);
}

/** Backfill podcast enclosure data on articles saved before audio support. */
export async function setArticleAudio(id: string, audio: ArticleAudio): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE articles
        SET audio_url = ?, audio_duration_secs = ?, audio_mime = ?, audio_size = ?
      WHERE id = ?`,
    [audio.audioUrl, audio.audioDurationSecs, audio.audioMime, audio.audioSize, id],
  );
}

export async function setArticleRead(id: string, isRead: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE articles SET is_read = ? WHERE id = ?", [isRead ? 1 : 0, id]);
}

export async function setArticleStarred(id: string, isStarred: boolean): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE articles SET is_starred = ? WHERE id = ?", [isStarred ? 1 : 0, id]);
}

export async function setArticleFullContent(
  id: string,
  fullContent: string,
  fullContentHtml: string,
  fetchedAt: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE articles SET full_content = ?, full_content_html = ?, full_content_fetched_at = ? WHERE id = ?",
    [fullContent, fullContentHtml, fetchedAt, id],
  );
}
