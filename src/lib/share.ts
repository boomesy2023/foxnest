import { invoke, isTauri } from "@tauri-apps/api/core";

export interface ArticleShareData {
  title: string;
  text?: string;
  url: string;
}

export type ArticleShareResult = "shared" | "copied" | "cancelled" | "failed";

export async function shareArticle({ title, text, url }: ArticleShareData): Promise<ArticleShareResult> {
  const shareText = [title, text?.trim(), url].filter(Boolean).join("\n\n");

  if (isTauri()) {
    try {
      await invoke("share_text", { text: shareText });
      return "shared";
    } catch {
      // Desktop falls through to Web Share or clipboard; mobile uses the native sheet.
    }
  }

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, ...(text?.trim() ? { text: text.trim() } : {}), url });
      return "shared";
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return "cancelled";
    }
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareText);
      return "copied";
    }
    return copyWithSelection(shareText) ? "copied" : "failed";
  } catch {
    return copyWithSelection(shareText) ? "copied" : "failed";
  }
}

function copyWithSelection(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}
