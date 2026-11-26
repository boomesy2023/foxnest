import { useEffect, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import type { AggregationStrength, TranslationEngine } from "../../types";
import { cn } from "../../lib/cn";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import { getTranslationApiKey } from "../../lib/db";

const AUTO_REFRESH_OPTIONS = [
  { value: 0, label: "关闭" },
  { value: 15, label: "15 分钟" },
  { value: 30, label: "30 分钟" },
  { value: 60, label: "60 分钟" },
];

const STRENGTHS: Array<{ value: AggregationStrength; label: string; hint: string }> = [
  { value: "conservative", label: "保守", hint: "只聚Title几乎相同的报道，误聚最少" },
  { value: "normal", label: "标准", hint: "语义相近且实体重合即归为同一话题" },
  { value: "aggressive", label: "激进", hint: "放宽相似度，聚合更深入但可能误聚" },
];

const TRANSLATION_ENGINES: Array<{ value: TranslationEngine; label: string; hint: string }> = [
  { value: "dictionary", label: "离线词典", hint: "内置 3 万词条，不联网" },
  { value: "openai", label: "OpenAI 兼容", hint: "自定义接口与模型" },
  { value: "ollama", label: "Ollama", hint: "本地模型服务" },
];

export function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const setStrength = useAppStore((s) => s.setStrength);
  const setTimeWindow = useAppStore((s) => s.setTimeWindow);
  const setTheme = useAppStore((s) => s.setTheme);
  const setConvertTraditional = useAppStore((s) => s.setConvertTraditional);
  const setAutoRefreshMinutes = useAppStore((s) => s.setAutoRefreshMinutes);
  const setTranslationEnabled = useAppStore((s) => s.setTranslationEnabled);
  const setTranslationEngine = useAppStore((s) => s.setTranslationEngine);
  const updateTranslationConfig = useAppStore((s) => s.updateTranslationConfig);
  const saveTranslationKey = useAppStore((s) => s.saveTranslationKey);
  const clearTranslationKey = useAppStore((s) => s.clearTranslationKey);
  const busy = useAppStore((s) => s.busy);
  const [baseUrl, setBaseUrl] = useState(settings.translationBaseUrl);
  const [model, setModel] = useState(settings.translationModel);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [savingTranslation, setSavingTranslation] = useState(false);
  const [translationError, setTranslationError] = useState("");

  useEffect(() => {
    setBaseUrl(settings.translationBaseUrl);
    setModel(settings.translationModel);
  }, [settings.translationBaseUrl, settings.translationModel]);

  useEffect(() => {
    let cancelled = false;
    void getTranslationApiKey()
      .then((key) => {
        if (!cancelled) setHasApiKey(Boolean(key));
      })
      .catch(() => {
        if (!cancelled) setHasApiKey(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveTranslationConfig = async () => {
    setSavingTranslation(true);
    setTranslationError("");
    try {
      await updateTranslationConfig({ baseUrl, model });
      if (apiKey.trim()) {
        await saveTranslationKey(apiKey);
        setApiKey("");
        setHasApiKey(true);
      }
    } catch (error) {
      setTranslationError(error instanceof Error ? error.message : "翻译配置保存失败");
    } finally {
      setSavingTranslation(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-8 py-7">
      <div className="mx-auto max-w-2xl">
        <section>
          <h2 className="text-sm font-medium">聚合强度</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">决定两篇文章被归为同一话题的严格程度</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {STRENGTHS.map((option) => (
              <button
                key={option.value}
                disabled={busy}
                onClick={() => void setStrength(option.value)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors disabled:opacity-50",
                  settings.aggregationStrength === option.value
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/50",
                )}
              >
                <p className="text-[13px] font-medium">{option.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{option.hint}</p>
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-md bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--muted)]">
            当前相似度阈值 {settings.similarityThreshold} · 实体重合阈值 {settings.entityOverlapThreshold}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="text-sm font-medium">时间窗</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">超过此时间跨度的报道不会被归入同一话题</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[12, 24, 48, 72, 168].map((hours) => (
              <button
                key={hours}
                disabled={busy}
                onClick={() => void setTimeWindow(hours)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs disabled:opacity-50",
                  settings.timeWindowHours === hours
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] hover:border-[var(--accent)]/50",
                )}
              >
                {hours} 小时
              </button>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="text-sm font-medium">自动刷新</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">开启后，软件启动时会刷新一次，并按所选周期自动更新订阅源</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {AUTO_REFRESH_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => void setAutoRefreshMinutes(option.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs",
                  settings.autoRefreshMinutes === option.value
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] hover:border-[var(--accent)]/50",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">翻译</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">划词优先查询内置词典，未收录时使用已配置的引擎</p>
            </div>
            <button
              onClick={() => void setTranslationEnabled(!settings.translationEnabled)}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                settings.translationEnabled ? "bg-[var(--accent)]" : "bg-[var(--border)]",
              )}
              aria-label={settings.translationEnabled ? "关闭翻译" : "开启翻译"}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                  settings.translationEnabled ? "translate-x-[18px]" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {TRANSLATION_ENGINES.map((option) => (
              <button
                key={option.value}
                onClick={() => void setTranslationEngine(option.value)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  settings.translationEngine === option.value
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/50",
                )}
              >
                <p className="text-[13px] font-medium">{option.label}</p>
                <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{option.hint}</p>
              </button>
            ))}
          </div>
          {settings.translationEngine !== "dictionary" && (
            <div className="mt-3 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
              <label className="block text-xs text-[var(--muted)]">
                引擎地址
                <Input
                  className="mt-1"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder={settings.translationEngine === "ollama" ? "http://127.0.0.1:11434" : "https://api.example.com/v1"}
                />
              </label>
              <label className="block text-xs text-[var(--muted)]">
                模型名称
                <Input
                  className="mt-1"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder={settings.translationEngine === "ollama" ? "qwen3:8b" : "your-model-name"}
                />
              </label>
              {settings.translationEngine === "openai" && (
                <label className="block text-xs text-[var(--muted)]">
                  API Key{hasApiKey ? "（已保存）" : ""}
                  <Input
                    className="mt-1"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={hasApiKey ? "留空则保留现有密钥" : "可选，保存在系统钥匙串"}
                    autoComplete="off"
                  />
                </label>
              )}
              {translationError && <p className="text-xs text-red-600">{translationError}</p>}
              <div className="flex items-center justify-end gap-2">
                {hasApiKey && settings.translationEngine === "openai" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void clearTranslationKey().then(() => setHasApiKey(false));
                    }}
                  >
                    清除密钥
                  </Button>
                )}
                <Button size="sm" variant="primary" disabled={savingTranslation} onClick={() => void saveTranslationConfig()}>
                  {savingTranslation ? "保存中…" : "保存配置"}
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="mt-7">
          <h2 className="text-sm font-medium">外观</h2>
          <div className="mt-3 flex gap-2">
            {(["light", "dark", "system"] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => void setTheme(theme)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs",
                  settings.theme === theme
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] hover:border-[var(--accent)]/50",
                )}
              >
                {theme === "light" ? "浅色" : theme === "dark" ? "深色" : "跟随系统"}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="text-sm font-medium">文字显示</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">仅影响显示，订阅源的原始内容保持不变</p>
          <button
            onClick={() => void setConvertTraditional(!settings.convertTraditional)}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:border-[var(--accent)]/50"
          >
            <span>
              <span className="block text-[13px] font-medium">繁体转简体</span>
              <span className="mt-0.5 block text-[11px] text-[var(--muted)]">自动把繁体中文文章转为简体显示</span>
            </span>
            <span
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                settings.convertTraditional ? "bg-[var(--accent)]" : "bg-[var(--border)]",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                  settings.convertTraditional ? "translate-x-[18px]" : "translate-x-0.5",
                )}
              />
            </span>
          </button>
        </section>

        <section className="mt-7 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="text-sm font-medium">关于归集算法</h2>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            当前版本使用规则版归集：精确 URL 去重 + 标题分词相似度 + 命名实体重合 + 时间窗约束。
            所有计算在本地完成，不上传任何数据。后续可接入 Embedding 模型提升语义理解能力。
          </p>
        </section>
      </div>
    </div>
  );
}
