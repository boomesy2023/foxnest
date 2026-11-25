/**
 * Lightweight tokenizer for news headlines.
 *
 * Chinese has no word boundaries, so we use character bigrams as a proxy for
 * words. English is split on word boundaries. This is intentionally simple:
 * the entity extractor is exposed as a single function so it can be swapped
 * for a real NER / embedding model later without touching the clustering core.
 */

const STOP_WORDS = new Set([
  // Chinese function words
  "的", "了", "和", "在", "是", "我", "你", "他", "她", "它", "们", "这", "那", "有", "与", "及",
  "为", "被", "把", "从", "对", "向", "以", "将", "于", "上", "下", "中", "个", "不", "也", "就",
  "都", "而", "或", "一个", "一些", "表示", "称", "说", "报道", "消息", "最新", "今日", "昨天",
  "如何", "什么", "为什么", "可以", "已经", "正在", "将会", "可能", "进行", "通过", "对于",
  // English function words
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for", "from", "with",
  "by", "is", "are", "was", "were", "be", "been", "being", "this", "that", "these", "those",
  "it", "its", "as", "into", "about", "over", "after", "before", "between", "new", "news",
  "says", "said", "say", "reports", "report", "update", "how", "what", "why", "who", "can",
  "will", "has", "have", "had", "not", "more", "than", "their", "his", "her", "our", "your",
]);

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;

function isNoise(token: string): boolean {
  if (!token || STOP_WORDS.has(token.toLowerCase())) return true;
  if (/^\d+$/.test(token)) return true;
  if (!CJK.test(token) && token.length < 2) return true;
  return false;
}

/** Split a headline into comparable tokens. */
export function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];

  const tokens: string[] = [];
  const segments = normalized.split(" ").filter(Boolean);

  for (const segment of segments) {
    if (CJK.test(segment)) {
      // Split mixed CJK/ASCII runs, bigram the CJK parts.
      const runs = segment.match(/[\u4e00-\u9fff]+|[a-z0-9]+/g) ?? [segment];
      for (const run of runs) {
        if (CJK.test(run)) {
          if (run.length === 1) {
            if (!isNoise(run)) tokens.push(run);
          } else {
            for (let i = 0; i < run.length - 1; i += 1) {
              const bigram = run.slice(i, i + 2);
              if (!isNoise(bigram)) tokens.push(bigram);
            }
          }
        } else if (!isNoise(run)) {
          tokens.push(run);
        }
      }
    } else if (!isNoise(segment)) {
      tokens.push(segment);
    }
  }
  return tokens;
}

/**
 * Extract entity-like keywords as a stand-in for NER.
 * Keeps CJK bigrams that look like proper nouns and capitalized/long Latin words.
 */
export function extractEntities(text: string): string[] {
  const entities = new Set<string>();
  const originalRuns = text.match(/[\u4e00-\u9fff]{2,8}|[A-Z][A-Za-z0-9]{1,20}/g) ?? [];

  for (const run of originalRuns) {
    if (CJK.test(run)) {
      // Drop leading/trailing function characters, keep the core 2-6 chars.
      let core = run;
      const leading = /^(这些|那个|一个|这个|以及|还有|关于|对于|表示|宣布|发布|推出)/;
      const trailing = /(表示|宣布|发布|推出|方面|等|称|说|的|了|在)$/;
      core = core.replace(leading, "").replace(trailing, "");
      if (core.length >= 2 && core.length <= 6 && !STOP_WORDS.has(core)) {
        entities.add(core);
      }
      // Also add bigrams so partial overlaps still count.
      if (core.length > 2) {
        for (let i = 0; i < core.length - 1; i += 1) {
          const bigram = core.slice(i, i + 2);
          if (!STOP_WORDS.has(bigram)) entities.add(bigram);
        }
      }
    } else {
      const lower = run.toLowerCase();
      if (!STOP_WORDS.has(lower) && !/^\d+$/.test(lower)) {
        entities.add(lower);
      }
    }
  }
  return Array.from(entities);
}

/**
 * Generic words that appear in headlines constantly and carry little topic
 * signal. Anchors filtered by this list act as reliable "same story" signals.
 */
const GENERIC_WORDS = new Set([
  "发布", "推出", "上市", "公布", "宣布", "表示", "称", "报道", "消息", "预警", "信号",
  "新品", "系列", "正式", "紧急", "状态", "方面", "等", "最新", "今日", "昨天", "明年",
  "今年", "时间", "地点", "情况", "开始", "结束", "继续", "进行", "通过", "对于", "关于",
  "影响", "回应", "确认", "发现", "出现", "提高", "下降", "增长", "减少", "价格", "售价",
  "方法", "方式", "问题", "结果", "原因", "相关", "有关", "一个", "一些", "如何", "什么",
]);

/**
 * Words that appear in many unrelated headlines. They must never be treated
 * as "same story" anchors on their own.
 */
const COMMON_TOPIC_WORDS = new Set([
  ...GENERIC_WORDS,
  "系统", "软件", "应用", "服务", "功能", "版本", "用户", "设备", "项目", "公司",
  "手机", "电脑", "网络", "数据", "安全", "漏洞", "攻击", "服务器", "上传", "图片",
  "优惠", "特惠", "折扣", "免费", "限时", "订阅", "年费", "体验", "推荐", "发现",
  "频道", "使用", "支持", "提供", "搜索", "更新", "升级", "安装", "运行", "创建",
  "早报", "速递", "评测", "问号", "近期", "大家", "好评", "开源", "移植",
]);

