import { invoke } from "@tauri-apps/api/core";
import { deleteBrowserValue, readBrowserValue, writeBrowserValue } from "./browserStorage";

export interface AppDatabase {
  select<T>(query: string, params?: unknown[]): Promise<T>;
  execute(query: string, params?: unknown[]): Promise<unknown>;
  close(): Promise<void>;
}

let dbPromise: Promise<AppDatabase> | null = null;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function feedCredentialKey(feedId: string): string {
  return `credential:feed:${feedId}`;
}

const translationCredentialKey = "credential:translation-api-key";

export function saveFeedToken(feedId: string, token: string): Promise<void> {
  if (isTauri()) return invoke("save_feed_token", { feedId, token });
  return token.trim()
    ? writeBrowserValue(feedCredentialKey(feedId), token.trim())
    : deleteBrowserValue(feedCredentialKey(feedId));
}

export function getFeedToken(feedId: string): Promise<string | null> {
  if (isTauri()) return invoke("get_feed_token", { feedId });
  return readBrowserValue<string>(feedCredentialKey(feedId)).then((token) => token ?? null);
}

export function deleteFeedToken(feedId: string): Promise<void> {
  if (isTauri()) return invoke("delete_feed_token", { feedId });
  return deleteBrowserValue(feedCredentialKey(feedId));
}

export function saveTranslationApiKey(key: string): Promise<void> {
  if (isTauri()) return invoke("save_translation_api_key", { key });
  return key.trim()
    ? writeBrowserValue(translationCredentialKey, key.trim())
    : deleteBrowserValue(translationCredentialKey);
}

export function getTranslationApiKey(): Promise<string | null> {
  if (isTauri()) return invoke("get_translation_api_key");
  return readBrowserValue<string>(translationCredentialKey).then((key) => key ?? null);
}

export function deleteTranslationApiKey(): Promise<void> {
  if (isTauri()) return invoke("delete_translation_api_key");
  return deleteBrowserValue(translationCredentialKey);
}

async function migrateLegacyTokens(db: AppDatabase): Promise<void> {
  const rows = await db.select<{ id: string; api_token: string | null }[]>(
    "SELECT id, api_token FROM feeds WHERE api_token IS NOT NULL AND api_token <> ''",
  );
  for (const row of rows) {
    if (!row.api_token) continue;
    await saveFeedToken(row.id, row.api_token);
    await db.execute("UPDATE feeds SET api_token = NULL WHERE id = ?", [row.id]);
  }
  await db.execute("UPDATE feeds SET api_token = NULL WHERE api_token = ''");
}

async function initializeSchema(db: AppDatabase): Promise<void> {
  const feedTable = await db.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feeds'",
  );
  let missingFeedColumns: string[] = [];
  if (feedTable.length > 0) {
    const columns = await db.select<{ name: string }[]>("PRAGMA table_info(feeds)");
    const existing = new Set(columns.map((column) => column.name));
    missingFeedColumns = ["last_error TEXT"].filter((column) => !existing.has(column.split(" ")[0]));
  }

  const articleTable = await db.select<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'articles'",
  );
  let missingColumns: string[] = [];
  if (articleTable.length > 0) {
    const columns = await db.select<{ name: string }[]>("PRAGMA table_info(articles)");
    const existing = new Set(columns.map((column) => column.name));
    missingColumns = [
      "fingerprint TEXT NOT NULL DEFAULT ''",
      "entities TEXT NOT NULL DEFAULT '[]'",
      "content_html TEXT NOT NULL DEFAULT ''",
      "full_content TEXT NOT NULL DEFAULT ''",
      "full_content_fetched_at INTEGER NOT NULL DEFAULT 0",
      "full_content_html TEXT NOT NULL DEFAULT ''",
      "audio_url TEXT NOT NULL DEFAULT ''",
      "audio_duration_secs INTEGER NOT NULL DEFAULT 0",
      "audio_mime TEXT NOT NULL DEFAULT ''",
      "audio_size INTEGER NOT NULL DEFAULT 0",
    ].filter((column) => !existing.has(column.split(" ")[0]));
  }

  const statements = [
    `CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'rss',
      folder TEXT,
      api_base TEXT,
      api_token TEXT,
      last_fetched_at INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      feed_id TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      link TEXT,
      author TEXT,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      published_at INTEGER NOT NULL,
      fetched_at INTEGER NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      is_starred INTEGER NOT NULL DEFAULT 0,
      fingerprint TEXT NOT NULL DEFAULT '',
      entities TEXT NOT NULL DEFAULT '[]',
      content_html TEXT NOT NULL DEFAULT '',
      full_content TEXT NOT NULL DEFAULT '',
      full_content_fetched_at INTEGER NOT NULL DEFAULT 0,
      full_content_html TEXT NOT NULL DEFAULT '',
      audio_url TEXT NOT NULL DEFAULT '',
      audio_duration_secs INTEGER NOT NULL DEFAULT 0,
      audio_mime TEXT NOT NULL DEFAULT '',
      audio_size INTEGER NOT NULL DEFAULT 0
    )`,
    "CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC)",
    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      quote TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    "CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_notes_article ON notes(article_id)",
    `CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      representative_title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_manual INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS topic_articles (
      topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      added_at INTEGER NOT NULL,
      PRIMARY KEY (topic_id, article_id)
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    "UPDATE articles SET entities = '[]' WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'entityExtractorVersion' AND value = '2')",
    "INSERT INTO settings (key, value) VALUES ('entityExtractorVersion', '2') ON CONFLICT(key) DO UPDATE SET value = '2'",
    "DELETE FROM topic_articles WHERE topic_id IN (SELECT id FROM topics WHERE is_manual = 0)",
    "DELETE FROM topics WHERE is_manual = 0",
    ...missingFeedColumns.map((column) => `ALTER TABLE feeds ADD COLUMN ${column}`),
    ...missingColumns.map((column) => `ALTER TABLE articles ADD COLUMN ${column}`),
    "DELETE FROM articles WHERE fingerprint = ''",
    `DELETE FROM articles
       WHERE id NOT IN (
           SELECT MIN(id) FROM articles GROUP BY fingerprint
         )`,
    "DELETE FROM topic_articles WHERE article_id NOT IN (SELECT id FROM articles)",
    "DELETE FROM notes WHERE article_id NOT IN (SELECT id FROM articles)",
    "DROP INDEX IF EXISTS idx_articles_fingerprint",
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_fingerprint
       ON articles(fingerprint) WHERE fingerprint <> ''`,
  ];

  // One execute keeps BEGIN/COMMIT on the same SQLite pool connection.
  try {
    await db.execute(`BEGIN IMMEDIATE;\n${statements.join(";\n")};\nCOMMIT;`);
  } catch (error) {
    await db.close().catch(() => undefined);
    throw error;
  }
}

