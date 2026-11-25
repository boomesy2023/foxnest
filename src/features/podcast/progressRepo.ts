import { getSetting, setSetting } from "../settings/settingsRepo";

/**
 * Per-episode playback positions, stored as one JSON blob in the settings
 * table so they live alongside the rest of the app data (and survive a
 * WebView storage reset). Writes are throttled by the player store.
 */
const PROGRESS_KEY = "podcastPlaybackProgress";

type ProgressMap = Record<string, number>;

let cache: ProgressMap | null = null;
let loading: Promise<ProgressMap> | null = null;

function parseMap(raw: string | null): ProgressMap {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const result: ProgressMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function loadMap(): Promise<ProgressMap> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = getSetting(PROGRESS_KEY)
      .then((raw) => {
        const map = parseMap(raw);
        cache = map;
        return map;
      })
      .catch(() => ({}) as ProgressMap)
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

export async function getPlaybackPosition(episodeId: string): Promise<number> {
  const map = await loadMap();
  return map[episodeId] ?? 0;
}

export async function savePlaybackPosition(episodeId: string, seconds: number): Promise<void> {
  if (!Number.isFinite(seconds)) return;
  const map = { ...(await loadMap()) };
  // A sub-second currentTime floors to 0; storing it would leave a useless
  // entry that parseMap discards on the next read anyway.
  const position = Math.floor(seconds);
  if (position <= 0) delete map[episodeId];
  else map[episodeId] = position;
  cache = map;
  await setSetting(PROGRESS_KEY, JSON.stringify(map));
}

export async function clearPlaybackPosition(episodeId: string): Promise<void> {
  await savePlaybackPosition(episodeId, 0);
}
