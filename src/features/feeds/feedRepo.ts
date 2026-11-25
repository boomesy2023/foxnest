import { deleteFeedToken, getDb, saveFeedToken } from "../../lib/db";
import type { Feed, FeedKind } from "../../types";

interface FeedRow {
  id: string;
  title: string;
  url: string;
  kind: FeedKind;
  folder: string | null;
  api_base: string | null;
  last_fetched_at: number | null;
  created_at: number;
}

function toFeed(row: FeedRow): Feed {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    kind: row.kind,
    folder: row.folder,
    apiBase: row.api_base,
    lastFetchedAt: row.last_fetched_at,
    createdAt: row.created_at,
  };
}

export async function listFeeds(): Promise<Feed[]> {
  const db = await getDb();
  const rows = await db.select<FeedRow[]>("SELECT * FROM feeds ORDER BY folder, title");
  return rows.map(toFeed);
}

export async function getFeed(id: string): Promise<Feed | null> {
  const db = await getDb();
  const rows = await db.select<FeedRow[]>("SELECT * FROM feeds WHERE id = ?", [id]);
  return rows[0] ? toFeed(rows[0]) : null;
}

export async function insertFeed(feed: Feed, apiToken: string | null = null): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO feeds (id, title, url, kind, folder, api_base, api_token, last_fetched_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      feed.id,
      feed.title,
      feed.url,
      feed.kind,
      feed.folder,
      feed.apiBase,
      feed.lastFetchedAt,
      feed.createdAt,
    ],
  );
  try {
    if (apiToken) await saveFeedToken(feed.id, apiToken);
  } catch (error) {
    await db.execute("DELETE FROM feeds WHERE id = ?", [feed.id]);
    throw error;
  }
}

export async function updateFeed(
  id: string,
  patch: Partial<Pick<Feed, "title" | "folder" | "lastFetchedAt">>,
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.title !== undefined) {
    sets.push("title = ?");
    values.push(patch.title);
  }
  if (patch.folder !== undefined) {
    sets.push("folder = ?");
    values.push(patch.folder);
  }
  if (patch.lastFetchedAt !== undefined) {
    sets.push("last_fetched_at = ?");
    values.push(patch.lastFetchedAt);
  }
  if (sets.length === 0) return;
  values.push(id);
  await db.execute(`UPDATE feeds SET ${sets.join(", ")} WHERE id = ?`, values);
}

export async function deleteFeed(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM articles WHERE feed_id = ?", [id]);
  await db.execute("DELETE FROM feeds WHERE id = ?", [id]);
  await deleteFeedToken(id);
}
