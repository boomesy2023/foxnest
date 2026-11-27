/** Shared domain types for Foxnest. */

export type FeedKind = "rss" | "miniflux" | "freshrss";

export interface Feed {
  id: string;
  title: string;
  url: string;
  kind: FeedKind;
  folder: string | null;
  /** Base URL for Miniflux / FreshRSS servers. */
  apiBase: string | null;
  lastFetchedAt: number | null;
  lastError: string | null;
  createdAt: number;
}

export interface Article {
  id: string;
  feedId: string;
  feedTitle: string;
  title: string;
  link: string | null;
  author: string | null;
  summary: string;
  content: string;
  publishedAt: number;
  fetchedAt: number;
  isRead: number;
  isStarred: number;
  /** Canonical fingerprint used for exact-duplicate detection. */
  fingerprint: string;
  /** JSON-encoded string[] of extracted entities. */
  entities: string;
  /** Sanitized HTML supplied by the feed itself (e.g. Readhub daily digest). */
  contentHtml: string;
  /** Cached full text extracted from the original page (empty until fetched). */
  fullContent: string;
  /** Timestamp of the last full-text fetch attempt (0 = never tried). */
  fullContentFetchedAt: number;
  /** Sanitized HTML of the full text, preserving images and links. */
  fullContentHtml: string;
  /** Podcast enclosure URL; empty for ordinary articles. */
  audioUrl: string;
  /** Episode length in seconds from itunes:duration (0 when unknown). */
  audioDurationSecs: number;
  /** Enclosure MIME type, e.g. audio/mpeg. */
  audioMime: string;
  /** Enclosure length in bytes (0 when unknown). */
  audioSize: number;
}

export interface Note {
  id: string;
  articleId: string;
  quote: string;
  createdAt: number;
}

export interface NoteWithArticle extends Note {
  articleTitle: string;
  feedTitle: string;
  articlePublishedAt: number;
}

/** Audio metadata stored alongside an article. */
export type ArticleAudio = Pick<
  Article,
  "audioUrl" | "audioDurationSecs" | "audioMime" | "audioSize"
>;

/** True when an article carries a playable podcast enclosure. */
export function isPodcastEpisode(article: Article): boolean {
  return article.audioUrl.length > 0;
}

export interface Topic {
  id: string;
  label: string;
  representativeTitle: string;
  createdAt: number;
  updatedAt: number;
  isManual: number;
}

export interface TopicWithArticles extends Topic {
  articles: Article[];
}

/** Left-sidebar article filter: all, unread, one feed, a folder group, or starred. */
export type ArticleFilter =
  | { type: "all" }
  | { type: "unread" }
  | { type: "feed"; id: string }
  | { type: "folder"; name: string }
  | { type: "starred" };

export type AggregationStrength = "conservative" | "normal" | "aggressive";
export type TranslationEngine = "dictionary" | "openai" | "ollama";

export interface Settings {
  aggregationStrength: AggregationStrength;
  timeWindowHours: number;
  /** Similarity threshold overrides per strength, 0-1. */
  similarityThreshold: number;
  entityOverlapThreshold: number;
  theme: "light" | "dark" | "system";
  /** Convert Traditional Chinese to Simplified when displaying articles. */
  convertTraditional: boolean;
  /** Automatic refresh interval in minutes; 0 disables startup and periodic refresh. */
  autoRefreshMinutes: number;
  translationEnabled: boolean;
  translationEngine: TranslationEngine;
  translationBaseUrl: string;
  translationModel: string;
}

export const DEFAULT_SETTINGS: Settings = {
  aggregationStrength: "normal",
  timeWindowHours: 48,
  similarityThreshold: 0.55,
  entityOverlapThreshold: 0.34,
  theme: "system",
  convertTraditional: true,
  autoRefreshMinutes: 30,
  translationEnabled: true,
  translationEngine: "dictionary",
  translationBaseUrl: "",
  translationModel: "",
};

export const STRENGTH_PRESETS: Record<
  AggregationStrength,
  Pick<Settings, "similarityThreshold" | "entityOverlapThreshold" | "timeWindowHours">
> = {
  conservative: {
    similarityThreshold: 0.72,
    entityOverlapThreshold: 0.55,
    timeWindowHours: 24,
  },
  normal: {
    similarityThreshold: 0.55,
    entityOverlapThreshold: 0.34,
    timeWindowHours: 48,
  },
  aggressive: {
    similarityThreshold: 0.4,
    entityOverlapThreshold: 0.22,
    timeWindowHours: 72,
  },
};
