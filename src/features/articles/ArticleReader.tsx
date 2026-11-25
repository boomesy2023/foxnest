import type { MouseEvent } from "react";
import { ExternalLink, Star, RefreshCw, FileText, Headphones } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "../../shared/ui/Button";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { displayHtml, displayText } from "../../lib/zhConvert";
import { isPodcastEpisode } from "../../types";
import { EpisodeAudio } from "../podcast/EpisodeAudio";
import { formatClock, parseChapterTime } from "../podcast/format";
import { usePlayerStore } from "../podcast/playerStore";
import { episodeFromArticle } from "../podcast/types";

export function ArticleReader() {
  const convert = useAppStore((s) => s.settings.convertTraditional);
  const selectedId = useAppStore((s) => s.selectedArticleId);
  const articles = useAppStore((s) => s.articles);
  const toggleRead = useAppStore((s) => s.toggleRead);
  const toggleStarred = useAppStore((s) => s.toggleStarred);
  const fullTextLoadingId = useAppStore((s) => s.fullTextLoadingId);
  const loadFullText = useAppStore((s) => s.loadFullText);

  const article = articles.find((item) => item.id === selectedId);

  if (!article) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--muted)]">
        <div className="text-center">
          <p className="text-4xl font-light text-[var(--border)]">F</p>
          <p className="mt-3">选择一篇文章开始阅读</p>
        </div>
      </div>
    );
  }

  const loadingFull = fullTextLoadingId === article.id;
  const hasDigest = Boolean(article.contentHtml);
  const hasFull = Boolean(article.fullContentHtml);
  const isEpisode = isPodcastEpisode(article);
  const hasTextFallback = !hasFull && Boolean(article.fullContent);
  const excerpt = article.content || article.summary;
  const isExcerpt = !hasFull && !hasDigest && !hasTextFallback;

  // Links inside sanitized HTML open in the system browser, never in the
  // WebView. Podcast chapter markers (#t=...) instead seek the player.
  const handleBodyClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    const hashIndex = href.indexOf("#");
    const marker = hashIndex >= 0 ? href.slice(hashIndex + 1) : "";
    if (isEpisode && /^t=/i.test(marker)) {
      const seconds = parseChapterTime(marker);
      if (seconds !== null) {
        event.preventDefault();
        const player = usePlayerStore.getState();
        if (player.episode?.id !== article.id) {
          player.playEpisode(episodeFromArticle(article));
        } else if (player.audio.paused || player.audio.ended) {
          player.toggle();
        }
        player.seek(seconds);
        return;
      }
    }
    event.preventDefault();
    void openUrl(href);
  };

  const renderBody = () => {
    if (hasDigest) {
      return (
        <div
          className="digest-body"
          onClick={handleBodyClick}
          dangerouslySetInnerHTML={{ __html: displayHtml(article.contentHtml, convert) }}
        />
      );
    }
    if (hasFull) {
      return (
        <div
          className="article-body"
          onClick={handleBodyClick}
          dangerouslySetInnerHTML={{ __html: displayHtml(article.fullContentHtml, convert) }}
        />
      );
    }
    if (hasTextFallback) {
      return <p className="whitespace-pre-wrap text-[14px] leading-[1.9]">{displayText(article.fullContent, convert)}</p>;
    }
    if (excerpt) {
      return <p className="whitespace-pre-wrap text-[14px] leading-[1.9] text-[var(--muted)]">{displayText(excerpt, convert)}</p>;
    }
    return (
      <p className="text-[var(--muted)]">
        {isEpisode ? "这一期没有提供文字介绍，直接播放即可。" : "该订阅源未提供正文，点击「获取全文」尝试从原文抓取。"}
      </p>
    );
  };

  return (
    <article className="h-full overflow-y-auto px-8 py-7">
      <div className="mb-5 flex items-center gap-2 text-xs text-[var(--muted)]">
        <span>{displayText(article.feedTitle, convert)}</span>
        <span>·</span>
        <span>{formatDistanceToNow(article.publishedAt, { addSuffix: true, locale: zhCN })}</span>
        {article.author && (
          <>
            <span>·</span>
            <span>{displayText(article.author, convert)}</span>
          </>
        )}
        {(hasDigest || hasFull || isEpisode) && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-[var(--accent)]">
              {isEpisode ? <Headphones size={11} /> : <FileText size={11} />}
              {isEpisode ? "播客" : hasDigest ? "日报" : "全文"}
            </span>
          </>
        )}
        {isEpisode && article.audioDurationSecs > 0 && (
          <>
            <span>·</span>
            <span className="tabular-nums">{formatClock(article.audioDurationSecs)}</span>
          </>
        )}
      </div>
      <h1 className="text-2xl font-semibold leading-tight">{displayText(article.title, convert)}</h1>
      <div className="mt-5 flex flex-wrap gap-2">
        {article.link && (
          <Button size="sm" onClick={() => void openUrl(article.link!)}>
            <ExternalLink size={14} /> 查看原文
          </Button>
        )}
        {article.link && !hasDigest && !isEpisode && (
          <Button
            size="sm"
            variant={hasFull ? "ghost" : "primary"}
            disabled={loadingFull}
            onClick={() => void loadFullText(article.id, true)}
            title={hasFull ? "重新抓取全文" : "抓取网页全文"}
          >
            <RefreshCw size={14} className={loadingFull ? "animate-spin" : ""} />
            {loadingFull ? "获取全文中…" : hasFull ? "刷新全文" : "获取全文"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void toggleStarred(article.id)}>
          <Star size={14} className={article.isStarred ? "fill-amber-400 text-amber-500" : ""} />
          {article.isStarred ? "已收藏" : "收藏"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void toggleRead(article.id)}>
          {article.isRead ? "标为未读" : "标为已读"}
        </Button>
      </div>
      {isEpisode && <EpisodeAudio article={article} />}
      <div className="mt-7 border-t border-[var(--border)] pt-6">
        {loadingFull && !hasFull && !hasDigest ? (
          <p className="text-[var(--muted)]">正在获取网页全文…</p>
        ) : (
          renderBody()
        )}
        {isExcerpt && !loadingFull && !isEpisode && (
          <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            当前为订阅源摘要。{article.fullContentFetchedAt > 0 ? "全文抓取失败，可点击「刷新全文」重试。" : "点「获取全文」在应用内阅读完整内容。"}
          </p>
        )}
      </div>
    </article>
  );
}
