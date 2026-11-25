import { create } from "zustand";
import type { AggregationStrength, Article, ArticleFilter, Feed, Settings, TopicWithArticles } from "../types";
import { DEFAULT_SETTINGS, STRENGTH_PRESETS } from "../types";
import { listFeeds, insertFeed, updateFeed, deleteFeed as repoDeleteFeed } from "../features/feeds/feedRepo";
import { refreshFeed } from "../features/feeds/apiClients";
import { exportOpml, importOpml } from "../features/feeds/opml";
import { listArticles, setArticleRead, setArticleStarred } from "../features/articles/articleRepo";
import { listTopicsWithArticles, mergeTopics, deleteTopic, removeArticleFromTopic } from "../features/clustering/topicRepo";
import { clusterArticle, reclusterAll } from "../features/clustering/clusterEngine";
import { getSetting, loadSettings, saveSettings, setSetting } from "../features/settings/settingsRepo";
import { makeId } from "../lib/utils";
import { closeVerificationWindow, isFeedVerified, openVerificationWindow } from "../lib/db";

// Guard against overlapping refreshes. Two concurrent fetches of the same feed
// both see "no existing article" before either inserts, producing duplicates.
let refreshInFlight = false;

/** Bump this when the clustering rules change so existing data is rebuilt. */
const CLUSTER_ENGINE_VERSION = "strict-anchor-v3";

export type Page = "reader" | "topics" | "feeds" | "settings";

interface RefreshReport {
  feedTitle: string;
  added: number;
  duplicates: number;
  error?: string;
}

interface AppState {
  feeds: Feed[];
  articles: Article[];
  topics: TopicWithArticles[];
  settings: Settings;
  page: Page;
  activeFilter: ArticleFilter;
  selectedArticleId: string | null;
  /** Articles already read during the current unread-filter session. */
  unreadSessionReadIds: Set<string>;
  expandedTopicId: string | null;
  loading: boolean;
  busy: boolean;
  fullTextLoadingId: string | null;
  toast: string | null;
  reports: RefreshReport[];

  initialize: () => Promise<void>;
  setPage: (page: Page) => void;
  setFilter: (filter: ArticleFilter) => void;
  selectArticle: (id: string | null) => void;
  loadFullText: (id: string, force?: boolean) => Promise<void>;
  toggleTopic: (id: string | null) => void;
  refreshAll: () => Promise<void>;
  refreshOne: (id: string) => Promise<void>;
  verifyFeed: (id: string) => Promise<void>;
  addFeed: (input: { url: string; title?: string; folder?: string; kind?: Feed["kind"]; apiBase?: string; apiToken?: string }) => Promise<void>;
  setFeedFolder: (id: string, folder: string | null) => Promise<void>;
  deleteFeed: (id: string) => Promise<void>;
  importFeedsFromOpml: (xml: string) => Promise<void>;
  exportFeedsToOpml: () => Promise<string>;
  toggleRead: (id: string) => Promise<void>;
  markTopicAsRead: (topicId: string, keepArticleId?: string) => Promise<void>;
  toggleStarred: (id: string) => Promise<void>;
  setStrength: (strength: AggregationStrength) => Promise<void>;
  setTimeWindow: (hours: number) => Promise<void>;
  setTheme: (theme: Settings["theme"]) => Promise<void>;
  setConvertTraditional: (enabled: boolean) => Promise<void>;
  splitArticleFromTopic: (topicId: string, articleId: string) => Promise<void>;
  mergeTopicInto: (sourceId: string, targetId: string) => Promise<void>;
  removeTopic: (topicId: string) => Promise<void>;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  feeds: [],
  articles: [],
  topics: [],
  settings: DEFAULT_SETTINGS,
  page: "reader",
  activeFilter: { type: "all" },
  selectedArticleId: null,
  unreadSessionReadIds: new Set<string>(),
  expandedTopicId: null,
  loading: false,
  busy: false,
  fullTextLoadingId: null,
  toast: null,
  reports: [],

