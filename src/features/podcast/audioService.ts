/**
 * Platform facade for audio playback. The public surface is intentionally
 * identical to the old single-element implementation so playerStore and every
 * UI consumer stay platform-agnostic.
 *
 * - Android: Media3 foreground service via the foxnest-audio plugin (survives
 *   backgrounding and exposes lock-screen controls).
 * - Desktop / browser / iOS: a single HTMLAudioElement outside React.
 */
import {
  isTauriAndroid,
  type AudioEngine,
  type AudioListener,
  type AudioState,
  type EpisodeSource,
} from "./audioEngine";
import { NativeAudioEngine } from "./nativeAudioEngine";
import { WebAudioEngine } from "./webAudioEngine";

export type { AudioState, EpisodeSource, AudioListener } from "./audioEngine";

class PlatformAudioEngine implements AudioEngine {
  private readonly web = new WebAudioEngine();
  private readonly native = new NativeAudioEngine();
  private readonly useNative = isTauriAndroid();

  constructor() {
    if (this.useNative) void this.native.attach();
  }

  private get engine(): AudioEngine {
    return this.useNative ? this.native : this.web;
  }

  subscribe(listener: AudioListener): () => void {
    return this.engine.subscribe(listener);
  }

  getState(): AudioState {
    return this.engine.getState();
  }

  begin(source: EpisodeSource, rate: number): void {
    this.engine.begin(source, rate);
  }

  resume(): void {
    this.engine.resume();
  }

  pause(): void {
    this.engine.pause();
  }

  seek(seconds: number): void {
    this.engine.seek(seconds);
  }

  skip(deltaSeconds: number): void {
    this.engine.skip(deltaSeconds);
  }

  setRate(rate: number): void {
    this.engine.setRate(rate);
  }

  stop(): void {
    this.engine.stop();
  }
}

export const audioService = new PlatformAudioEngine();
