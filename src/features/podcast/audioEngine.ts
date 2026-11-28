export interface AudioState {
  currentTime: number;
  duration: number;
  paused: boolean;
  rate: number;
  buffering: boolean;
  ended: boolean;
  error: string | null;
}

export interface EpisodeSource {
  id: string;
  url: string;
  /** Used for the Android notification title; falls back to a generic label. */
  title?: string;
  /** Feed-provided duration hint, used before metadata arrives. */
  durationSecs: number;
}

export type AudioListener = (state: AudioState) => void;

/**
 * Both engines expose the same snapshot-based API so playerStore never needs
 * to know which one is active. Web runs an HTMLAudioElement; Android delegates
 * to the Media3 foreground service through the foxnest-audio plugin.
 */
export interface AudioEngine {
  subscribe(listener: AudioListener): () => void;
  getState(): AudioState;
  begin(source: EpisodeSource, rate: number): void;
  resume(): void;
  pause(): void;
  seek(seconds: number): void;
  skip(deltaSeconds: number): void;
  setRate(rate: number): void;
  stop(): void;
}

export const INITIAL_AUDIO_STATE: AudioState = {
  currentTime: 0,
  duration: 0,
  paused: true,
  rate: 1,
  buffering: false,
  ended: false,
  error: null,
};

export function isTauriAndroid(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as Window & { __TAURI_INTERNALS__?: unknown };
  return "__TAURI_INTERNALS__" in w && /Android/i.test(navigator.userAgent);
}
