/**
 * A single HTMLAudioElement for the whole app. Keeping the element outside
 * React means switching pages (or re-rendering the reader) never interrupts
 * playback. The engine owns no UI state; the Zustand player store subscribes
 * to its snapshots.
 */

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
  /** Feed-provided duration hint, used before metadata arrives. */
  durationSecs: number;
}

export type AudioListener = (state: AudioState) => void;

const INITIAL_STATE: AudioState = {
  currentTime: 0,
  duration: 0,
  paused: true,
  rate: 1,
  buffering: false,
  ended: false,
  error: null,
};

class AudioEngine {
  private element: HTMLAudioElement | null = null;
  private listeners = new Set<AudioListener>();
  private state: AudioState = INITIAL_STATE;
  private activeId: string | null = null;
  private pendingSeek = 0;

  subscribe(listener: AudioListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): AudioState {
    return this.state;
  }

  private emit(patch: Partial<AudioState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private ensureElement(): HTMLAudioElement {
    if (this.element) return this.element;
    const el = new Audio();
    el.preload = "metadata";

    el.addEventListener("loadedmetadata", () => {
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      if (this.pendingSeek > 0) {
        const target = duration > 0
          ? Math.min(this.pendingSeek, Math.max(0, duration - 1))
          : this.pendingSeek;
        try {
          el.currentTime = target;
        } catch {
          // Some WebViews refuse seeks until the first frames are buffered.
        }
        this.pendingSeek = 0;
      }
      this.emit({ duration, buffering: false, currentTime: el.currentTime });
    });
    el.addEventListener("durationchange", () => {
      if (Number.isFinite(el.duration) && el.duration > 0) this.emit({ duration: el.duration });
    });
    el.addEventListener("timeupdate", () => this.emit({ currentTime: el.currentTime }));
    el.addEventListener("play", () => this.emit({ paused: false, error: null, ended: false }));
    el.addEventListener("playing", () => this.emit({ paused: false, buffering: false }));
    el.addEventListener("pause", () => this.emit({ paused: true }));
    el.addEventListener("waiting", () => this.emit({ buffering: true }));
    el.addEventListener("ended", () => this.emit({ paused: true, ended: true }));
    el.addEventListener("error", () => {
      this.emit({
        paused: true,
        buffering: false,
        error: "音频加载失败，请检查网络或稍后重试",
      });
    });

    this.element = el;
    return el;
  }

  private startPlayback(el: HTMLAudioElement): void {
    // Must run synchronously inside the click handler: WKWebView may reject
    // autoplay once the user-gesture context has been lost to an await.
    void el.play().catch((err: unknown) => {
      const message = err instanceof Error && err.message
        ? err.message
        : "播放被系统拦截，请再点一次播放";
      this.emit({ paused: true, buffering: false, error: message });
    });
  }

  /** Start or resume an episode. Call directly from a user gesture. */
  begin(source: EpisodeSource, rate: number): void {
    const el = this.ensureElement();
    const sameEpisode = this.activeId === source.id && el.src === source.url;
    if (!sameEpisode) {
      this.activeId = source.id;
      this.pendingSeek = 0;
      el.src = source.url;
      el.load();
      this.emit({
        currentTime: 0,
        duration: source.durationSecs > 0 ? source.durationSecs : 0,
        buffering: true,
      });
    }
    el.playbackRate = rate;
    this.emit({ rate, error: null, ended: false });
    this.startPlayback(el);
  }

  resume(): void {
    if (!this.element) return;
    this.emit({ error: null, ended: false });
    this.startPlayback(this.element);
  }

  pause(): void {
    this.element?.pause();
  }

  seek(seconds: number): void {
    const el = this.element;
    if (!el || !Number.isFinite(seconds)) return;
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
    const target = Math.max(0, duration > 0 ? Math.min(seconds, duration) : seconds);
    if (el.readyState >= 1) {
      try {
        el.currentTime = target;
      } catch {
        this.pendingSeek = target;
      }
    } else {
      this.pendingSeek = target;
    }
    this.emit({ currentTime: target, ended: false });
  }

  skip(deltaSeconds: number): void {
    this.seek(this.state.currentTime + deltaSeconds);
  }

  setRate(rate: number): void {
    if (this.element) this.element.playbackRate = rate;
    this.emit({ rate });
  }

  stop(): void {
    const el = this.element;
    this.activeId = null;
    this.pendingSeek = 0;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    this.emit({ ...INITIAL_STATE, rate: this.state.rate });
  }
}

export const audioService = new AudioEngine();
