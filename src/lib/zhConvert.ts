import { Converter } from "opencc-js/t2cn";

/**
 * Display-layer Traditional -> Simplified conversion.
 * The original article text/HTML stays untouched in the database; callers
 * apply this only when rendering, so toggling the setting is instant and
 * reversible.
 */
const toSimplified = Converter({ from: "tw", to: "cn" });

/**
 * Normalize text for internal comparisons (clustering, anchors, labels).
 * Always simplified regardless of the display setting, so a Traditional
 * Chinese source can match the same story from a Simplified Chinese source.
 */
export function simplifyText(text: string | null | undefined): string {
  return text ? toSimplified(text) : "";
}

export function displayText(text: string | null | undefined, convert: boolean): string {
  if (!text) return "";
  return convert ? toSimplified(text) : text;
}

/**
 * Convert the visible text nodes of a sanitized HTML fragment while keeping
 * tags, attributes and structure intact (so links and images still work).
 */
export function displayHtml(html: string, convert: boolean): string {
  if (!html || !convert) return html;
  try {
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const value = node.nodeValue;
      if (value?.trim()) node.nodeValue = toSimplified(value);
    }
    return holder.innerHTML;
  } catch {
    return html;
  }
}
