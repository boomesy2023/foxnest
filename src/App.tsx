import { useEffect, useMemo, useState } from "react";
import { Rss, Settings as SettingsIcon, Layers, Star, ChevronDown, ChevronRight, Folder, Inbox, NotebookPen, ListFilter } from "lucide-react";
import { useAppStore } from "./store/useAppStore";
import type { ArticleFilter } from "./types";
import { cn } from "./lib/cn";
import { ArticleList } from "./features/articles/ArticleList";
import { ArticleReader } from "./features/articles/ArticleReader";
import { TopicView } from "./features/clustering/TopicView";
import { FeedManager } from "./features/feeds/FeedManager";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { NotesView } from "./features/notes/NotesView";
import { PodcastPlayer } from "./features/podcast/PodcastPlayer";
import { usePlayerStore } from "./features/podcast/playerStore";

export default function App() {
  const initialize = useAppStore((s) => s.initialize);
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const feeds = useAppStore((s) => s.feeds);
  const articles = useAppStore((s) => s.articles);
  const activeFilter = useAppStore((s) => s.activeFilter);
  const selectedArticleId = useAppStore((s) => s.selectedArticleId);
  const selectArticle = useAppStore((s) => s.selectArticle);
  const setFilter = useAppStore((s) => s.setFilter);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const loading = useAppStore((s) => s.loading);
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);
  const autoRefreshMinutes = useAppStore((s) => s.settings.autoRefreshMinutes);
  const unreadSessionReadIds = useAppStore((s) => s.unreadSessionReadIds);
  const hasPlayer = usePlayerStore((s) => Boolean(s.episode));

  const unreadCount = useMemo(
    () =>
      articles.filter(
        (a) => !a.isRead || (activeFilter.type === "unread" && unreadSessionReadIds.has(a.id)),
      ).length,
    [articles, activeFilter.type, unreadSessionReadIds],
  );

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      await initialize();
      if (cancelled) return;
      const state = useAppStore.getState();
      if (state.settings.autoRefreshMinutes > 0 && state.feeds.length > 0 && !state.busy) {
        await refreshAll();
      }
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [initialize, refreshAll]);

  useEffect(() => {
    if (autoRefreshMinutes <= 0) return;
    const timer = window.setInterval(() => {
      const state = useAppStore.getState();
      if (!state.loading && !state.busy && state.feeds.length > 0) {
        void refreshAll();
      }
    }, autoRefreshMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefreshMinutes, refreshAll]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(clearToast, 4000);
    return () => window.clearTimeout(timer);
  }, [toast, clearToast]);

  const folderFeedIds = useMemo(() => {
    if (activeFilter.type !== "folder") return null;
    return new Set(feeds.filter((f) => f.folder === activeFilter.name).map((f) => f.id));
  }, [feeds, activeFilter]);

  const visibleArticles = useMemo(() => {
    switch (activeFilter.type) {
      case "unread":
        return articles.filter((a) => !a.isRead || unreadSessionReadIds.has(a.id));
      case "feed":
        return articles.filter((a) => a.feedId === activeFilter.id);
      case "folder":
        return articles.filter((a) => folderFeedIds?.has(a.feedId));
      case "starred":
        return articles.filter((a) => a.isStarred === 1);
      default:
        return articles;
    }
  }, [articles, activeFilter, folderFeedIds, unreadSessionReadIds]);

  // Group feeds by folder for the sidebar. Feeds without a folder stay at top level.
  const groupedFeeds = useMemo(() => {
    const groups = new Map<string, typeof feeds>();
    const loose: typeof feeds = [];
    for (const feed of feeds) {
      if (feed.folder) {
        const list = groups.get(feed.folder) ?? [];
        list.push(feed);
        groups.set(feed.folder, list);
      } else {
        loose.push(feed);
      }
    }
    return { loose, groups: Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0])) };
  }, [feeds]);

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const chooseFilter = (filter: ArticleFilter) => {
    setFilter(filter);
    setFiltersOpen(false);
  };
  const toggleFolder = (name: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center text-[var(--muted)]">
        正在加载 Foxnest…
      </div>
    );
  }

  return (
    <div className="app-shell flex flex-col overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 pt-[env(safe-area-inset-top)]">
        <button onClick={() => setPage("reader")} className="flex items-center gap-2 text-[15px] font-semibold">
          <img src="/icons/icon.svg" alt="" className="h-6 w-6 rounded-md" />
          <span>Foxnest</span>
        </button>
        <div className="ml-4 hidden gap-1 md:flex">
          <NavButton active={page === "reader"} onClick={() => setPage("reader")} icon={<Rss size={15} />} label="阅读" />
          <NavButton active={page === "notes"} onClick={() => setPage("notes")} icon={<NotebookPen size={15} />} label="笔记" />
          <NavButton active={page === "topics"} onClick={() => setPage("topics")} icon={<Layers size={15} />} label="话题" />
          <NavButton active={page === "feeds"} onClick={() => setPage("feeds")} icon={<Folder size={15} />} label="订阅源" />
          <NavButton active={page === "settings"} onClick={() => setPage("settings")} icon={<SettingsIcon size={15} />} label="设置" />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((value) => !value)}
          className="ml-auto rounded-md p-2 text-[var(--muted)] hover:bg-[var(--accent-soft)] md:hidden"
          aria-label="筛选订阅源"
        >
          <ListFilter size={18} />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {page === "reader" && (
          <div className="relative flex h-full">
            {filtersOpen && (
              <button
                type="button"
                className="fixed inset-0 z-30 bg-black/30 md:hidden"
                onClick={() => setFiltersOpen(false)}
                aria-label="关闭筛选"
              />
            )}
            <aside className={cn(
              "fixed left-0 top-[calc(3rem+env(safe-area-inset-top))] z-40 w-64 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] py-3 md:static md:z-auto md:w-44 md:translate-x-0",
              hasPlayer
                ? "bottom-[calc(7.25rem+env(safe-area-inset-bottom))]"
                : "bottom-[calc(3.5rem+env(safe-area-inset-bottom))]",
              filtersOpen ? "translate-x-0" : "-translate-x-full",
            )}>
              <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">筛选</p>
              <SideItem
                active={activeFilter.type === "all"}
                onClick={() => chooseFilter({ type: "all" })}
                icon={<Rss size={13} />}
                label="全部文章"
              />
              <SideItem
                active={activeFilter.type === "unread"}
                onClick={() => chooseFilter({ type: "unread" })}
                icon={<Inbox size={13} />}
                label="未读文章"
                count={unreadCount}
              />
              <SideItem
                active={activeFilter.type === "starred"}
                onClick={() => chooseFilter({ type: "starred" })}
                icon={<Star size={13} />}
                label="已收藏"
              />

              <p className="mt-4 px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">订阅源</p>
              {groupedFeeds.loose.map((feed) => (
                <SideItem
                  key={feed.id}
                  active={activeFilter.type === "feed" && activeFilter.id === feed.id}
                  onClick={() => chooseFilter({ type: "feed", id: feed.id })}
                  label={feed.title}
                  indent
                />
              ))}
              {groupedFeeds.groups.map(([name, groupFeeds]) => {
                const collapsed = collapsedFolders.has(name);
                const folderActive = activeFilter.type === "folder" && activeFilter.name === name;
                return (
                  <div key={name}>
                    <div className="flex items-center">
                      <button
                        onClick={() => toggleFolder(name)}
                        className="ml-1 rounded p-1 text-[var(--muted)] hover:bg-[var(--accent-soft)]/50"
                        title={collapsed ? "展开分组" : "收起分组"}
                      >
                        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                      </button>
                      <button
                        onClick={() => chooseFilter({ type: "folder", name })}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-1.5 truncate py-1.5 pr-3 text-left text-xs",
                          folderActive ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--text)]",
                        )}
                      >
                        <Folder size={12} />
                        <span className="truncate">{name}</span>
                      </button>
                    </div>
                    {!collapsed && groupFeeds.map((feed) => (
                      <SideItem
                        key={feed.id}
                        active={activeFilter.type === "feed" && activeFilter.id === feed.id}
                        onClick={() => chooseFilter({ type: "feed", id: feed.id })}
                        label={feed.title}
                        indent
                      />
                    ))}
                  </div>
                );
              })}
            </aside>

            <div className={cn(
              "flex min-w-0 flex-1 flex-col border-[var(--border)] md:w-[320px] md:flex-none md:border-r",
              selectedArticleId && "hidden md:flex",
            )}>
              <div className="min-h-0 flex-1">
                <ArticleList articles={visibleArticles} />
              </div>
            </div>

            <div className={cn("min-w-0 flex-1", selectedArticleId ? "block" : "hidden md:block")}>
              <ArticleReader onBack={() => selectArticle(null)} />
            </div>
          </div>
        )}
        {page === "notes" && <NotesView />}
        {page === "topics" && (
          <div className="h-full overflow-hidden">
            <TopicView />
          </div>
        )}
        {page === "feeds" && <FeedManager />}
        {page === "settings" && <SettingsPanel />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
        <MobileNavButton active={page === "reader"} onClick={() => setPage("reader")} icon={<Rss size={18} />} label="阅读" />
        <MobileNavButton active={page === "notes"} onClick={() => setPage("notes")} icon={<NotebookPen size={18} />} label="笔记" />
        <MobileNavButton active={page === "topics"} onClick={() => setPage("topics")} icon={<Layers size={18} />} label="话题" />
        <MobileNavButton active={page === "feeds"} onClick={() => setPage("feeds")} icon={<Folder size={18} />} label="订阅源" />
        <MobileNavButton active={page === "settings"} onClick={() => setPage("settings")} icon={<SettingsIcon size={18} />} label="设置" />
      </nav>

      <PodcastPlayer />

      {toast && (
        <div className={cn(
          "pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 rounded-md bg-[var(--text)] px-4 py-2 text-xs text-[var(--surface)] shadow-lg",
          hasPlayer
            ? "bottom-[calc(8.25rem+env(safe-area-inset-bottom))] md:bottom-20"
            : "bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-5",
        )}>
          {toast}
        </div>
      )}
    </div>
  );
}

function SideItem({
  active,
  onClick,
  icon,
  label,
  count,
  indent,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  indent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1.5 truncate py-1.5 pr-3 text-left text-xs",
        indent ? "pl-7" : "pl-3",
        active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--accent-soft)]/50",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="ml-auto shrink-0 rounded-full bg-[var(--border)] px-1.5 text-[10px] tabular-nums text-[var(--muted)]">
          {count}
        </span>
      )}
    </button>
  );
}

function MobileNavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-w-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
        active ? "text-[var(--accent)]" : "text-[var(--muted)]",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)] hover:bg-[var(--accent-soft)]/50",
      )}
    >
      {icon} {label}
    </button>
  );
}
