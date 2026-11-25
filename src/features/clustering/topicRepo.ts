import { getDb } from "../../lib/db";
import { safeJsonArray } from "../../lib/utils";
import type { Article, Topic, TopicWithArticles } from "../../types";
import { summarizeLabel } from "./tokenizer";
import {
  listArticles as rawListArticles,
} from "../articles/articleRepo";

interface TopicRow {
  id: string;
  label: string;
  representative_title: string;
  created_at: number;
  updated_at: number;
  is_manual: number;
}

function toTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    label: row.label,
    representativeTitle: row.representative_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isManual: row.is_manual,
  };
}

export async function listTopics(): Promise<Topic[]> {
  const db = await getDb();
  const rows = await db.select<TopicRow[]>("SELECT * FROM topics ORDER BY updated_at DESC");
  return rows.map(toTopic);
}

export async function listTopicsWithArticles(): Promise<TopicWithArticles[]> {
  const topics = await listTopics();
  const db = await getDb();
  const allArticles = await rawListArticles(2000);
  const articleMap = new Map(allArticles.map((article) => [article.id, article]));
  const links = await db.select<{ topic_id: string; article_id: string }[]>(
    "SELECT topic_id, article_id FROM topic_articles",
  );
  const byTopic = new Map<string, Article[]>();
  links.forEach((link) => {
    const article = articleMap.get(link.article_id);
    if (!article) return;
    byTopic.set(link.topic_id, [...(byTopic.get(link.topic_id) ?? []), article]);
  });

  return topics
    .map((topic) => ({
      ...topic,
      articles: (byTopic.get(topic.id) ?? []).sort((a, b) => b.publishedAt - a.publishedAt),
    }))
    .filter((topic) => topic.articles.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createTopic(
  topic: Omit<Topic, "createdAt" | "updatedAt"> & { createdAt?: number; updatedAt?: number },
): Promise<Topic> {
  const db = await getDb();
  const now = Date.now();
  const record: Topic = {
    ...topic,
    createdAt: topic.createdAt ?? now,
    updatedAt: topic.updatedAt ?? now,
  };
  await db.execute(
    `INSERT OR REPLACE INTO topics (id, label, representative_title, created_at, updated_at, is_manual)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [record.id, record.label, record.representativeTitle, record.createdAt, record.updatedAt, record.isManual],
  );
  return record;
}

export async function addArticleToTopic(topicId: string, articleId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT OR IGNORE INTO topic_articles (topic_id, article_id, added_at) VALUES (?, ?, ?)`,
    [topicId, articleId, Date.now()],
  );
  await db.execute("UPDATE topics SET updated_at = ? WHERE id = ?", [Date.now(), topicId]);
  await refreshTopicLabel(topicId);
}

export async function removeArticleFromTopic(topicId: string, articleId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM topic_articles WHERE topic_id = ? AND article_id = ?", [topicId, articleId]);
  await refreshTopicLabel(topicId);
}

/** Keep an automatic topic's label in sync with all of its members. */
export async function refreshTopicLabel(topicId: string): Promise<void> {
  const db = await getDb();
  const topicRows = await db.select<{ is_manual: number }[]>(
    "SELECT is_manual FROM topics WHERE id = ?",
    [topicId],
  );
  if (topicRows.length === 0 || topicRows[0].is_manual === 1) return;

  const rows = await db.select<{ title: string }[]>(
    `SELECT a.title FROM topic_articles ta
     JOIN articles a ON a.id = ta.article_id
     WHERE ta.topic_id = ?
     ORDER BY a.published_at DESC`,
    [topicId],
  );
  if (rows.length === 0) return;

  await db.execute(
    "UPDATE topics SET label = ?, representative_title = ?, updated_at = ? WHERE id = ?",
    [summarizeLabel(rows.map((row) => row.title)), rows[0].title, Date.now(), topicId],
  );
}

export async function deleteTopic(topicId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM topic_articles WHERE topic_id = ?", [topicId]);
  await db.execute("DELETE FROM topics WHERE id = ?", [topicId]);
}

export async function mergeTopics(sourceId: string, targetId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ article_id: string }[]>(
    "SELECT article_id FROM topic_articles WHERE topic_id = ?",
    [sourceId],
  );
  for (const row of rows) {
    await db.execute(
      `INSERT OR IGNORE INTO topic_articles (topic_id, article_id, added_at) VALUES (?, ?, ?)`,
      [targetId, row.article_id, Date.now()],
    );
  }
  await refreshTopicLabel(targetId);
  await deleteTopic(sourceId);
}

export async function getArticleEntities(article: Article): Promise<string[]> {
  return safeJsonArray(article.entities);
}

export async function setArticleEntities(articleId: string, entities: string[]): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE articles SET entities = ? WHERE id = ?", [JSON.stringify(entities), articleId]);
}
