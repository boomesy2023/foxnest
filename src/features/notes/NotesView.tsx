import { BookOpen, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useAppStore } from "../../store/useAppStore";
import { Button } from "../../shared/ui/Button";
import { displayText } from "../../lib/zhConvert";

export function NotesView() {
  const notes = useAppStore((s) => s.notes);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const openNote = useAppStore((s) => s.openNote);
  const convert = useAppStore((s) => s.settings.convertTraditional);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-7">
        {notes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-14 text-center text-[var(--muted)]">
            <p className="text-sm">还没有笔记</p>
            <p className="mt-2 text-xs">打开一篇文章，划选想保留的内容试试。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <article key={note.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <blockquote className="whitespace-pre-wrap border-l-2 border-[var(--accent)] pl-3 text-[14px] leading-[1.8]">
                  {displayText(note.quote, convert)}
                </blockquote>
                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted)]">
                  <span className="max-w-full truncate font-medium text-[var(--text)]">
                    {displayText(note.articleTitle, convert)}
                  </span>
                  <span>·</span>
                  <span className="max-w-[240px] truncate">{displayText(note.feedTitle, convert)}</span>
                  <span>·</span>
                  <span>{formatDistanceToNow(note.createdAt, { addSuffix: true, locale: zhCN })}</span>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void openNote(note.id)}>
                    <BookOpen size={14} /> 打开原文
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    aria-label="删除笔记"
                    title="删除笔记"
                    onClick={() => void deleteNote(note.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