/** Lazily open the single app database, creating schema on first run. */
export function getDb(): Promise<AppDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      let db: AppDatabase;
      if (isTauri()) {
        const { default: Database } = await import("@tauri-apps/plugin-sql");
        db = await Database.load("sqlite:foxnest.db") as unknown as AppDatabase;
      } else {
        const { openBrowserDatabase } = await import("./browserDb");
        db = await openBrowserDatabase();
      }
      await initializeSchema(db);
      await migrateLegacyTokens(db);
      return db;
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export interface FetchResult {
  body: string;
  status: number;
}

async function browserFetch(
  url: string,
  init: RequestInit,
  timeoutSecs = 30,
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutSecs * 1000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { body: await response.text(), status: response.status };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`请求超时（${timeoutSecs} 秒）`);
    }
    throw new Error("浏览器请求失败，目标可能不允许跨域访问（CORS）");
  } finally {
    window.clearTimeout(timer);
  }
}

/** Fetch via Rust to bypass WebView CORS. */
export function fetchUrl(
  url: string,
  headers?: Record<string, string>,
  timeoutSecs?: number,
): Promise<FetchResult> {
  if (isTauri()) {
    return invoke("fetch_url", {
      url,
      headers: headers ?? null,
      timeoutSecs: timeoutSecs ?? null,
    });
  }
  return browserFetch(url, { headers }, timeoutSecs);
}

export function postJson(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
  timeoutSecs?: number,
): Promise<FetchResult> {
  if (isTauri()) {
    return invoke("post_json", {
      url,
      body: JSON.stringify(body),
      headers: headers ?? null,
      timeoutSecs: timeoutSecs ?? null,
    });
  }
  return browserFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    },
    timeoutSecs,
  );
}

/** Open an in-app browser so the user can pass an anti-bot challenge. */
export function openVerificationWindow(siteUrl: string, feedUrl: string): Promise<void> {
  if (isTauri()) return invoke("open_verification_window", { siteUrl, feedUrl });
  window.open(siteUrl, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}

/** Whether a fresh, verified copy of this feed is cached on the Rust side. */
export function isFeedVerified(url: string): Promise<boolean> {
  if (isTauri()) return invoke("is_feed_verified", { url });
  return Promise.resolve(false);
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Drop the verified cache entry for a feed, forcing a fresh network fetch. */
export function clearVerifiedFeed(url: string): Promise<void> {
  if (isTauri()) return invoke("clear_verified_feed", { url });
  return Promise.resolve();
}

/** Close the verification window after its feed has been captured. */
export function closeVerificationWindow(): Promise<void> {
  if (isTauri()) return invoke("close_verification_window");
  return Promise.resolve();
}
