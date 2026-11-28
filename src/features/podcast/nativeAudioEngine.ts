import { addPluginListener, invoke, type PluginListener } from "@tauri-apps/api/core";
import {
  INITIAL_AUDIO_STATE,
  type AudioEngine,
  type AudioListener,
  type AudioState,
  type EpisodeSource,
} from "./audioEngine";

interface NativePlaybackState {
  id?: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  rate: number;
  buffering: boolean;
  ended: boolean;
  error?: string | null;
}

function toAudioState(native: NativePlaybackState): AudioState {
  return {
    currentTime: native.currentTime,
    duration: native.duration,
    paused: native.paused,
    rate: native.rate,
    buffering: native.buffering,
    ended: native.ended,
    error: native.error ?? null,
  };
}

/** Android engine backed by the Media3 foreground service. */
export class NativeAudioEngine implements AudioEngine {
  private listeners = new Set<AudioListener>();
  private state: AudioState = INITIAL_AUDIO_STATE;
  private activeId: string | null = null;
  private listener: PluginListener | null = null;

  async attach(): Promise<void> {
    if (this.listener) return;
    // Kotlin's Plugin.trigger("state", ...) is delivered through this channel.
    this.listener = await addPluginListener<NativePlaybackState>(
      "foxnest-audio",
      "state",
      (payload) => {
        // Ignore late events from the previously stopped episode.
        if (this.activeId === null && payload.id) return;
        this.emit(toAudioState(payload));
      },
    );
  }

  detach(): void {
    this.listener?.unregister();
    this.listener = null;
  }

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

  private call(command: string, payload: Record<string, unknown> = {}): void {
    void invoke(`plugin:foxnest-audio|${command}`, { payload }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({ paused: true, buffering: false, error: `后台播放失败：${message}` });
    });
  }

  begin(source: EpisodeSource, rate: number): void {
    this.activeId = source.id;
    this.emit({
      currentTime: 0,
      duration: source.durationSecs > 0 ? source.durationSecs : 0,
      paused: false,
      buffering: true,
      rate,
      ended: false,
      error: null,
    });
    this.call("play", {
      id: source.id,
      url: source.url,
      title: source.title ?? "播客播放",
      positionSecs: 0,
      durationSecs: source.durationSecs,
      rate,
    });
  }

  resume(): void {
    this.emit({ paused: false, error: null, ended: false });
    this.call("resume");
  }

  pause(): void {
    this.emit({ paused: true });
    this.call("pause");
  }

  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) return;
    this.emit({ currentTime: seconds, ended: false });
    this.call("seek", { seconds });
  }

  skip(deltaSeconds: number): void {
    this.seek(this.state.currentTime + deltaSeconds);
  }

  setRate(rate: number): void {
    this.emit({ rate });
    // ACL allows the Rust command name (snake_case); mobile.rs maps it to the
    // Kotlin method name (camelCase) internally.
    this.call("set_rate", { rate });
  }

  stop(): void {
    this.activeId = null;
    this.emit({ ...INITIAL_AUDIO_STATE, rate: this.state.rate });
    this.call("stop");
  }
}
