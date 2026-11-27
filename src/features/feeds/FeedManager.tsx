import { useState, type FormEvent } from "react";
import { RefreshCw, Trash2, Rss, Globe, Folder, ShieldCheck, Plus, X, Cpu, Code2, Palette, FlaskConical, Newspaper, CircleAlert, Check } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { isTauri } from "../../lib/db";
import { cn } from "../../lib/cn";
import type { Feed } from "../../types";

type FeedCategory = "科技" | "开发" | "设计" | "科学" | "新闻";

interface RecommendedFeed {
  title: string;
  url: string;
  category: FeedCategory;
  description: string;
}

const RECOMMENDED_FEEDS: RecommendedFeed[] = [
  { title: "少数派", url: "https://sspai.com/feed", category: "科技", description: "高效工作、数字生活与效率工具的中文评测和教程。" },
  { title: "36氪", url: "https://www.36kr.com/feed", category: "科技", description: "关注科技创业、商业趋势、产品与投资动态。" },
  { title: "极客公园", url: "https://www.geekpark.net/rss", category: "科技", description: "报道科技创新、明星产品与商业变化。" },
  { title: "爱范儿", url: "https://www.ifanr.com/feed", category: "科技", description: "消费科技、数字产品与未来生活方式报道。" },
  { title: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "科技", description: "科技、科学、娱乐与文化的交叉报道。" },
  { title: "GitHub Blog", url: "https://github.blog/feed/", category: "开发", description: "GitHub 官方博客：开源、开发者工具与平台更新。" },
  { title: "CSS-Tricks", url: "https://css-tricks.com/feed/", category: "开发", description: "CSS、前端开发和现代 Web 实用技巧。" },
  { title: "web.dev", url: "https://web.dev/feed.xml", category: "开发", description: "Google Web 平台团队的 Web 标准、性能与最佳实践。" },
  { title: "React Blog", url: "https://react.dev/rss.xml", category: "开发", description: "React 官方版本、功能与生态动态。" },
  { title: "Smashing Magazine", url: "https://www.smashingmagazine.com/feed", category: "设计", description: "Web 设计、前端开发、UX 与可访问性深度文章。" },
  { title: "A List Apart", url: "https://alistapart.com/main/feed/", category: "设计", description: "探索 Web 标准、设计与内容策略。" },
  { title: "NASA News", url: "https://www.nasa.gov/news-release/feed/", category: "科学", description: "NASA 官方新闻、任务进展与太空发现。" },
  { title: "Science News", url: "https://www.sciencenews.org/feed", category: "科学", description: "覆盖生命、地球、健康与宇宙的科学研究新闻。" },
  { title: "Nature", url: "https://www.nature.com/nature.rss", category: "科学", description: "《自然》期刊文章与全球科研动态。" },
  { title: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", category: "新闻", description: "BBC 国际新闻与全球热点报道。" },
  { title: "The Guardian World", url: "https://www.theguardian.com/world/rss", category: "新闻", description: "《卫报》国际新闻、分析与现场报道。" },
];

const CATEGORY_ICONS: Record<FeedCategory, typeof Cpu> = {
  科技: Cpu,
  开发: Code2,
  设计: Palette,
  科学: FlaskConical,
  新闻: Newspaper,
};

function normalizeFeedUrl(url: string): string {
  try {
    return new URL(url).href.replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

export function FeedManager() {
  const feeds = useAppStore((s) => s.feeds);
  const busy = useAppStore((s) => s.busy);
  const refreshingFeedId = useAppStore((s) => s.refreshingFeedId);
  const setFeedFolder = useAppStore((s) => s.setFeedFolder);
  const deleteFeed = useAppStore((s) => s.deleteFeed);
  const refreshOne = useAppStore((s) => s.refreshOne);
  const verifyFeed = useAppStore((s) => s.verifyFeed);
  const addFeed = useAppStore((s) => s.addFeed);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");
  const [kind, setKind] = useState<Feed["kind"]>("rss");
  const [apiBase, setApiBase] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [adding, setAdding] = useState(false);
  const [presetAdding, setPresetAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState("");

  const existingFolders = Array.from(
    new Set(feeds.map((f) => f.folder).filter((v): v is string => Boolean(v))),
  ).sort();

  const submitFeed = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      await addFeed({
        url: url.trim(),
        title: title.trim() || undefined,
        folder: folder.trim() || undefined,
        kind,
        apiBase: apiBase.trim() || undefined,
        apiToken: apiToken.trim() || undefined,
      });
      setUrl("");
      setTitle("");
      setFolder("");
      setKind("rss");
      setApiBase("");
      setApiToken("");
      setShowAdd(false);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "订阅源添加失败");
    } finally {
      setAdding(false);
    }
  };

  const addPreset = async (preset: RecommendedFeed) => {
    const presetUrl = normalizeFeedUrl(preset.url);
    if (feeds.some((feed) => normalizeFeedUrl(feed.url) === presetUrl)) return;
    setPresetAdding(preset.url);
    setAddError("");
    try {
      await addFeed({ title: preset.title, url: preset.url, folder: preset.category, kind: "rss" });
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "订阅源添加失败");
    } finally {
      setPresetAdding(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-5 md:px-8 md:py-7">
      <datalist id="feed-folders">
        {existingFolders.map((name) => <option key={name} value={name} />)}
      </datalist>
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.18fr)] lg:items-start">
        <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-sm font-medium">已订阅</h2>
            <Button size="sm" variant={showAdd ? "ghost" : "primary"} onClick={() => setShowAdd((value) => !value)}>
              {showAdd ? <X size={14} /> : <Plus size={14} />}
              {showAdd ? "取消" : "添加订阅源"}
            </Button>
          </div>
          {showAdd && (
            <form onSubmit={(event) => void submitFeed(event)} className="space-y-3 border-b border-[var(--border)] bg-[var(--accent-soft)]/20 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-[var(--muted)] sm:col-span-2">
                  订阅地址
                  <Input
                    className="mt-1"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com/feed.xml"
                    autoFocus
                    required
                  />
                </label>
                <label className="block text-xs text-[var(--muted)]">
                  类型
                  <select
                    className="mt-1 h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[var(--text)] outline-none focus:border-[var(--accent)]"
                    value={kind}
                    onChange={(event) => setKind(event.target.value as Feed["kind"])}
                  >
                    <option value="rss">RSS / Atom</option>
                    <option value="miniflux">Miniflux</option>
                    <option value="freshrss">FreshRSS</option>
                  </select>
                </label>
                <label className="block text-xs text-[var(--muted)]">
                  名称（可选）
                  <Input className="mt-1" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="留空自动获取" />
                </label>
                <label className="block text-xs text-[var(--muted)]">
                  分组（可选）
                  <Input className="mt-1" list="feed-folders" value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="例如：技术" />
                </label>
                {kind !== "rss" && (
                  <>
                    <label className="block text-xs text-[var(--muted)] sm:col-span-2">
                      服务地址
                      <Input className="mt-1" value={apiBase} onChange={(event) => setApiBase(event.target.value)} placeholder="https://your-service.example" required />
                    </label>
                    <label className="block text-xs text-[var(--muted)] sm:col-span-2">
                      API Token
                      <Input className="mt-1" type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="保存在系统钥匙串或浏览器存储" autoComplete="off" />
                    </label>
                  </>
                )}
              </div>
              {addError && <p className="text-xs text-red-600">{addError}</p>}
              <div className="flex justify-end">
                <Button size="sm" variant="primary" type="submit" disabled={adding || !url.trim()}>
                  {adding ? "添加中…" : "添加"}
                </Button>
              </div>
            </form>
          )}
          <div className="divide-y divide-[var(--border)]">
            {feeds.length === 0 && (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Rss size={18} />
                </span>
                <p className="text-sm font-medium">还没有订阅源</p>
                <p className="text-xs text-[var(--muted)]">
                  <span className="md:hidden">从下方推荐</span>
                  <span className="hidden md:inline">从右侧推荐</span>
                  {" "}或手动添加一个开始阅读。
                </p>
              </div>
            )}
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className={cn(
                  "grid min-h-[76px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--accent-soft)]/20",
                  feed.lastError && "bg-red-500/[0.03]",
                )}
              >
                <span className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  feed.lastError ? "bg-red-500/10 text-red-600" : "bg-[var(--accent-soft)] text-[var(--accent)]",
                )}>
                  {feed.kind === "rss" ? <Rss size={15} /> : <Globe size={15} />}
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-[13px] font-medium">{feed.title}</p>
                    <FolderInput
                      value={feed.folder}
                      onCommit={(next) => void setFeedFolder(feed.id, next)}
                    />
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-[10px] text-[var(--muted)]">
                    <span className="min-w-0 flex-1 truncate" title={feed.url}>{feed.url}</span>
                    <span className="shrink-0">
                      {feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleDateString("zh-CN") : "未更新"}
                    </span>
                  </div>
                  {feed.lastError && (
                    <p
                      className="mt-1 flex items-center gap-1 text-[10px] text-red-600"
                      title={feed.lastError}
                      role="status"
                    >
                      <CircleAlert size={11} className="shrink-0" />
                      <span className="truncate">刷新失败：{feed.lastError}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  {feed.kind === "rss" && isTauri() && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      disabled={busy}
                      title="站点有人机验证时，打开窗口完成验证并抓取"
                      aria-label="验证此订阅源"
                      onClick={() => void verifyFeed(feed.id)}
                    >
                      <ShieldCheck size={13} />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 px-0"
                    disabled={busy}
                    title="刷新此订阅源"
                    aria-label={`刷新 ${feed.title}`}
                    onClick={() => void refreshOne(feed.id)}
                  >
                    <RefreshCw size={13} className={refreshingFeedId === feed.id ? "animate-spin" : ""} />
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    className="h-8 w-8 px-0"
                    title="删除此订阅源"
                    aria-label={`删除 ${feed.title}`}
                    onClick={() => void deleteFeed(feed.id)}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          <div className="flex min-h-16 items-center border-b border-[var(--border)] px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">推荐订阅源</h2>
              <p className="mt-0.5 text-[11px] text-[var(--muted)]">官方或长期维护的 RSS / Atom</p>
            </div>
          </div>
          {addError && !showAdd && (
            <p className="border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-600">{addError}</p>
          )}
          <div className="divide-y divide-[var(--border)]">
            {(["科技", "开发", "设计", "科学", "新闻"] as const).map((category) => {
              const Icon = CATEGORY_ICONS[category];
              const categoryFeeds = RECOMMENDED_FEEDS.filter((feed) => feed.category === category);
              return (
                <div key={category}>
                  <div className="flex items-center gap-2 bg-[var(--accent-soft)]/25 px-4 py-2 text-[var(--accent)]">
                    <Icon size={13} />
                    <h3 className="text-xs font-medium">{category}</h3>
                  </div>
                  <div className="divide-y divide-[var(--border)]">
                    {categoryFeeds.map((preset) => {
                      const presetUrl = normalizeFeedUrl(preset.url);
                      const added = feeds.some((feed) => normalizeFeedUrl(feed.url) === presetUrl);
                      const host = preset.url.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
                      return (
                        <div
                          key={preset.url}
                          className={cn(
                            "grid min-h-[68px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--accent-soft)]/20",
                            added && "bg-[var(--accent-soft)]/10",
                          )}
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                            <Rss size={14} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-baseline gap-2">
                              <p className="min-w-0 truncate text-[13px] font-medium">{preset.title}</p>
                              <p className="hidden shrink-0 truncate text-[10px] text-[var(--muted)] sm:inline">{host}</p>
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{preset.description}</p>
                          </div>
                          <Button
                            size="sm"
                            variant={added ? "ghost" : "primary"}
                            className="h-8 w-[72px] px-0"
                            disabled={added || presetAdding !== null}
                            onClick={() => void addPreset(preset)}
                          >
                            {added ? <><Check size={12} />已添加</> : presetAdding === preset.url ? "添加中…" : "添加"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Inline folder tag: click to edit, Enter/blur to commit, Esc to cancel. */
function FolderInput({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (next: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        className="flex shrink-0 items-center gap-1 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--accent)] hover:opacity-80"
        title={value ? `分组：${value}（点击修改）` : "设置分组"}
      >
        <Folder size={10} />
        {value || "未分组"}
      </button>
    );
  }

  const commit = () => {
    const next = draft.trim() || null;
    setEditing(false);
    if (next !== value) onCommit(next);
  };

  return (
    <input
      autoFocus
      list="feed-folders"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
      placeholder="分组名"
      className="w-28 rounded border border-[var(--accent)] bg-[var(--surface)] px-1.5 py-0.5 text-[10px] outline-none"
    />
  );
}
