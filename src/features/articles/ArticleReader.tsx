import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ExternalLink, Star, RefreshCw, FileText, Headphones, StickyNote, Languages, X } from "lucide-react";
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
import { translateFullText, translateSelection, type TranslationResult } from "../translation/translationService";

interface TranslationPopup {
  quote: string;
  x: number;
  y: number;
  loading: boolean;
  result?: TranslationResult;
  error?: string;
}

interface TranslationView {
  title: string;
  body: string;
}

export function ArticleReader() {
  const settings = useAppStore((s) => s.settings);
  const convert = settings.convertTraditional;
  const selectedId = useAppStore((s) => s.selectedArticleId);
  const articles = useAppStore((s) => s.articles);
  const toggleRead = useAppStore((s) => s.toggleRead);
  const toggleStarred = useAppStore((s) => s.toggleStarred);
  const fullTextLoadingId = useAppStore((s) => s.fullTextLoadingId);
  const loadFullText = useAppStore((s) => s.loadFullText);
  const addNote = useAppStore((s) => s.addNote);
  const bodyRef = useRef<HTMLDivElement>(null);
  const translationCache = useRef(new Map<string, TranslationView>());
  const [selectionNote, setSelectionNote] = useState<{ quote: string; x: number; y: number } | null>(null);
  const [translationPopup, setTranslationPopup] = useState<TranslationPopup | null>(null);
  const [translationView, setTranslationView] = useState<TranslationView | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState("");
  const [translationError, setTranslationError] = useState("");

  const article = articles.find((item) => item.id === selectedId);
  const translationConfigKey = `${settings.translationEngine}:${settings.translationBaseUrl}:${settings.translationModel}`;

  useEffect(() => {
    setSelectionNote(null);
    setTranslationPopup(null);
    setTranslationError("");
    setTranslationView(selectedId ? translationCache.current.get(selectedId) ?? null : null);
  }, [selectedId]);

  useEffect(() => {
    translationCache.current.clear();
    setTranslationView(null);
  }, [translationConfigKey]);

  useEffect(() => {
    if (!settings.translationEnabled) {
      setTranslationPopup(null);
      setTranslationView(null);
    }
  }, [settings.translationEnabled]);

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

  const handleBodySelection = () => {
    const selection = window.getSelection();
    const body = bodyRef.current;
    if (!selection || !body || selection.rangeCount === 0 || selection.isCollapsed) {
      setSelectionNote(null);
      setTranslationPopup(null);
      return;
    }
    const range = selection.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) {
      setSelectionNote(null);
      setTranslationPopup(null);
      return;
    }
    const quote = selection.toString().replace(/\s+/g, " ").trim();
    if (!quote) {
      setSelectionNote(null);
      setTranslationPopup(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const fallback = body.getBoundingClientRect();
    const x = Math.min(
      Math.max(12, rect.left + rect.width / 2 - 80),
      Math.max(12, window.innerWidth - 190),
    );
    const y = Math.max(12, (rect.height > 0 ? rect.top : fallback.top) - 42);
    setTranslationPopup(null);
    setSelectionNote({ quote, x, y });
  };

  const saveSelectionNote = () => {
    if (!selectionNote) return;
    const quote = selectionNote.quote;
    setSelectionNote(null);
    setTranslationPopup(null);
    window.getSelection()?.removeAllRanges();
    void addNote(article.id, quote);
  };

  const runSelectionTranslation = async () => {
    if (!selectionNote) return;
    const { quote, x, y } = selectionNote;
    setTranslationPopup({ quote, x, y, loading: true });
    try {
      const result = await translateSelection(quote, settings);
      if (useAppStore.getState().selectedArticleId !== article.id) return;
      setTranslationPopup({ quote, x, y, loading: false, result });
    } catch (error) {
      if (useAppStore.getState().selectedArticleId !== article.id) return;
      setTranslationPopup({
        quote,
        x,
        y,
        loading: false,
        error: error instanceof Error ? error.message : "翻译失败",
      });
    }
  };

  const closeTranslationPopup = () => {
    setTranslationPopup(null);
    setSelectionNote(null);
    window.getSelection()?.removeAllRanges();
  };

  const toggleFullTranslation = async () => {
    if (!article) return;
    if (translationView) {
      setTranslationView(null);
      return;
    }
    const cached = translationCache.current.get(article.id);
    if (cached) {
      setTranslationView(cached);
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    setTranslating(true);
    setTranslationError("");
    setTranslationProgress("0 / 1");
    try {
      const translatedTitle = await translateFullText(displayText(article.title, convert), settings);
      if (useAppStore.getState().selectedArticleId !== article.id) return;
      const translatedBody = await translateFullText(body.innerText.trim(), settings, (completed, total) => {
        setTranslationProgress(`${completed} / ${total}`);
      });
      if (useAppStore.getState().selectedArticleId !== article.id) return;
      const view = { title: translatedTitle, body: translatedBody };
      translationCache.current.set(article.id, view);
      setTranslationView(view);
    } catch (error) {
      if (useAppStore.getState().selectedArticleId !== article.id) return;
      setTranslationError(error instanceof Error ? error.message : "全文翻译失败");
    } finally {
      setTranslating(false);
      setTranslationProgress("");
    }
  };

  const renderBody = () => {
    if (translationView) {
      return <div className="article-body whitespace-pre-wrap">{translationView.body}</div>;
    }
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
    <article
      className="h-full overflow-y-auto px-8 py-7"
      onScroll={() => {
        setSelectionNote(null);
        setTranslationPopup(null);
      }}
    >
      {selectionNote && (
        <div
          data-note-toolbar
          className="fixed z-40 inline-flex items-center gap-1 rounded-md bg-[var(--accent)] p-1 text-xs font-medium text-white shadow-lg"
          style={{ left: selectionNote.x, top: selectionNote.y }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {settings.translationEnabled && (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 hover:bg-black/10"
                onClick={() => void runSelectionTranslation()}
                title={`翻译：${selectionNote.quote}`}
              >
                <Languages size={14} /> 翻译
              </button>
              <span className="h-4 w-px bg-white/30" />
            </>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 hover:bg-black/10"
            onClick={saveSelectionNote}
            title={`保存：${selectionNote.quote}`}
          >
            <StickyNote size={14} /> 存为笔记
          </button>
        </div>
      )}
      {translationPopup && (
        <div
          className="fixed z-50 w-[360px] max-w-[calc(100vw-24px)] rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl"
          style={{
            left: Math.min(Math.max(12, translationPopup.x), Math.max(12, window.innerWidth - 384)),
            top: Math.min(Math.max(12, translationPopup.y + 40), Math.max(12, window.innerHeight - 260)),
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="line-clamp-2 text-xs text-[var(--muted)]">{translationPopup.quote}</p>
            <button
              type="button"
              className="rounded p-1 text-[var(--muted)] hover:bg-[var(--border)]"
              onClick={closeTranslationPopup}
              aria-label="关闭翻译"
            >
              <X size={14} />
            </button>
          </div>
          {translationPopup.loading ? (
            <p className="mt-3 text-sm text-[var(--muted)]">翻译中…</p>
          ) : translationPopup.error ? (
            <p className="mt-3 text-sm text-red-600">{translationPopup.error}</p>
          ) : (
            <>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{translationPopup.result?.text}</p>
              <p className="mt-3 text-[11px] text-[var(--muted)]">
                {translationPopup.result?.source === "dictionary"
                  ? "内置离线词典"
                  : translationPopup.result?.source === "ollama"
                    ? "Ollama"
                    : "OpenAI 兼容引擎"}
              </p>
            </>
          )}
        </div>
      )}
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
      <h1 className="text-2xl font-semibold leading-tight">
        {translationView?.title ?? displayText(article.title, convert)}
      </h1>
      <div className="mt-5 flex flex-wrap gap-2">
        {settings.translationEnabled && (
          <Button
            size="sm"
            variant={translationView ? "primary" : "ghost"}
            disabled={translating || (!translationView && settings.translationEngine === "dictionary")}
            onClick={() => void toggleFullTranslation()}
            title={!translationView && settings.translationEngine === "dictionary" ? "全文翻译需要先配置翻译引擎" : undefined}
          >
            <Languages size={14} />
            {translating ? `翻译中 ${translationProgress}` : translationView ? "显示原文" : "全文翻译"}
          </Button>
        )}
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
        {translationError && <p className="mb-4 text-xs text-red-600">{translationError}</p>}
        {loadingFull && !hasFull && !hasDigest ? (
          <p className="text-[var(--muted)]">正在获取网页全文…</p>
        ) : (
          <div ref={bodyRef} onMouseUp={handleBodySelection} onKeyUp={handleBodySelection}>
            {renderBody()}
          </div>
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
