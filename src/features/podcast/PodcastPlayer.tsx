import { Headphones, X } from "lucide-react";
import { displayText } from "../../lib/zhConvert";
import { useAppStore } from "../../store/useAppStore";
import { ProgressBar, RateButton, TransportButtons } from "./PlayerControls";
import { usePlayerStore } from "./playerStore";

/** Persistent bottom bar — rendered only while an episode is loaded. */
export function PodcastPlayer() {
  const episode = usePlayerStore((s) => s.episode);
  const audio = usePlayerStore((s) => s.audio);
  const stop = usePlayerStore((s) => s.stop);
  const convert = useAppStore((s) => s.settings.convertTraditional);

  if (!episode) return null;

  return (
    <footer className="flex h-[68px] shrink-0 items-center gap-2 border-t border-[var(--border)] bg-[var(--surface)] px-3 md:gap-3 md:px-4">
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] sm:flex">
        <Headphones size={17} />
      </span>
      <div className="min-w-0 flex-1 md:w-44 md:flex-none">
        <p className="truncate text-[12px] font-medium">{displayText(episode.title, convert)}</p>
        <p className={`mt-0.5 truncate text-[10px] ${audio.error ? "text-red-500" : "text-[var(--muted)]"}`}>
          {audio.error ?? displayText(episode.feedTitle, convert)}
        </p>
      </div>
      <TransportButtons compact />
      <ProgressBar className="hidden min-w-0 flex-1 md:flex" />
      <RateButton />
      <button
        type="button"
        title="关闭播放器并停止播放"
        onClick={stop}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--border)]"
      >
        <X size={15} />
      </button>
    </footer>
  );
}
