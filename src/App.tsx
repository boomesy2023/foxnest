import { useEffect, useMemo, useState } from "react";
import { Rss, Settings as SettingsIcon, RefreshCw, Layers, Star, ChevronDown, ChevronRight, Folder, Inbox } from "lucide-react";
import { useAppStore } from "./store/useAppStore";
import { cn } from "./lib/cn";
import { ArticleList } from "./features/articles/ArticleList";
import { ArticleReader } from "./features/articles/ArticleReader";
import { TopicView } from "./features/clustering/TopicView";
import { FeedManager } from "./features/feeds/FeedManager";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { PodcastPlayer } from "./features/podcast/PodcastPlayer";
import { usePlayerStore } from "./features/podcast/playerStore";

export default function App() {
  const initialize = useAppStore((s) => s.initialize);
  const page = useAppStore((s) => s.page);
  const setPage = useAppStore((s) => s.setPage);
  const feeds = useAppStore((s) => s.feeds);
  const articles = useAppStore((s) => s.articles);
  const activeFilter = useAppStore((s) => s.activeFilter);
  const setFilter = useAppStore((s) => s.setFilter);
  const refreshAll = useAppStore((s) => s.refreshAll);
  const busy = useAppStore((s) => s.busy);
  const loading = useAppStore((s) => s.loading);
  const toast = useAppStore((s) => s.toast);
  const clearToast = useAppStore((s) => s.clearToast);
  const reports = useAppStore((s) => s.reports);
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
    void initialize();
  }, [initialize]);

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

  const filterTitle = useMemo(() => {
    switch (activeFilter.type) {
      case "feed":
        return feeds.find((f) => f.id === activeFilter.id)?.title ?? "全部文章";
      case "folder":
        return activeFilter.name;
      case "unread":
        return "未读文章";
      case "starred":
        return "已收藏";
      default:
        return "全部文章";
    }
  }, [activeFilter, feeds]);

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
      <div className="flex h-screen items-center justify-center text-[var(--muted)]">
        正在加载 Foxnest…
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <button onClick={() => setPage("reader")} className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="text-[var(--accent)]">F</span>
          <span>Foxnest</span>
        </button>
        <div className="ml-4 flex gap-1">
          <NavButton active={page === "reader"} onClick={() => setPage("reader")} icon={<Rss size={15} />} label="阅读" />
          <NavButton active={page === "topics"} onClick={() => setPage("topics")} icon={<Layers size={15} />} label="话题" />
          <NavButton active={page === "feeds"} onClick={() => setPage("feeds")} icon={<Folder size={15} />} label="订阅源" />
          <NavButton active={page === "settings"} onClick={() => setPage("settings")} icon={<SettingsIcon size={15} />} label="设置" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {reports.length > 0 && page === "reader" && (
            <span className="text-[11px] text-[var(--muted)]">
              上次更新：{reports.length} 源 / +{reports.reduce((sum, r) => sum + r.added, 0)}
            </span>
          )}
          <button
            onClick={() => void refreshAll()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--accent-soft)] disabled:opacity-50"
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
            {busy ? "更新中" : "刷新全部"}
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1">
        {page === "reader" && (
          <div className="flex h-full">
            <aside className="w-48 shrink-0 overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] py-3">
              <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">筛选</p>
              <SideItem
                active={activeFilter.type === "all"}
                onClick={() => setFilter({ type: "all" })}
                icon={<Rss size={13} />}
                label="全部文章"
              />
              <SideItem
                active={activeFilter.type === "unread"}
                onClick={() => setFilter({ type: "unread" })}
                icon={<Inbox size={13} />}
                label="未读文章"
                count={unreadCount}
              />
              <SideItem
                active={activeFilter.type === "starred"}
                onClick={() => setFilter({ type: "starred" })}
                icon={<Star size={13} />}
                label="已收藏"
              />

              <p className="mt-4 px-3 pb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">订阅源</p>
              {groupedFeeds.loose.map((feed) => (
                <SideItem
                  key={feed.id}
                  active={activeFilter.type === "feed" && activeFilter.id === feed.id}
                  onClick={() => setFilter({ type: "feed", id: feed.id })}
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
                        onClick={() => setFilter({ type: "folder", name })}
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
                        onClick={() => setFilter({ type: "feed", id: feed.id })}
                        label={feed.title}
                        indent
                      />
                    ))}
                  </div>
                );
              })}
            </aside>

            <div className="flex w-[360px] shrink-0 flex-col border-r border-[var(--border)]">
              <div className="min-h-0 flex-1">
                <ArticleList articles={visibleArticles} title={filterTitle} />
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <ArticleReader />
            </div>
          </div>
        )}
        {page === "topics" && (
          <div className="h-full overflow-hidden">
            <TopicView />
          </div>
        )}
        {page === "feeds" && <FeedManager />}
        {page === "settings" && <SettingsPanel />}
      </main>
      <PodcastPlayer />

      {toast && (
        <div className={cn(
          "pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 rounded-md bg-[var(--text)] px-4 py-2 text-xs text-[var(--surface)] shadow-lg",
          hasPlayer ? "bottom-20" : "bottom-5",
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
