import { getDb } from "../../lib/db";
import { safeJsonArray } from "../../lib/utils";
import type { Article, TopicWithArticles } from "../../types";
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

function toTopic(row: TopicRow): TopicWithArticles {
  return {
    id: row.id,
    label: row.label,
    representativeTitle: row.representative_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isManual: row.is_manual,
    articles: [],
  };
}

export async function listManualTopicsWithArticles(): Promise<TopicWithArticles[]> {
  const db = await getDb();
  const topicRows = await db.select<TopicRow[]>(
    "SELECT * FROM topics WHERE is_manual = 1 ORDER BY updated_at DESC",
  );
  const allArticles = await rawListArticles(2000);
  const articleMap = new Map(allArticles.map((article) => [article.id, article]));
  const links = await db.select<{ topic_id: string; article_id: string }[]>(
    `SELECT ta.topic_id, ta.article_id
       FROM topic_articles ta
       JOIN topics t ON t.id = ta.topic_id
      WHERE t.is_manual = 1`,
  );
  const byTopic = new Map<string, Article[]>();
  links.forEach((link) => {
    const article = articleMap.get(link.article_id);
    if (!article) return;
    byTopic.set(link.topic_id, [...(byTopic.get(link.topic_id) ?? []), article]);
  });

  return topicRows
    .map((row) => {
      const topic = toTopic(row);
      return {
        ...topic,
        articles: (byTopic.get(topic.id) ?? []).sort((a, b) => b.publishedAt - a.publishedAt),
      };
    })
    .filter((topic) => topic.articles.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveManualTopic(topic: TopicWithArticles): Promise<TopicWithArticles> {
  const db = await getDb();
  const record: TopicWithArticles = {
    ...topic,
    isManual: 1,
    updatedAt: Date.now(),
  };
  await db.execute(
    `INSERT INTO topics (id, label, representative_title, created_at, updated_at, is_manual)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       label = excluded.label,
       representative_title = excluded.representative_title,
       updated_at = excluded.updated_at,
       is_manual = 1`,
    [
      record.id,
      record.label,
      record.representativeTitle,
      record.createdAt,
      record.updatedAt,
    ],
  );
  await db.execute("DELETE FROM topic_articles WHERE topic_id = ?", [record.id]);
  for (const article of record.articles) {
    await db.execute(
      "INSERT OR IGNORE INTO topic_articles (topic_id, article_id, added_at) VALUES (?, ?, ?)",
      [record.id, article.id, Date.now()],
    );
  }
  return record;
}

export async function addArticleToTopic(topicId: string, articleId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT OR IGNORE INTO topic_articles (topic_id, article_id, added_at) VALUES (?, ?, ?)",
    [topicId, articleId, Date.now()],
  );
  await db.execute("UPDATE topics SET updated_at = ? WHERE id = ?", [Date.now(), topicId]);
}

export async function removeArticleFromTopic(topicId: string, articleId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM topic_articles WHERE topic_id = ? AND article_id = ?", [topicId, articleId]);
  await db.execute("UPDATE topics SET updated_at = ? WHERE id = ?", [Date.now(), topicId]);
  await db.execute(
    `DELETE FROM topics
      WHERE id = ? AND is_manual = 1
        AND NOT EXISTS (SELECT 1 FROM topic_articles WHERE topic_id = ?)`,
    [topicId, topicId],
  );
}

export async function deleteTopic(topicId: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM topic_articles WHERE topic_id = ?", [topicId]);
  await db.execute("DELETE FROM topics WHERE id = ?", [topicId]);
}

export async function getArticleEntities(article: Article): Promise<string[]> {
  return safeJsonArray(article.entities);
}

export async function setArticleEntities(articleId: string, entities: string[]): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE articles SET entities = ? WHERE id = ?", [JSON.stringify(entities), articleId]);
}