/** Short proper nouns that are safe to recognize even inside longer phrases. */
const KNOWN_SHORT_ENTITIES = [
  "华为", "微软", "谷歌", "苹果", "荣耀", "小米", "三星", "英伟达",
  "亚马逊", "阿里", "腾讯", "百度", "巴黎", "迪卡侬", "米家",
];

/** Latin words too broad to identify a single story. */
const STRONG_LATIN_EXCLUDE = new Set([
  "app", "apps", "ai", "pc", "os", "pro", "plus", "max", "new", "news",
  "update", "uses", "used", "with", "from", "test", "free", "best",
]);

const LEADING_GENERIC = /^(全新|最新|限时|高危|近期|关于|对于|这个|那个|一个|这些|那些|以及|还有|表示|宣布|发布|推出|开始)/;
const TRAILING_GENERIC = /(表示|宣布|发布|推出|公布|方面|等|称|说|的|了|在|系列|系统|软件|应用|服务|功能|版本|用户|设备|项目|消息|报道|优惠|特惠|折扣|年费|订阅|问题|结果|原因|方法|方式|情况|相关|有关|体验|推荐|频道|使用|支持|提供|出现|进行|通过)$/;

function containsCommonPhrase(value: string): boolean {
  for (const word of COMMON_TOPIC_WORDS) {
    if (word.length >= 2 && value.includes(word)) return true;
  }
  return false;
}

/**
 * Extract high-value topic anchors: capitalized Latin names (brands, products,
 * people) and short CJK proper-noun-like fragments with generic words removed.
 * Shared anchors are a much stronger same-story signal than raw token overlap.
 */
export function extractAnchors(text: string): string[] {
  const anchors = new Set<string>();

  // Latin brand/product names: full words with at least one letter, including
  // mixed-case forms like iPhone, GPT-5, ChatGPT.
  for (const match of text.match(/[A-Za-z][A-Za-z0-9-]{1,20}/g) ?? []) {
    const lower = match.toLowerCase().replace(/^-+|-+$/g, "");
    if (
      lower.length >= 2 &&
      !STOP_WORDS.has(lower) &&
      !GENERIC_WORDS.has(lower) &&
      !/^\d+$/.test(lower)
    ) {
      anchors.add(lower);
    }
  }

  // CJK proper-noun-like fragments. We scan 2-6 char windows and keep any
  // window free of generic words, so 苹果 is found inside 苹果公布售价.
  const cjkRuns = text.match(/[\u4e00-\u9fff]{2,10}/g) ?? [];
  for (const run of cjkRuns) {
    for (let size = 4; size >= 2; size -= 1) {
      for (let i = 0; i + size <= run.length; i += 1) {
        const window = run.slice(i, i + size);
        if (STOP_WORDS.has(window) || GENERIC_WORDS.has(window)) continue;
        if (Array.from(window).some((char) => GENERIC_WORDS.has(char))) continue;
        anchors.add(window);
      }
    }
  }
  return Array.from(anchors);
}

/**
 * Extract conservative "same story" anchors from a headline only.
 *
 * Summaries are deliberately excluded: RSS summaries are full of boilerplate
 * that makes unrelated stories look similar. Whole Latin tokens and short
 * proper nouns are used instead of every CJK window, so one entity cannot
 * inflate the shared-anchor count several times over.
 */
export function extractStrongAnchors(text: string): string[] {
  const anchors = new Set<string>();

  for (const match of text.match(/[A-Za-z][A-Za-z0-9-]{2,20}/g) ?? []) {
    const token = match.toLowerCase().replace(/^-+|-+$/g, "");
    if (
      token.length >= 3 &&
      !STOP_WORDS.has(token) &&
      !GENERIC_WORDS.has(token) &&
      !STRONG_LATIN_EXCLUDE.has(token)
    ) {
      anchors.add(token);
    }
  }

  for (const run of text.match(/[\u4e00-\u9fff]{2,12}/g) ?? []) {
    for (const known of KNOWN_SHORT_ENTITIES) {
      if (run.includes(known)) anchors.add(known);
    }

    let core = run;
    let previous = "";
    while (core !== previous && core.length > 0) {
      previous = core;
      core = core.replace(LEADING_GENERIC, "").replace(TRAILING_GENERIC, "");
    }
    if (
      core.length >= 2 &&
      core.length <= 8 &&
      !COMMON_TOPIC_WORDS.has(core) &&
      !containsCommonPhrase(core)
    ) {
      anchors.add(core);
    }
  }

  return Array.from(anchors);
}

/** Count anchors shared by two articles. */
export function sharedAnchorCount(a: string[], b: string[]): number {
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase())).length;
}

/** Extract a short human-readable label for a topic from member titles. */
export function summarizeLabel(titles: string[]): string {
  if (titles.length === 0) return "未命名话题";
  const counts = new Map<string, number>();
  for (const title of titles) {
    for (const entity of extractEntities(title)) {
      counts.set(entity, (counts.get(entity) ?? 0) + 1);
    }
  }
  const ranked = Array.from(counts.entries())
    .filter(([entity]) => entity.length >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
  const top = ranked.slice(0, 3).map(([entity]) => entity);
  if (top.length === 0) return titles[0].slice(0, 24);
  return top.join(" · ");
}
