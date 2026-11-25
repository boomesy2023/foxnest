import { getDb } from "../../lib/db";
import { DEFAULT_SETTINGS, type Settings } from "../../types";

interface SettingRow {
  key: string;
  value: string;
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDb();
  const rows = await db.select<SettingRow[]>("SELECT key, value FROM settings");
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const num = (key: string, fallback: number) => {
    const raw = map.get(key);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const strength = (map.get("aggregationStrength") ??
    DEFAULT_SETTINGS.aggregationStrength) as Settings["aggregationStrength"];

  return {
    aggregationStrength: ["conservative", "normal", "aggressive"].includes(strength)
      ? strength
      : DEFAULT_SETTINGS.aggregationStrength,
    timeWindowHours: num("timeWindowHours", DEFAULT_SETTINGS.timeWindowHours),
    similarityThreshold: num("similarityThreshold", DEFAULT_SETTINGS.similarityThreshold),
    entityOverlapThreshold: num("entityOverlapThreshold", DEFAULT_SETTINGS.entityOverlapThreshold),
    theme: (map.get("theme") ?? DEFAULT_SETTINGS.theme) as Settings["theme"],
    convertTraditional: map.get("convertTraditional") !== "false",
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDb();
  const pairs = Object.entries(settings).map(([key, value]) => [key, String(value)]);
  for (const [key, value] of pairs) {
    await db.execute(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }
}

/** Read a raw settings key (used for internal migration markers). */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = ?",
    [key],
  );
  return rows[0]?.value ?? null;
}

/** Write a raw settings key (used for internal migration markers). */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}
