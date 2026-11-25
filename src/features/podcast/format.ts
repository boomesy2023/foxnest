/** Format seconds as M:SS or H:MM:SS for player clocks. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}

/** Parse a podcast chapter marker such as #t=00:05:18 or 05:18. */
export function parseChapterTime(raw: string): number | null {
  const cleaned = raw.replace(/^#?t=/i, "").trim();
  const parts = cleaned.split(":").map((part) => Number(part));
  if (parts.length === 0 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return null;
  }
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}

/** Human-readable file size for the enclosure badge. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}
