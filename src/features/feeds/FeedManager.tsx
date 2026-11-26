import { useState } from "react";
import { RefreshCw, Trash2, Rss, Globe, Folder, ShieldCheck } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "../../shared/ui/Button";

export function FeedManager() {
  const feeds = useAppStore((s) => s.feeds);
  const busy = useAppStore((s) => s.busy);
  const refreshingFeedId = useAppStore((s) => s.refreshingFeedId);
  const setFeedFolder = useAppStore((s) => s.setFeedFolder);
  const deleteFeed = useAppStore((s) => s.deleteFeed);
  const refreshOne = useAppStore((s) => s.refreshOne);
  const verifyFeed = useAppStore((s) => s.verifyFeed);

  const existingFolders = Array.from(
    new Set(feeds.map((f) => f.folder).filter((v): v is string => Boolean(v))),
  ).sort();

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <datalist id="feed-folders">
        {existingFolders.map((name) => <option key={name} value={name} />)}
      </datalist>
      <div className="mx-auto max-w-3xl">
        <div className="space-y-2">
          {feeds.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--border)] py-12 text-center text-[var(--muted)]">
              还没有订阅源。
            </p>
          )}
          {feeds.map((feed) => (
            <div key={feed.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
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
              <span className="text-[11px] text-[var(--muted)]">
                {feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleDateString("zh-CN") : "未更新"}
              </span>
              {feed.kind === "rss" && (
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