  initialize: async () => {
    set({ loading: true });
    try {
      const [feeds, articles, topics, settings, clusterVersion] = await Promise.all([
        listFeeds(),
        listArticles(),
        listTopicsWithArticles(),
        loadSettings(),
        getSetting("clusterEngineVersion"),
      ]);

      let nextArticles = articles;
      let nextTopics = topics;
      if (clusterVersion !== CLUSTER_ENGINE_VERSION) {
        await reclusterAll(settings, articles);
        await setSetting("clusterEngineVersion", CLUSTER_ENGINE_VERSION);
        [nextArticles, nextTopics] = await Promise.all([listArticles(), listTopicsWithArticles()]);
      }

      set({ feeds, articles: nextArticles, topics: nextTopics, settings });
      applyTheme(settings.theme);
    } catch (error) {
      set({ toast: `初始化失败：${errorText(error)}` });
    } finally {
      set({ loading: false });
    }
  },

  setPage: (page) => set({ page }),
  setFilter: (filter) =>
    set({ activeFilter: filter, selectedArticleId: null, unreadSessionReadIds: new Set<string>() }),
  selectArticle: (id) => {
    set({ selectedArticleId: id });
    if (!id) return;
    // Keep articles opened in the current unread session visible until the
    // user re-enters the unread filter, so the list does not jump away.
    if (get().activeFilter.type === "unread") {
      set({ unreadSessionReadIds: new Set(get().unreadSessionReadIds).add(id) });
    }
    const article = get().articles.find((item) => item.id === id);
    if (!article) return;
    // Opening an article marks it read; manual "mark unread" stays available.
    if (!article.isRead) {
      void setArticleRead(id, true).then(() => {
        set({
          articles: get().articles.map((item) =>
            item.id === id ? { ...item, isRead: 1 } : item,
          ),
        });
      });
    }
    // Podcast shownotes come from the feed; never scrape the episode page.
    if (!article.fullContentHtml && !article.audioUrl) void get().loadFullText(id);
  },

  loadFullText: async (id, force = false) => {
    const article = get().articles.find((item) => item.id === id);
    if (!article || !article.link || article.audioUrl) return;
    if (get().fullTextLoadingId === id) return;

    const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
    if (!force && article.fullContentHtml) return;
    // A legacy cache holding plain text only must be re-fetched to obtain HTML.
    // The retry-time guard applies only to genuine failures (no cached text).
    const isLegacyTextOnly = Boolean(article.fullContent) && !article.fullContentHtml;
    if (
      !force &&
      !isLegacyTextOnly &&
      article.fullContentFetchedAt > 0 &&
      Date.now() - article.fullContentFetchedAt < RETRY_AFTER_MS
    ) return;

    set({ fullTextLoadingId: id });
    try {
      const { fetchFullText, cacheFullText } = await import("../features/articles/fullTextService");
      const result = await fetchFullText(article);
      await cacheFullText(id, result);
      set({
        articles: get().articles.map((item) =>
          item.id === id
            ? {
                ...item,
                fullContent: result.text,
                fullContentHtml: result.html,
                fullContentFetchedAt: Date.now(),
              }
            : item,
        ),
      });
    } catch (error) {
      // Keep the article usable even if fetching fails; the timestamp guard
      // prevents an immediate retry loop.
      set({ toast: `全文抓取失败：${errorText(error)}` });
    } finally {
      set({ fullTextLoadingId: null });
    }
  },

  toggleTopic: (id) => set({ expandedTopicId: get().expandedTopicId === id ? null : id }),

  refreshAll: async () => {
    if (refreshInFlight) return;
    const { feeds } = get();
    if (feeds.length === 0) {
      set({ toast: "还没有订阅源，先添加一个吧" });
      return;
    }
    refreshInFlight = true;
    set({ busy: true, reports: [] });
    const reports: RefreshReport[] = [];
    const settings = get().settings;
    let topics: Awaited<ReturnType<typeof listTopicsWithArticles>> = [];
    try {
      topics = await listTopicsWithArticles();
      for (const feed of feeds) {
        let result;
        try {
          result = await refreshFeed(feed);
        } catch (error) {
          result = { added: 0, duplicates: 0, total: 0, error: errorText(error) };
        }
        reports.push({ feedTitle: feed.title, added: result.added, duplicates: result.duplicates, error: result.error });
        set({ reports: [...reports] });
        if (result.added > 0) {
          const freshArticles = await listArticles();
          const newOnes = freshArticles.filter(
            (a) => a.feedId === feed.id && !get().articles.some((old) => old.id === a.id),
          );
          for (const article of newOnes) {
            await clusterArticle(article, settings, topics);
            topics = await listTopicsWithArticles();
          }
        }
      }
      const [articles, updatedFeeds, updatedTopics] = await Promise.all([
        listArticles(),
        listFeeds(),
        listTopicsWithArticles(),
      ]);
      const totalAdded = reports.reduce((sum, report) => sum + report.added, 0);
      const failed = reports.filter((r) => r.error);
      set({
        articles,
        feeds: updatedFeeds,
        topics: updatedTopics,
        toast: failed.length > 0
          ? `${failed.length} 个源更新失败：${failed[0].error}`
          : `已更新 ${reports.length} 个订阅源，新增 ${totalAdded} 篇文章`,
      });
    } catch (error) {
      set({ toast: `刷新失败：${errorText(error)}` });
    } finally {
      // Always release both flags, even on error, so the UI never sticks.
      refreshInFlight = false;
      set({ busy: false });
    }
  },

