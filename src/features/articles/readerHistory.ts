import { useEffect, useRef } from "react";

const ARTICLE_STATE_KEY = "foxnestArticleId";

function pushedArticleId(): string | null {
  const state = window.history.state as Record<string, unknown> | null;
  const id = state?.[ARTICLE_STATE_KEY];
  return typeof id === "string" ? id : null;
}

/**
 * Mirror the selected article into browser history so the platform back
 * gesture (Android button, iOS edge swipe, browser back) closes the reader
 * instead of leaving the app. Switching articles replaces the current entry
 * rather than stacking them, so one back always returns to the list.
 */
export function useArticleHistory(selectedId: string | null, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const previousId = useRef<string | null>(null);

  useEffect(() => {
    if (selectedId === previousId.current) return;
    if (selectedId && !previousId.current) {
      window.history.pushState({ [ARTICLE_STATE_KEY]: selectedId }, "");
    } else if (selectedId && previousId.current) {
      window.history.replaceState({ [ARTICLE_STATE_KEY]: selectedId }, "");
    }
    previousId.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const handlePopState = () => {
      if (pushedArticleId() === null) closeRef.current();
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
}

/** In-app back button: take the history path when available for consistency. */
export function leaveArticle(onClose: () => void): void {
  if (pushedArticleId() !== null) {
    window.history.back();
  } else {
    onClose();
  }
}
