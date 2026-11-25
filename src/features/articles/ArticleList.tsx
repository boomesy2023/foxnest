import { useMemo } from "react";
import { Check, Headphones, Pause, Play, Star } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { cn } from "../../lib/cn";
import { displayText } from "../../lib/zhConvert";
import type { Article } from "../../types";
import { formatClock } from "../podcast/format";
import { usePlayerStore } from "../podcast/playerStore";
import { episodeFromArticle } from "../podcast/types";

function timeLabel(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const hour = 60 * 60 * 1000;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * 24 * hour) return `${Math.floor(diff / (24 * hour))} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

interface ArticleListProps {
  articles: Article[];
  title: string;
  emptyText?: string;
}

export function ArticleList({ articles, title, emptyText }: ArticleListProps) {
  const selectedArticleId = useAppStore((s) => s.selectedArticleId);
  const selectArticle = useAppStore((s) => s.selectArticle);
  const toggleRead = useAppStore((s) => s.toggleRead);
  const toggleStarred = useAppStore((s) => s.toggleStarred);
  const convert = useAppStore((s) => s.settings.convertTraditional);
  const playingId = usePlayerStore((s) => s.episode?.id);
  const paused = usePlayerStore((s) => s.audio.paused);

  const sorted = useMemo(
    () => [...articles].sort((a, b) => b.publishedAt - a.publishedAt),
    [articles],
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="text-xs text-[var(--muted)]">{sorted.length} 篇</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="px-4 py-10 text-center text-[var(--muted)]">
            {emptyText ?? "暂无文章，点击右上角刷新订阅源"}
          </p>
        ) : (
          sorted.map((article) => {
            const active = selectedArticleId === article.id;
            return (
              <div
                key={article.id}
                onClick={() => selectArticle(article.id)}
                className={cn(
                  "group relative cursor-pointer border-b border-[var(--border)] py-3 pl-4 pr-3 transition-colors",
                  active ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--accent-soft)]/50",
                )}
              >
                {/* Unread marker: a bright left rail, the strongest at-a-glance signal. */}
                {!article.isRead && (
                  <span className="absolute bottom-0 left-0 top-0 w-[3px] bg-[var(--accent)]" />
                )}
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className={cn(
                      "line-clamp-2 text-[13px] leading-snug",
                      article.isRead
                        ? "font-normal text-[var(--muted)]"
                        : "font-semibold text-[var(--text)]",
                    )}>
                      {article.isRead === 1 && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--muted)] align-middle opacity-50" />}
                      {displayText(article.title, convert)}
                    </h3>
                    <div className={cn(
                      "mt-1.5 flex items-center gap-2 text-[11px]",
                      article.isRead ? "text-[var(--muted)] opacity-70" : "text-[var(--muted)]",
                    )}>
                      <span className="truncate">{displayText(article.feedTitle, convert)}</span>
                      <span>·</span>
                      <span className="shrink-0">{timeLabel(article.publishedAt)}</span>
                      {article.audioUrl && (
                        <>
                          <span>·</span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-[var(--accent)]">
                            <Headphones size={11} />
                            {article.audioDurationSecs > 0 ? formatClock(article.audioDurationSecs) : "播客"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {article.audioUrl && (
                      <button
                        title={playingId === article.id ? (paused ? "继续播放" : "暂停") : "播放这一期"}
                        onClick={(event) => {
                          event.stopPropagation();
                          const player = usePlayerStore.getState();
                          if (player.episode?.id === article.id) player.toggle();
                          else player.playEpisode(episodeFromArticle(article));
                        }}
                        className="rounded p-1 text-[var(--accent)] hover:bg-[var(--border)]"
                      >
                        {playingId === article.id && !paused ? <Pause size={13} /> : <Play size={13} />}
                      </button>
                    )}
                    <button
                      title={article.isRead ? "标为未读" : "标为已读"}
                      onClick={(event) => {
                        event.stopPropagation();
                        void toggleRead(article.id);
                      }}
                      className="rounded p-1 hover:bg-[var(--border)]"
                    >
                      <Check size={13} className={article.isRead ? "text-[var(--accent)]" : ""} />
                    </button>
                    <button
                      title={article.isStarred ? "取消收藏" : "收藏"}
                      onClick={(event) => {
                        event.stopPropagation();
                        void toggleStarred(article.id);
                      }}
                      className="rounded p-1 hover:bg-[var(--border)]"
                    >
                      <Star size={13} className={article.isStarred ? "fill-amber-400 text-amber-500" : ""} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