  refreshOne: async (id) => {
    if (refreshInFlight) return;
    const feed = get().feeds.find((item) => item.id === id);
    if (!feed) return;
    refreshInFlight = true;
    set({ busy: true });
    try {
      let result;
      try {
        result = await refreshFeed(feed);
      } catch (error) {
        result = { added: 0, duplicates: 0, total: 0, error: errorText(error) };
      }
      if (result.added > 0) {
        const settings = get().settings;
        const [fresh, topics] = await Promise.all([listArticles(), listTopicsWithArticles()]);
        const newOnes = fresh.filter((a) => a.feedId === id && !get().articles.some((old) => old.id === a.id));
        let working = topics;
        for (const article of newOnes) {
          await clusterArticle(article, settings, working);
          working = await listTopicsWithArticles();
        }
      }
      const [articles, feeds, topics] = await Promise.all([listArticles(), listFeeds(), listTopicsWithArticles()]);
      set({
        articles,
        feeds,
        topics,
        toast: result.error
          ? `${feed.title} 更新失败：${result.error}`
          : `${feed.title}：新增 ${result.added} 篇，重复 ${result.duplicates} 篇`,
      });
    } catch (error) {
      set({ toast: `刷新失败：${errorText(error)}` });
    } finally {
      refreshInFlight = false;
      set({ busy: false });
    }
  },

