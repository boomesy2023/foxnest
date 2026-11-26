import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

let dbPromise: Promise<Database> | null = null;

export function saveFeedToken(feedId: string, token: string): Promise<void> {
  return invoke("save_feed_token", { feedId, token });
}

export function getFeedToken(feedId: string): Promise<string | null> {
  return invoke("get_feed_token", { feedId });
}

export function deleteFeedToken(feedId: string): Promise<void> {
  return invoke("delete_feed_token", { feedId });
}

export function saveTranslationApiKey(key: string): Promise<void> {
  return invoke("save_translation_api_key", { key });
}

export function getTranslationApiKey(): Promise<string | null> {
  return invoke("get_translation_api_key");
}

export function deleteTranslationApiKey(): Promise<void> {
  return invoke("delete_translation_api_key");
}

async function migrateLegacyTokens(db: Database): Promise<void> {
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

async function initializeSchema(db: Database): Promise<void> {
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
export function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load("sqlite:foxnest.db");
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

/** Fetch via Rust to bypass WebView CORS. */
export function fetchUrl(
  url: string,
  headers?: Record<string, string>,
  timeoutSecs?: number,
): Promise<FetchResult> {
  // Tauri 2 maps JS camelCase keys to Rust snake_case command params.
  return invoke("fetch_url", {
    url,
    headers: headers ?? null,
    timeoutSecs: timeoutSecs ?? null,
  });
}

export function postJson(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
  timeoutSecs?: number,
): Promise<FetchResult> {
  return invoke("post_json", {
    url,
    body: JSON.stringify(body),
    headers: headers ?? null,
    timeoutSecs: timeoutSecs ?? null,
  });
}

/** Open an in-app browser so the user can pass an anti-bot challenge. */
export function openVerificationWindow(siteUrl: string, feedUrl: string): Promise<void> {
  return invoke("open_verification_window", { siteUrl, feedUrl });
}

/** Whether a fresh, verified copy of this feed is cached on the Rust side. */
export function isFeedVerified(url: string): Promise<boolean> {
  return invoke("is_feed_verified", { url });
}

/** Drop the verified cache entry for a feed, forcing a fresh network fetch. */
export function clearVerifiedFeed(url: string): Promise<void> {
  return invoke("clear_verified_feed", { url });
}

/** Close the verification window after its feed has been captured. */
export function closeVerificationWindow(): Promise<void> {
  return invoke("close_verification_window");
}
