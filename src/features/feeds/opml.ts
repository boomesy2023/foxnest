import { getDb } from "../../lib/db";
import { makeId } from "../../lib/utils";
import type { Feed } from "../../types";
import { insertFeed, listFeeds } from "./feedRepo";

export interface OpmlFeed {
  title: string;
  url: string;
  folder: string | null;
}

function getAttr(el: Element, name: string): string {
  // Attribute names are case-sensitive in XML; accept common OPML variants.
  const direct = el.getAttribute(name);
  if (direct) return direct.trim();
  const lower = name.toLowerCase();
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.toLowerCase() === lower) return attr.value.trim();
  }
  return "";
}

/** Recursively walk <outline> elements, turning folder nodes into `folder`. */
function walkOutlines(nodes: Element[], folder: string | null): OpmlFeed[] {
  const result: OpmlFeed[] = [];
  for (const node of nodes) {
    if (node.localName.toLowerCase() !== "outline") continue;
    const xmlUrl = getAttr(node, "xmlUrl");
    const title = getAttr(node, "title") || getAttr(node, "text") || xmlUrl;
    if (xmlUrl) {
      result.push({ title, url: xmlUrl, folder });
    }
    const children = Array.from(node.children).filter(
      (child) => child.localName.toLowerCase() === "outline",
    );
    if (children.length > 0) {
      // A node with children and no xmlUrl is a folder; otherwise keep the
      // current folder (some exporters nest feeds inside a feed-like node).
      const childFolder = xmlUrl ? folder : getAttr(node, "title") || getAttr(node, "text") || folder;
      result.push(...walkOutlines(children, childFolder));
    }
  }
  return result;
}

/** Parse an OPML document string into feed descriptors. */
export function parseOpml(xml: string): OpmlFeed[] {
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "text/xml");
  const error = doc.getElementsByTagName("parsererror")[0];
  if (error) throw new Error(`OPML 解析失败：${error.textContent?.slice(0, 120)}`);
  const body = doc.getElementsByTagName("body")[0];
  if (!body) throw new Error("OPML 缺少 body 节点");
  const result = walkOutlines(Array.from(body.children), null);
  return result.filter((f) => /^https?:\/\//i.test(f.url));
}

export async function importOpml(xml: string): Promise<number> {
  const feeds = parseOpml(xml);
  const db = await getDb();
  const existingRows = await db.select<{ url: string }[]>("SELECT url FROM feeds");
  const existing = new Set(existingRows.map((row) => row.url));
  let imported = 0;
  for (const feed of feeds) {
    if (existing.has(feed.url)) continue;
    await insertFeed({
      id: makeId("f_"),
      title: feed.title,
      url: feed.url,
      kind: "rss",
      folder: feed.folder,
      apiBase: null,
      lastFetchedAt: null,
      lastError: null,
      createdAt: Date.now(),
    });
    existing.add(feed.url);
    imported += 1;
  }
  return imported;
}

export async function exportOpml(): Promise<string> {
  const feeds = await listFeeds();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0"><head><title>Foxnest subscriptions</title></head><body>',
  ];
  const byFolder = new Map<string, Feed[]>();
  feeds.forEach((feed) => {
    const folder = feed.folder ?? "";
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), feed]);
  });
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  for (const [folder, items] of byFolder) {
    if (folder) lines.push(`  <outline text="${escape(folder)}" title="${escape(folder)}">`);
    for (const feed of items) {
      lines.push(
        `    <outline type="rss" text="${escape(feed.title)}" title="${escape(feed.title)}" xmlUrl="${escape(feed.url)}" />`,
      );
    }
    if (folder) lines.push("  </outline>");
  }
  lines.push("</body></opml>");
  return lines.join("\n");
}
