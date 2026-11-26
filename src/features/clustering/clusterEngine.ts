import type { Article, Settings, TopicWithArticles } from "../../types";
import { makeId, safeJsonArray } from "../../lib/utils";
import { simplifyText } from "../../lib/zhConvert";
import { extractEntities, extractStrongAnchors, sharedAnchorCount, summarizeLabel } from "./tokenizer";
import { headlineSimilarity } from "./similarity";
import {
  addArticleToTopic,
  getArticleEntities,
  listManualTopicsWithArticles,
  setArticleEntities,
} from "./topicRepo";

export interface ClusterDecision {
  action: "merged" | "created" | "skipped" | "exact-duplicate";
  topicId: string | null;
  score?: number;
  topics: TopicWithArticles[];
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
  topics: TopicWithArticles[],
): Promise<ClusterDecision> {
  const fingerprint = article.fingerprint.trim();

  for (const topic of topics) {
    if (topic.articles.some((existing) => existing.fingerprint === fingerprint && existing.id !== article.id)) {
      return { action: "exact-duplicate", topicId: topic.id, topics };
    }
  }

  const title = simplifyText(article.title);
  let entities = await getArticleEntities(article);
  if (entities.length === 0) {
    entities = extractEntities(`${title} ${simplifyText(article.summary)}`);
    await setArticleEntities(article.id, entities);
    article = { ...article, entities: JSON.stringify(entities) };
  }
  const anchors = extractStrongAnchors(title);

  const windowMs = settings.timeWindowHours * 60 * 60 * 1000;
  let bestTopic: TopicWithArticles | null = null;
  let bestScore = 0;
  let bestSharedAnchors = 0;

  for (const topic of topics) {
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
    if (bestTopic.isManual === 1) {
      await addArticleToTopic(bestTopic.id, article.id);
    }
    const articles = [article, ...bestTopic.articles];
    const mergedTopic: TopicWithArticles = {
      ...bestTopic,
      articles,
      updatedAt: Date.now(),
      ...(bestTopic.isManual === 0
        ? {
            label: summarizeLabel(articles.map((item) => simplifyText(item.title))),
            representativeTitle: simplifyText(articles[0].title),
          }
        : {}),
    };
    return {
      action: "merged",
      topicId: bestTopic.id,
      score: bestScore,
      topics: topics.map((topic) => (topic.id === bestTopic.id ? mergedTopic : topic)),
    };
  }

  const now = Date.now();
  const topic: TopicWithArticles = {
    id: makeId("t_"),
    label: summarizeLabel([title]),
    representativeTitle: title,
    createdAt: now,
    updatedAt: now,
    isManual: 0,
    articles: [article],
  };
  return { action: "created", topicId: topic.id, topics: [...topics, topic] };
}

export async function reclusterAll(
  settings: Settings,
  articles: Article[],
): Promise<{ topics: TopicWithArticles[]; created: number; merged: number }> {
  let workingTopics = await listManualTopicsWithArticles();
  let created = 0;
  let merged = 0;
  const sorted = [...articles].sort((a, b) => a.publishedAt - b.publishedAt);

  for (const article of sorted) {
    const decision = await clusterArticle(article, settings, workingTopics);
    workingTopics = decision.topics;
    if (decision.action === "created") created += 1;
    else if (decision.action === "merged") merged += 1;
  }
  return { topics: workingTopics, created, merged };
}
