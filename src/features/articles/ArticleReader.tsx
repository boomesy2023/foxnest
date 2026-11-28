import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Star, RefreshCw, FileText, Headphones, StickyNote, Languages, Share2, X } from "lucide-react";
import { openExternalUrl } from "../../lib/db";
import { shareArticle } from "../../lib/share";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "../../shared/ui/Button";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { displayHtml, displayText } from "../../lib/zhConvert";
import { stripHtml, truncate } from "../../lib/utils";
import { isPodcastEpisode, type Article } from "../../types";
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

export function ArticleReader({ queue, onBack }: { queue: Article[]; onBack?: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const convert = settings.convertTraditional;
  const selectedId = useAppStore((s) => s.selectedArticleId);
  const selectArticle = useAppStore((s) => s.selectArticle);
  const articles = useAppStore((s) => s.articles);
  const toggleRead = useAppStore((s) => s.toggleRead);
  const toggleStarred = useAppStore((s) => s.toggleStarred);
  const fullTextLoadingId = useAppStore((s) => s.fullTextLoadingId);
  const loadFullText = useAppStore((s) => s.loadFullText);
  const addNote = useAppStore((s) => s.addNote);
  const showToast = useAppStore((s) => s.showToast);
  const bodyRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<HTMLElement>(null);
  const translationCache = useRef(new Map<string, TranslationView>());
  const [selectionNote, setSelectionNote] = useState<{ quote: string; x: number; y: number } | null>(null);
  const [translationPopup, setTranslationPopup] = useState<TranslationPopup | null>(null);
  const [translationView, setTranslationView] = useState<TranslationView | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState("");
  const [translationError, setTranslationError] = useState("");
  const [fullTextOpen, setFullTextOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Set while the pointer is down on the selection toolbar so the selectionchange
  // caused by that tap does not dismiss the toolbar before its click fires.
  const toolbarPointerDown = useRef(false);

  const article = articles.find((item) => item.id === selectedId);
  const articleIndex = queue.findIndex((item) => item.id === selectedId);
  const previousArticle = articleIndex > 0 ? queue[articleIndex - 1] : undefined;
  const nextArticle = articleIndex >= 0 ? queue[articleIndex + 1] : undefined;
  const isFavorite = article?.isStarred === 1;
  const translationConfigKey = `${settings.translationEngine}:${settings.translationBaseUrl}:${settings.translationModel}`;

  useEffect(() => {
    setSelectionNote(null);
    setTranslationPopup(null);
    setTranslationError("");
    setFullTextOpen(false);
    setTranslationView(selectedId ? translationCache.current.get(selectedId) ?? null : null);
  }, [selectedId]);

  useEffect(() => {
    if (!fullTextOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullTextOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [fullTextOpen]);

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
    // The system selection menu (Android/iOS) shows above the selection, so on
    // touch devices the toolbar goes below it, clear of the selection handles.
    const top = rect.height > 0 ? rect.top : fallback.top;
    const bottom = rect.height > 0 ? rect.bottom : fallback.top + 24;
    const below = window.matchMedia("(pointer: coarse)").matches && bottom + 76 < window.innerHeight;
    const y = below ? bottom + 28 : Math.max(12, top - 42);
    setTranslationPopup(null);
    setSelectionNote({ quote, x, y });
  };

  // Touch selection (long-press + handles) fires selectionchange but not mouseup/keyup.
  useEffect(() => {
    let timer = 0;
    const onChange = () => {
      window.clearTimeout(timer);
      if (toolbarPointerDown.current) return;
      timer = window.setTimeout(handleBodySelection, 60);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
    };
  }, []);

  useEffect(() => {
    const reader = readerRef.current;
    if (!reader) return;
    reader.scrollTop = 0;
    window.getSelection()?.removeAllRanges();
  }, [article?.id]);

  const openArticle = (id: string) => {
    selectArticle(id);
  };

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
  const hasFullHtml = Boolean(article.fullContentHtml);
  const hasFull = hasFullHtml || Boolean(article.fullContent);
  const isEpisode = isPodcastEpisode(article);
  const hasTextFallback = !hasFullHtml && Boolean(article.fullContent);
  const excerpt = article.content || article.summary;
  const isExcerpt = !hasFull && !hasDigest && !hasTextFallback;
  const fullTextFailed = !hasFull && !hasTextFallback && article.fullContentFetchedAt > 0;

  const fetchFullText = async (openAfterFetch = false) => {
    translationCache.current.delete(article.id);
    setTranslationView(null);
    await loadFullText(article.id, true);
    if (!openAfterFetch || useAppStore.getState().selectedArticleId !== article.id) return;
    const updated = useAppStore.getState().articles.find((item) => item.id === article.id);
    if (updated?.fullContentHtml || updated?.fullContent) setFullTextOpen(true);
  };

  const handleShare = async () => {
    if (!article.link || sharing) return;
    const title = displayText(article.title, convert);
    const summary = truncate(stripHtml(article.summary || article.content).replace(/\s+/g, " ").trim(), 240);
    setSharing(true);
    try {
      const result = await shareArticle({ title, ...(summary ? { text: summary } : {}), url: article.link });
      if (result === "copied") showToast("文章链接已复制，可以粘贴分享");
      if (result === "failed") showToast("分享失败，请稍后重试");
    } finally {
      setSharing(false);
    }
  };

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
    void openExternalUrl(href);
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
      ref={readerRef}
      className="h-full overflow-y-auto px-4 py-5 md:px-6 md:py-7 xl:px-8"
      onScroll={() => {
        setSelectionNote(null);
        setTranslationPopup(null);
      }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:bg-[var(--accent-soft)] md:hidden"
        >
          <ArrowLeft size={15} /> 返回列表
        </button>
      )}
      <div className="fixed right-4 top-[calc(3.75rem+env(safe-area-inset-top))] z-40 md:right-8 md:top-[4.75rem]">
        <Button
          size="sm"
          variant={isFavorite ? "primary" : "outline"}
          className="shadow-md"
          onClick={() => void toggleStarred(article.id)}
        >
          <Star size={14} className={isFavorite ? "fill-amber-300 text-amber-300" : ""} />
          {isFavorite ? "已收藏" : "收藏"}
        </Button>
      </div>
      {selectionNote && (
        <div
          data-note-toolbar
          className="fixed z-40 inline-flex items-center gap-1 rounded-md bg-[var(--accent)] p-1 text-xs font-medium text-white shadow-lg"
          style={{ left: selectionNote.x, top: selectionNote.y }}
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={() => { toolbarPointerDown.current = true; }}
          onPointerUp={() => { toolbarPointerDown.current = false; }}
          onPointerCancel={() => { toolbarPointerDown.current = false; }}
          onPointerLeave={() => { toolbarPointerDown.current = false; }}
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
      <h1 className="text-xl font-semibold leading-tight md:text-2xl">
        {translationView?.title ?? displayText(article.title, convert)}
      </h1>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
        <span>{formatDistanceToNow(article.publishedAt, { addSuffix: true, locale: zhCN })}</span>
        <span>·</span>
        <span>{displayText(article.feedTitle, convert)}</span>
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
        <Button size="sm" variant="ghost" onClick={() => void toggleRead(article.id)}>
          {article.isRead ? "标为未读" : "标为已读"}
        </Button>
        {article.link && (
          <Button size="sm" disabled={sharing} onClick={() => void handleShare()} title="分享文章标题和链接">
            <Share2 size={14} />
            {sharing ? "分享中…" : "分享"}
          </Button>
        )}
        {(article.link || !isEpisode) && <span className="mx-1 hidden h-5 w-px bg-[var(--border)] sm:block" />}
        {article.link && (
          <Button size="sm" onClick={() => void openExternalUrl(article.link!)}>
            <ExternalLink size={14} /> 查看原文
          </Button>
        )}
        {article.link && !isEpisode && (
          hasFull ? (
            <>
              <Button size="sm" variant="primary" onClick={() => setFullTextOpen(true)}>
                <FileText size={14} /> 查看全文
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                disabled={loadingFull}
                onClick={() => void fetchFullText()}
                title="重新抓取全文"
              >
                <RefreshCw size={14} className={loadingFull ? "animate-spin" : ""} />
                {loadingFull ? "刷新中…" : "刷新全文"}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={loadingFull}
              onClick={() => void fetchFullText(true)}
              title="抓取网页全文并在弹窗中打开"
            >
              <RefreshCw size={14} className={loadingFull ? "animate-spin" : ""} />
              {loadingFull ? "获取全文中…" : fullTextFailed ? "重试全文" : "获取全文"}
            </Button>
          )
        )}
      </div>
      {isEpisode && <EpisodeAudio article={article} />}
      <div className="mt-7 border-t border-[var(--border)] pt-6">
        {translationError && <p className="mb-4 text-xs text-red-600">{translationError}</p>}
        {loadingFull && !hasFull && !hasDigest ? (
          <p className="text-[var(--muted)]">正在获取网页全文…</p>
        ) : (
          <>
            {loadingFull && hasDigest && <p className="mb-4 text-xs text-[var(--muted)]">正在获取网页全文…</p>}
            <div ref={bodyRef} onMouseUp={handleBodySelection} onKeyUp={handleBodySelection}>
              {renderBody()}
            </div>
          </>
        )}
        {(isExcerpt || fullTextFailed) && !loadingFull && !isEpisode && (
          <p className="mt-6 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
            {fullTextFailed
              ? "全文抓取失败，可点击「重试全文」再试一次。"
              : "当前为订阅源摘要。点「获取全文」在应用内阅读完整内容。"}
          </p>
        )}
        {(previousArticle || nextArticle) && (
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
            <Button
              size="sm"
              variant="ghost"
              disabled={!previousArticle}
              onClick={() => previousArticle && openArticle(previousArticle.id)}
            >
              <ChevronLeft size={14} /> 上一篇
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!nextArticle}
              onClick={() => nextArticle && openArticle(nextArticle.id)}
            >
              下一篇 <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </div>
      {fullTextOpen && hasFull && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3 md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="文章全文"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFullTextOpen(false);
          }}
        >
          <div className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-medium text-[var(--accent)]">全文</p>
                <h2 className="line-clamp-2 text-base font-semibold leading-snug">
                  {displayText(article.title, convert)}
                </h2>
              </div>
              <button
                type="button"
                autoFocus
                className="shrink-0 rounded-md p-2 text-[var(--muted)] hover:bg-[var(--accent-soft)]"
                onClick={() => setFullTextOpen(false)}
                aria-label="关闭全文"
              >
                <X size={18} />
              </button>
            </div>
            {loadingFull && (
              <p className="border-b border-[var(--border)] px-5 py-2 text-xs text-[var(--muted)]">正在刷新全文…</p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
              {hasFullHtml ? (
                <div
                  className="article-body"
                  onClick={handleBodyClick}
                  dangerouslySetInnerHTML={{ __html: displayHtml(article.fullContentHtml, convert) }}
                />
              ) : (
                <p className="whitespace-pre-wrap text-[14px] leading-[1.9]">
                  {displayText(article.fullContent, convert)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
