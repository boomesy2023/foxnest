import { Loader2, Pause, Play, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "../../lib/cn";
import { formatClock } from "./format";
import { usePlayerStore } from "./playerStore";

/** -15s / play-pause / +15s. Shared by the reader card and the bottom bar. */
export function TransportButtons({ compact = false }: { compact?: boolean }) {
  const audio = usePlayerStore((s) => s.audio);
  const toggle = usePlayerStore((s) => s.toggle);
  const skip = usePlayerStore((s) => s.skip);
  const iconSize = compact ? 13 : 15;

  const isPlaying = !audio.paused && !audio.ended;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        title="后退 15 秒"
        onClick={() => skip(-15)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
      >
        <RotateCcw size={iconSize} />
      </button>
      <button
        type="button"
        title={isPlaying ? "暂停" : "播放"}
        onClick={toggle}
        className={cn(
          "flex items-center justify-center rounded-full bg-[var(--accent)] text-white transition-transform hover:scale-105",
          compact ? "h-9 w-9" : "h-10 w-10",
        )}
      >
        {audio.buffering ? (
          <Loader2 size={16} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={16} className="fill-current" />
        ) : (
          <Play size={16} className="ml-0.5 fill-current" />
        )}
      </button>
      <button
        type="button"
        title="快进 15 秒"
        onClick={() => skip(15)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
      >
        <RotateCw size={iconSize} />
      </button>
    </div>
  );
}

/** Seekable progress rail with elapsed / total clocks. */
export function ProgressBar({ className }: { className?: string }) {
  const audio = usePlayerStore((s) => s.audio);
  const seek = usePlayerStore((s) => s.seek);
  const duration = audio.duration > 0 ? audio.duration : 0;
  const max = Math.max(duration, 1);
  const percent = duration > 0 ? Math.min(100, (audio.currentTime / duration) * 100) : 0;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-[var(--muted)]">
        {formatClock(audio.currentTime)}
      </span>
      <input
        type="range"
        className="podcast-range min-w-0 flex-1"
        min={0}
        max={max}
        step={1}
        value={Math.min(audio.currentTime, max)}
        disabled={duration <= 0}
        onChange={(event) => seek(Number(event.currentTarget.value))}
        style={{
          background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, var(--border) ${percent}%, var(--border) 100%)`,
        }}
        aria-label="播放进度"
      />
      <span className="w-11 shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
        {formatClock(duration)}
      </span>
    </div>
  );
}

/** Cycle through the supported playback speeds. */
export function RateButton() {
  const rate = usePlayerStore((s) => s.rate);
  const cycleRate = usePlayerStore((s) => s.cycleRate);
  return (
    <button
      type="button"
      title="切换播放速度"
      onClick={cycleRate}
      className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] tabular-nums text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {rate}x
    </button>
  );
}
