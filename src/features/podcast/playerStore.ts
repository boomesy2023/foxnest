import { create } from "zustand";
import { audioService, type AudioState } from "./audioService";
import {
  clearPlaybackPosition,
  getPlaybackPosition,
  savePlaybackPosition,
} from "./progressRepo";
import type { PlayerEpisode } from "./types";

/** Playback speeds cycled by the speed button. */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

interface PlayerStore {
  episode: PlayerEpisode | null;
  audio: AudioState;
  rate: number;
  error: string | null;
  playEpisode: (episode: PlayerEpisode) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  skip: (seconds: number) => void;
  setRate: (rate: number) => void;
  cycleRate: () => void;
  stop: () => void;
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  episode: null,
  audio: audioService.getState(),
  rate: 1,
  error: null,

  playEpisode: (episode) => {
    const previous = get().episode;
    if (previous && previous.id !== episode.id && get().audio.currentTime > 0) {
      void savePlaybackPosition(previous.id, get().audio.currentTime);
    }
    // Set the episode before the engine emits, so progress snapshots are
    // attributed to the correct id.
    set({ episode, error: null });
    audioService.begin(
      { id: episode.id, url: episode.audioUrl, durationSecs: episode.durationSecs },
      get().rate,
    );
    if (!previous || previous.id !== episode.id) {
      void getPlaybackPosition(episode.id).then((seconds) => {
        if (get().episode?.id === episode.id && seconds > 0) audioService.seek(seconds);
      });
    }
  },

  toggle: () => {
    const { episode, audio } = get();
    if (!episode) return;
    if (audio.paused || audio.ended) {
      if (audio.ended) audioService.seek(0);
      audioService.resume();
    } else {
      audioService.pause();
    }
  },

  seek: (seconds) => audioService.seek(seconds),
  skip: (seconds) => audioService.skip(seconds),

  setRate: (rate) => {
    audioService.setRate(rate);
    set({ rate });
  },

  cycleRate: () => {
    const current = get().rate;
    const index = PLAYBACK_RATES.findIndex((value) => value === current);
    const next = PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length] ?? 1;
    get().setRate(next);
  },

  stop: () => {
    const { episode, audio } = get();
    if (episode && audio.currentTime > 0) {
      void savePlaybackPosition(episode.id, audio.currentTime);
    }
    set({ episode: null });
    audioService.stop();
  },
}));

// Bridge engine snapshots into the store, and persist the resume position at
// most once every five seconds (timeupdate fires several times per second).
let lastPersistAt = 0;
audioService.subscribe((state) => {
  const episode = usePlayerStore.getState().episode;
  usePlayerStore.setState({ audio: state, error: episode ? state.error : null });
  if (!episode) return;

  if (state.ended) {
    lastPersistAt = 0;
    void clearPlaybackPosition(episode.id);
    return;
  }
  if (state.currentTime <= 0) return;
  const now = Date.now();
  if (now - lastPersistAt >= 5000) {
    lastPersistAt = now;
    void savePlaybackPosition(episode.id, state.currentTime);
  }
});
