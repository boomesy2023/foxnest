import { useState, type FormEvent } from "react";
import { RefreshCw, Trash2, Rss, Globe, Folder, ShieldCheck, Plus, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { isTauri } from "../../lib/db";
import type { Feed } from "../../types";

const PRESET_FEEDS = [
  { title: "少数派", url: "https://sspai.com/feed", folder: "科技" },
  { title: "36氪", url: "https://www.36kr.com/feed", folder: "科技" },
  { title: "机器之心", url: "https://www.jiqizhixin.com/rss", folder: "科技" },
  { title: "Hacker News", url: "https://hnrss.org/frontpage", folder: "开发" },
  { title: "GitHub Blog", url: "https://github.blog/feed/", folder: "开发" },
  { title: "CSS-Tricks", url: "https://css-tricks.com/feed/", folder: "开发" },
] as const;

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

  const addPreset = async (preset: (typeof PRESET_FEEDS)[number]) => {
    if (feeds.some((feed) => feed.url === preset.url)) return;
    setPresetAdding(preset.url);
    setAddError("");
    try {
      await addFeed({ ...preset, kind: "rss" });
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
      <div className="mx-auto max-w-3xl">
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium">预置订阅源</h2>
            <span className="text-[11px] text-[var(--muted)]">一键添加，随时可删除</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRESET_FEEDS.map((preset) => {
              const added = feeds.some((feed) => feed.url === preset.url);
              const host = preset.url.replace(/^https?:\/\//, "").split("/")[0];
              return (
                <div key={preset.url} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Rss size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{preset.title}</p>
                    <p className="truncate text-[11px] text-[var(--muted)]">{preset.folder} · {host}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={added ? "ghost" : "primary"}
                    disabled={added || presetAdding !== null}
                    onClick={() => void addPreset(preset)}
                  >
                    {added ? "已添加" : presetAdding === preset.url ? "添加中…" : "添加"}
                  </Button>
                </div>
              );
            })}
          </div>
          {addError && !showAdd && <p className="mt-2 text-xs text-red-600">{addError}</p>}
        </section>

        <div className="mb-4 flex justify-end">
          <Button size="sm" variant={showAdd ? "ghost" : "primary"} onClick={() => setShowAdd((value) => !value)}>
            {showAdd ? <X size={14} /> : <Plus size={14} />}
            {showAdd ? "取消" : "添加订阅源"}
          </Button>
        </div>
        {showAdd && (
          <form onSubmit={(event) => void submitFeed(event)} className="mb-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
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
        <div className="space-y-2">
          {feeds.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--border)] py-12 text-center text-[var(--muted)]">
              还没有订阅源。
            </p>
          )}
          {feeds.map((feed) => (
            <div key={feed.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 md:gap-3 md:px-4">
              <span className="text-[var(--accent)]">
                {feed.kind === "rss" ? <Rss size={16} /> : <Globe size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13px] font-medium">{feed.title}</p>
                  <FolderInput
                    value={feed.folder}
                    onCommit={(next) => void setFeedFolder(feed.id, next)}
                  />
                </div>
                <p className="truncate text-[11px] text-[var(--muted)]">{feed.url}</p>
              </div>
              <span className="hidden text-[11px] text-[var(--muted)] sm:inline">
                {feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleDateString("zh-CN") : "未更新"}
              </span>
              {feed.kind === "rss" && isTauri() && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  title="站点有人机验证时，打开窗口完成验证并抓取"
                  onClick={() => void verifyFeed(feed.id)}
                >
                  <ShieldCheck size={13} />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                title="刷新此订阅源"
                onClick={() => void refreshOne(feed.id)}
              >
                <RefreshCw size={13} className={refreshingFeedId === feed.id ? "animate-spin" : ""} />
              </Button>
              <Button size="sm" variant="danger" onClick={() => void deleteFeed(feed.id)}>
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
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
