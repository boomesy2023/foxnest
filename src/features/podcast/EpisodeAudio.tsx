import { Headphones, Play } from "lucide-react";
import { displayText } from "../../lib/zhConvert";
import { useAppStore } from "../../store/useAppStore";
import type { Article } from "../../types";
import { formatClock, formatSize } from "./format";
import { ProgressBar, RateButton, TransportButtons } from "./PlayerControls";
import { usePlayerStore } from "./playerStore";
import { episodeFromArticle } from "./types";

/** In-reader podcast card: start an episode, then control it in place. */
export function EpisodeAudio({ article }: { article: Article }) {
  const currentId = usePlayerStore((s) => s.episode?.id);
  const audio = usePlayerStore((s) => s.audio);
  const playEpisode = usePlayerStore((s) => s.playEpisode);
  const convert = useAppStore((s) => s.settings.convertTraditional);

  const active = currentId === article.id;
  const details = [
    article.audioDurationSecs > 0 ? formatClock(article.audioDurationSecs) : "时长未知",
    formatSize(article.audioSize),
    displayText(article.feedTitle, convert),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
          <Headphones size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">播客单集</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
            {details}
            {article.contentHtml ? " · 点击正文里的时间线可跳转" : ""}
          </p>
        </div>
        {active ? (
          <TransportButtons compact />
        ) : (
          <button
            type="button"
            onClick={() => playEpisode(episodeFromArticle(article))}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            <Play size={13} className="fill-current" /> 播放这一期
          </button>
        )}
      </div>

      {active && (
        <div className="mt-4 border-t border-[var(--border)] pt-3">
          <ProgressBar />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[var(--muted)]">
              {audio.buffering ? "正在缓冲…" : "后台播放：切换页面或文章都不会中断"}
            </span>
            <RateButton />
          </div>
          {audio.error && (
            <p className="mt-2 text-[11px] text-red-500">{audio.error}</p>
          )}
        </div>
      )}
    </section>
  );
}
