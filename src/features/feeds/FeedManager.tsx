import { useRef, useState } from "react";
import { Plus, RefreshCw, Trash2, Upload, Download, Rss, Globe, Folder, ShieldCheck } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "../../shared/ui/Button";
import { Input, Select } from "../../shared/ui/Input";
import { save } from "@tauri-apps/plugin-dialog";

export function FeedManager() {
  const feeds = useAppStore((s) => s.feeds);
  const busy = useAppStore((s) => s.busy);
  const addFeed = useAppStore((s) => s.addFeed);
  const setFeedFolder = useAppStore((s) => s.setFeedFolder);
  const deleteFeed = useAppStore((s) => s.deleteFeed);
  const refreshOne = useAppStore((s) => s.refreshOne);
  const verifyFeed = useAppStore((s) => s.verifyFeed);
  const importOpmlFile = useAppStore((s) => s.importFeedsFromOpml);
  const exportOpmlFile = useAppStore((s) => s.exportFeedsToOpml);

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");
  const [kind, setKind] = useState<"rss" | "miniflux" | "freshrss">("rss");
  const [apiBase, setApiBase] = useState("");
  const [token, setToken] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAdd() {
    if (!url.trim()) return;
    await addFeed({
      url: url.trim(),
      title: title.trim() || undefined,
      folder: folder.trim() || undefined,
      kind,
      apiBase: apiBase.trim() || undefined,
      apiToken: token.trim() || undefined,
    });
    setUrl("");
    setTitle("");
    setFolder("");
    setToken("");
    setShowAdd(false);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const xml = await file.text();
    await importOpmlFile(xml);
    event.target.value = "";
  }

  async function handleExport() {
    const path = await save({
      defaultPath: "foxnest-subscriptions.opml",
      filters: [{ name: "OPML", extensions: ["opml"] }],
    });
    if (!path) return;
    const xml = await exportOpmlFile();
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, xml);
  }

  const existingFolders = Array.from(
    new Set(feeds.map((f) => f.folder).filter((v): v is string => Boolean(v))),
  ).sort();

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <datalist id="feed-folders">
        {existingFolders.map((name) => <option key={name} value={name} />)}
      </datalist>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold">订阅源</h1>
            <p className="mt-1 text-[13px] text-[var(--muted)]">管理 RSS 订阅和自建服务连接</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> 导入 OPML
            </Button>
            <Button size="sm" onClick={() => void handleExport()}>
              <Download size={14} /> 导出
            </Button>
            <input ref={fileRef} type="file" accept=".opml,.xml" className="hidden" onChange={handleImport} />
            <Button size="sm" variant="primary" onClick={() => setShowAdd((v) => !v)}>
              <Plus size={14} /> 添加
            </Button>
          </div>
        </div>

        {showAdd && (
          <div className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs text-[var(--muted)]">
                类型
                <Select className="mt-1 w-full" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                  <option value="rss">RSS / Atom</option>
                  <option value="miniflux">Miniflux</option>
                  <option value="freshrss">FreshRSS</option>
                </Select>
              </label>
              <label className="col-span-2 text-xs text-[var(--muted)]">
                {kind === "rss" ? "Feed URL" : "订阅标识 / API 路径"}
                <Input className="mt-1" placeholder={kind === "rss" ? "https://example.com/feed.xml" : "https://... 或 feed id"} value={url} onChange={(e) => setUrl(e.target.value)} />
              </label>
              <label className="text-xs text-[var(--muted)]">
                名称（可选）
                <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="text-xs text-[var(--muted)]">
                分组（可选）
                <Input className="mt-1" placeholder="如：科技 / 设计" list="feed-folders" value={folder} onChange={(e) => setFolder(e.target.value)} />
              </label>
              {kind !== "rss" && (
                <>
                  <label className="text-xs text-[var(--muted)]">
                    服务地址
                    <Input className="mt-1" placeholder="https://reader.example.com" value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
                  </label>
                  <label className="col-span-2 text-xs text-[var(--muted)]">
                    API Token
                    <Input className="mt-1" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
                  </label>
                </>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>取消</Button>
              <Button size="sm" variant="primary" onClick={() => void handleAdd()}>保存</Button>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-2">
          {feeds.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--border)] py-12 text-center text-[var(--muted)]">
              还没有订阅源。点击「添加」或导入 OPML 开始。
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
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void refreshOne(feed.id)}>
                <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
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
