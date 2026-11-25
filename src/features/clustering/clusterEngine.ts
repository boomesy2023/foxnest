import type { Article, Settings, TopicWithArticles } from "../../types";
import { makeId, safeJsonArray } from "../../lib/utils";
import { simplifyText } from "../../lib/zhConvert";
import { extractEntities, extractStrongAnchors, sharedAnchorCount, summarizeLabel } from "./tokenizer";
import { headlineSimilarity } from "./similarity";
import {
  addArticleToTopic,
  createTopic,
  getArticleEntities,
  listTopicsWithArticles,
  setArticleEntities,
} from "./topicRepo";

export interface ClusterDecision {
  action: "merged" | "created" | "skipped" | "exact-duplicate";
  topicId: string | null;
  score?: number;
}

/**
 * Decide where a newly fetched article belongs.
 *
 * Guardrails, in order:
 *  1. Same canonical fingerprint -> duplicate, skip entirely.
 *  2. Published outside the time window of a topic -> not comparable.
 *  3. A merge needs shared proper-noun anchors plus similar headlines.
 *     Common words such as 软件 / 优惠 / 发布 can never merge two stories.
 */
export async function clusterArticle(
  article: Article,
  settings: Settings,
  topics?: TopicWithArticles[],
): Promise<ClusterDecision> {
  const fingerprint = article.fingerprint.trim();
  const allTopics = topics ?? (await listTopicsWithArticles());

  // Exact duplicate: same canonical URL already present in any topic.
  for (const topic of allTopics) {
    if (topic.articles.some((existing) => existing.fingerprint === fingerprint && existing.id !== article.id)) {
      return { action: "exact-duplicate", topicId: topic.id };
    }
  }

  // Compare in Simplified Chinese so Traditional and Simplified sources
  // describing the same event produce identical anchors.
  const title = simplifyText(article.title);
  let entities = await getArticleEntities(article);
  if (entities.length === 0) {
    entities = extractEntities(`${title} ${simplifyText(article.summary)}`);
    await setArticleEntities(article.id, entities);
  }
  // Headlines only. Summaries contain too much boilerplate to be reliable.
  const anchors = extractStrongAnchors(title);

  const windowMs = settings.timeWindowHours * 60 * 60 * 1000;
  let bestTopic: TopicWithArticles | null = null;
  let bestScore = 0;
  let bestSharedAnchors = 0;

  for (const topic of allTopics) {
    // Compare against several recent members, not just the newest one: the
    // same story can be reported again a few hours later.
    for (const member of topic.articles.slice(0, 10)) {
      if (Math.abs(member.publishedAt - article.publishedAt) > windowMs) continue;

      const memberTitle = simplifyText(member.title);
      const memberEntities = safeJsonArray(member.entities);
      const score = headlineSimilarity(
        title,
        memberTitle,
        entities.map(simplifyText),
        (memberEntities.length > 0 ? memberEntities : extractEntities(memberTitle)).map(simplifyText),
      );
      const shared = sharedAnchorCount(anchors, extractStrongAnchors(memberTitle));

      // Two shared proper nouns are decisive. A single one is only enough
      // when the headlines are also genuinely similar.
      const qualifies =
        shared >= 2 || (shared === 1 && score.combined >= settings.similarityThreshold);
      const effectiveScore = Math.max(score.combined, shared >= 2 ? 0.9 : shared === 1 ? 0.62 : 0);
      if (qualifies && effectiveScore > bestScore) {
        bestScore = effectiveScore;
        bestSharedAnchors = shared;
        bestTopic = topic;
      }
    }
  }

  if (bestTopic && bestSharedAnchors >= 1) {
    await addArticleToTopic(bestTopic.id, article.id);
    return { action: "merged", topicId: bestTopic.id, score: bestScore };
  }

  const label = summarizeLabel([title]);
  const topic = await createTopic({
    id: makeId("t_"),
    label,
    representativeTitle: title,
    isManual: 0,
  });
  await addArticleToTopic(topic.id, article.id);
  return { action: "created", topicId: topic.id, score: bestScore };
}

/** Re-cluster all articles from scratch. Used when the user changes strength. */
export async function reclusterAll(settings: Settings, articles: Article[]): Promise<{ topics: number; merged: number }> {
  const { getDb } = await import("../../lib/db");
  const db = await getDb();
  // Rebuild automatic topics but leave manual topics and their links intact.
  await db.execute(
    "DELETE FROM topic_articles WHERE topic_id IN (SELECT id FROM topics WHERE is_manual = 0)",
  );
  await db.execute("DELETE FROM topics WHERE is_manual = 0");
  // Anchors are now computed from Simplified Chinese titles; drop the old
  // entity cache so every article is re-tokenized with the new rules.
  await db.execute("UPDATE articles SET entities = '[]'");

  let topics = 0;
  let merged = 0;
  const sorted = [...articles]
    .map((article) => ({ ...article, entities: "[]" }))
    .sort((a, b) => a.publishedAt - b.publishedAt);
  let workingTopics: TopicWithArticles[] = await listTopicsWithArticles();

  for (const article of sorted) {
    const decision = await clusterArticle(article, settings, workingTopics);
    if (decision.action === "created") {
      topics += 1;
      workingTopics = await listTopicsWithArticles();
    } else if (decision.action === "merged") {
      merged += 1;
      workingTopics = workingTopics.map((topic) =>
        topic.id === decision.topicId
          ? { ...topic, articles: [article, ...topic.articles], updatedAt: Date.now() }
          : topic,
      );
    }
  }
  return { topics, merged };
}
