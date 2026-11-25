import type { Article } from "../../types";

/** The minimal article data the player needs, detached from the article store. */
export interface PlayerEpisode {
  id: string;
  title: string;
  feedTitle: string;
  audioUrl: string;
  /** Duration hint from itunes:duration; 0 until the audio metadata loads. */
  durationSecs: number;
}

/** Convert a persisted article into a playable episode descriptor. */
export function episodeFromArticle(article: Article): PlayerEpisode {
  return {
    id: article.id,
    title: article.title,
    feedTitle: article.feedTitle,
    audioUrl: article.audioUrl,
    durationSecs: article.audioDurationSecs,
  };
}
