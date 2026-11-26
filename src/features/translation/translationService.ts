import { getTranslationApiKey, postJson } from "../../lib/db";
import type { Settings, TranslationEngine } from "../../types";
import { lookupDictionary } from "./dictionary";

export interface TranslationResult {
  text: string;
  source: TranslationEngine;
}

const SYSTEM_PROMPT = "Translate the user text into Simplified Chinese. Preserve names, numbers, meaning, and paragraph breaks. Return only the translation.";

function engineUrl(settings: Settings): string {
  const base = settings.translationBaseUrl.trim().replace(/\/+$/, "");
  if (!base) throw new Error("请先填写翻译引擎地址");
  if (settings.translationEngine === "ollama") return `${base}/api/chat`;
  return `${base}/chat/completions`;
}

function responseText(payload: unknown, engine: TranslationEngine): string {
  if (!payload || typeof payload !== "object") throw new Error("翻译引擎返回了无效数据");
  const data = payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
    message?: { content?: unknown };
  };
  const content = engine === "ollama"
    ? data.message?.content
    : data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("翻译引擎没有返回译文");
  }
  return content.trim();
}

async function requestTranslation(text: string, settings: Settings): Promise<TranslationResult> {
  const engine = settings.translationEngine;
  if (engine === "dictionary") throw new Error("全文翻译需要先配置翻译引擎");
  if (!settings.translationModel.trim()) throw new Error("请先填写翻译模型名称");

  const headers: Record<string, string> = {};
  if (engine === "openai") {
    const key = await getTranslationApiKey();
    if (key) headers.Authorization = `Bearer ${key}`;
  }
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: text },
  ];
  const body = engine === "ollama"
    ? { model: settings.translationModel.trim(), messages, stream: false, options: { temperature: 0.2 } }
    : { model: settings.translationModel.trim(), messages, temperature: 0.2, stream: false };

  const response = await postJson(engineUrl(settings), body, headers, 90);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`翻译请求失败（HTTP ${response.status}）`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    throw new Error("翻译引擎返回了无法解析的数据");
  }
  return { text: responseText(payload, engine), source: engine };
}

export async function translateSelection(text: string, settings: Settings): Promise<TranslationResult> {
  if (!settings.translationEnabled) throw new Error("翻译功能已关闭");
  const dictionary = await lookupDictionary(text);
  if (dictionary) {
    const phonetic = dictionary.phonetic ? `/${dictionary.phonetic}/` : "";
    return {
      text: [phonetic, dictionary.definition].filter(Boolean).join("\n"),
      source: "dictionary",
    };
  }
  return requestTranslation(text, settings);
}

function splitForTranslation(text: string, limit = 3500): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of text.split(/\n{2,}/)) {
    if (current && current.length + paragraph.length + 2 > limit) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length <= limit) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }
    for (const sentence of paragraph.match(/[^.!?。！？]+[.!?。！？]?|[^.!?。！？]+$/g) ?? [paragraph]) {
      if (current && current.length + sentence.length + 1 > limit) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function translateFullText(
  text: string,
  settings: Settings,
  onProgress?: (completed: number, total: number) => void,
): Promise<string> {
  if (!settings.translationEnabled) throw new Error("翻译功能已关闭");
  if (settings.translationEngine === "dictionary") {
    throw new Error("全文翻译需要先在设置中选择 OpenAI 兼容或 Ollama 引擎");
  }
  const chunks = splitForTranslation(text.trim());
  const translated: string[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const result = await requestTranslation(chunks[index], settings);
    translated.push(result.text);
    onProgress?.(index + 1, chunks.length);
  }
  return translated.join("\n\n");
}
