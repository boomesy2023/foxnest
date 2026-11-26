import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Layers, Scissors, Trash2, ArrowRightLeft } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { Badge } from "../../shared/ui/Badge";
import { Button } from "../../shared/ui/Button";
import { cn } from "../../lib/cn";
import { displayText } from "../../lib/zhConvert";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { TopicWithArticles } from "../../types";

function TopicCard({ topic, allTopics }: { topic: TopicWithArticles; allTopics: TopicWithArticles[] }) {
  const expandedTopicId = useAppStore((s) => s.expandedTopicId);
  const toggleTopic = useAppStore((s) => s.toggleTopic);
  const splitArticle = useAppStore((s) => s.splitArticleFromTopic);
  const mergeTopic = useAppStore((s) => s.mergeTopicInto);
  const removeTopic = useAppStore((s) => s.removeTopic);
  const selectArticle = useAppStore((s) => s.selectArticle);
  const setPage = useAppStore((s) => s.setPage);
  const markTopicAsRead = useAppStore((s) => s.markTopicAsRead);
  const convert = useAppStore((s) => s.settings.convertTraditional);
  const [mergeMode, setMergeMode] = useState(false);

  const expanded = expandedTopicId === topic.id;
  const sources = useMemo(
    () => Array.from(new Set(topic.articles.map((a) => a.feedTitle))),
    [topic.articles],
  );

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--accent)]/40">
      <button
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        onClick={() => toggleTopic(topic.id)}
      >
        <span className="mt-0.5 text-[var(--muted)]">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13px] font-medium leading-snug">{displayText(topic.label, convert)}</h3>
            {topic.isManual === 1 && <Badge>手动</Badge>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
            <Badge className="bg-[var(--border)] text-[var(--muted)]">
              <Layers size={11} className="mr-1" /> {topic.articles.length} 篇报道
            </Badge>
            <span className="truncate">{displayText(sources.slice(0, 3).join("、"), convert)}{sources.length > 3 ? ` 等 ${sources.length} 个来源` : ""}</span>
            <span>·</span>
            <span>{formatDistanceToNow(topic.updatedAt, { addSuffix: true, locale: zhCN })}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] px-4 py-2">
          {topic.articles.map((article) => (
            <div
              key={article.id}
              onClick={() => {
                setPage("reader");
                selectArticle(article.id);
                void markTopicAsRead(topic.id, article.id);
              }}
              className="group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-[var(--accent-soft)]/60"
            >
              <div className="min-w-0 flex-1 cursor-pointer">
                <p className="truncate text-[13px]">{displayText(article.title, convert)}</p>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                  {displayText(article.feedTitle, convert)} · {formatDistanceToNow(article.publishedAt, { addSuffix: true, locale: zhCN })}
                </p>
              </div>
              <button
                title="从话题中移出（拆分）"
                onClick={(event) => {
                  event.stopPropagation();
                  void splitArticle(topic.id, article.id);
                }}
                className="rounded p-1 text-[var(--muted)] opacity-0 hover:bg-[var(--border)] group-hover:opacity-100"
              >
                <Scissors size={13} />
              </button>
            </div>
          ))}

          <div className="mt-2 flex items-center gap-2 border-t border-[var(--border)] pt-2">
            <Button size="sm" variant="ghost" onClick={() => setMergeMode((value) => !value)}>
              <ArrowRightLeft size={13} /> 合并话题
            </Button>
            <Button size="sm" variant="danger" onClick={() => void removeTopic(topic.id)}>
              <Trash2 size={13} /> 解散
            </Button>
          </div>
          {mergeMode && (
            <div className="mt-2 rounded-md border border-[var(--border)] p-2">
              <p className="mb-1.5 text-[11px] text-[var(--muted)]">把当前话题合并到：</p>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {allTopics
                  .filter((item) => item.id !== topic.id)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        void mergeTopic(topic.id, item.id);
                        setMergeMode(false);
                      }}
                      className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-[var(--accent-soft)]"
                    >
                      {displayText(item.label, convert)}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TopicView() {
  const topics = useAppStore((s) => s.topics);

  // Topic view is global: duplicates happen across feeds, while one feed
  // rarely reports the same story twice. Sidebar filters stay timeline-only.
  const discussionTopics = useMemo(
    () => topics.filter((topic) => topic.articles.length >= 2),
    [topics],
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className={cn("min-h-0 flex-1 space-y-2 overflow-y-auto p-3")}>
        {discussionTopics.length === 0 ? (
          <p className="px-4 py-10 text-center text-[var(--muted)]">
            还没有多篇文章报道的同一话题，单篇文章请到时间流阅读
          </p>
        ) : (
          discussionTopics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} allTopics={discussionTopics} />
          ))
        )}
      </div>
    </section>
  );
}