  verifyFeed: async (id) => {
    const feed = get().feeds.find((item) => item.id === id);
    if (!feed || feed.kind !== "rss") return;
    try {
      const siteUrl = new URL(feed.url).origin;
      await openVerificationWindow(siteUrl, feed.url);
      set({ toast: "已在单独窗口打开站点，请完成验证；完成后会自动抓取" });

      // Poll for the verified feed captured by the in-app browser.
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (await isFeedVerified(feed.url)) {
          set({ toast: "验证成功，正在抓取文章…" });
          await closeVerificationWindow().catch(() => undefined);
          await get().refreshOne(id);
          return;
        }
      }
      set({ toast: "等待验证超时，请确认已在弹出窗口完成验证后，再点一次盾牌按钮" });
    } catch (error) {
      set({ toast: `验证失败：${errorText(error)}` });
    }
  },

  addFeed: async (input) => {
    let title = input.title?.trim();
    if (!title && input.kind === "rss") {
      const { probeFeedTitle } = await import("../features/feeds/rssService");
      try {
        title = await probeFeedTitle(input.url);
      } catch {
        title = input.url;
      }
    }
    await insertFeed({
      id: makeId("f_"),
      title: title || input.url,
      url: input.url,
      kind: input.kind ?? "rss",
      folder: input.folder?.trim() || null,
      apiBase: input.apiBase ?? null,
      lastFetchedAt: null,
      createdAt: Date.now(),
    }, input.apiToken?.trim() || null);
    set({ feeds: await listFeeds(), toast: "订阅源已添加" });
  },

  setFeedFolder: async (id, folder) => {
    await updateFeed(id, { folder });
    set({ feeds: await listFeeds(), toast: folder ? `已移入分组「${folder}」` : "已移出分组" });
  },

  deleteFeed: async (id) => {
    await repoDeleteFeed(id);
    const current = get().activeFilter;
    const nextFilter: ArticleFilter =
      current.type === "feed" && current.id === id ? { type: "all" } : current;
    set({
      feeds: await listFeeds(),
      articles: await listArticles(),
      topics: await listTopicsWithArticles(),
      activeFilter: nextFilter,
      toast: "订阅源已删除",
    });
  },

  importFeedsFromOpml: async (xml) => {
    const count = await importOpml(xml);
    set({ feeds: await listFeeds(), toast: `已从 OPML 导入 ${count} 个订阅源` });
  },

  exportFeedsToOpml: exportOpml,

  toggleRead: async (id) => {
    const article = get().articles.find((item) => item.id === id);
    if (!article) return;
    const isUnreadSession = get().activeFilter.type === "unread";
    const next = article.isRead ? 0 : 1;
    await setArticleRead(id, next === 1);
    const retained = new Set(get().unreadSessionReadIds);
    if (next === 1 && isUnreadSession) retained.add(id);
    else retained.delete(id);
    set({
      articles: get().articles.map((item) => (item.id === id ? { ...item, isRead: next } : item)),
      unreadSessionReadIds: retained,
    });
  },

  markTopicAsRead: async (topicId, keepArticleId) => {
    const topic = get().topics.find((item) => item.id === topicId);
    if (!topic) return;
    const targets = topic.articles.filter(
      (article) => article.id !== keepArticleId && !article.isRead,
    );
    if (targets.length === 0) return;

    await Promise.all(targets.map((article) => setArticleRead(article.id, true)));
    const retained = new Set(get().unreadSessionReadIds);
    if (get().activeFilter.type === "unread") {
      targets.forEach((article) => retained.add(article.id));
    }
    const targetIds = new Set(targets.map((article) => article.id));
    set({
      articles: get().articles.map((article) =>
        targetIds.has(article.id) ? { ...article, isRead: 1 } : article,
      ),
      unreadSessionReadIds: retained,
    });
  },

  toggleStarred: async (id) => {
    const article = get().articles.find((item) => item.id === id);
    if (!article) return;
    const next = article.isStarred ? 0 : 1;
    await setArticleStarred(id, next === 1);
    set({ articles: get().articles.map((item) => (item.id === id ? { ...item, isStarred: next } : item)) });
  },

  setStrength: async (strength) => {
    const settings = {
      ...get().settings,
      aggregationStrength: strength,
      ...STRENGTH_PRESETS[strength],
    };
    await saveSettings(settings);
    set({ busy: true, settings });
    try {
      const result = await reclusterAll(settings, get().articles);
      set({
        topics: await listTopicsWithArticles(),
        toast: `已按${strength === "aggressive" ? "激进" : strength === "normal" ? "标准" : "保守"}强度重新归集：${result.topics} 个话题`,
      });
    } catch (error) {
      set({ toast: `重新归集失败：${errorText(error)}` });
    } finally {
      set({ busy: false });
    }
  },

  setTimeWindow: async (hours) => {
    const settings = { ...get().settings, timeWindowHours: hours };
    await saveSettings(settings);
    set({ settings, busy: true });
    try {
      await reclusterAll(settings, get().articles);
      set({ topics: await listTopicsWithArticles(), toast: `时间窗已设为 ${hours} 小时` });
    } catch (error) {
      set({ toast: `重新归集失败：${errorText(error)}` });
    } finally {
      set({ busy: false });
    }
  },

  setTheme: async (theme) => {
    const settings = { ...get().settings, theme };
    await saveSettings(settings);
    applyTheme(theme);
    set({ settings });
  },

  setConvertTraditional: async (enabled) => {
    const settings = { ...get().settings, convertTraditional: enabled };
    await saveSettings(settings);
    set({ settings, toast: enabled ? "已开启繁体转简体显示" : "已恢复原文显示" });
  },

  splitArticleFromTopic: async (topicId, articleId) => {
    await removeArticleFromTopic(topicId, articleId);
    set({ topics: await listTopicsWithArticles(), toast: "文章已从话题中移出" });
  },

  mergeTopicInto: async (sourceId, targetId) => {
    await mergeTopics(sourceId, targetId);
    set({ topics: await listTopicsWithArticles(), toast: "话题已合并" });
  },

  removeTopic: async (topicId) => {
    await deleteTopic(topicId);
    set({ topics: await listTopicsWithArticles(), toast: "话题已解散" });
  },

  clearToast: () => set({ toast: null }),
}));

function applyTheme(theme: Settings["theme"]) {
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
