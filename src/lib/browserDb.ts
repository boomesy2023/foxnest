import initSqlJs, { type Database as SqlDatabase, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { AppDatabase } from "./db";
import { readBrowserValue, writeBrowserValue } from "./browserStorage";

const SNAPSHOT_KEY = "sqlite-snapshot";
/** Coalesce bursts of writes (e.g. saveSettings' 13 separate statements). */
const FLUSH_DELAY_MS = 300;
let sqlPromise: Promise<SqlJsStatic> | null = null;

type SqlValue = string | number | Uint8Array | null;

function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => wasmUrl });
  }
  return sqlPromise;
}

function normalizeParams(params: unknown[] | undefined): SqlValue[] {
  return (params ?? []).map((value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" || typeof value === "number" || value instanceof Uint8Array) {
      return value;
    }
    if (typeof value === "boolean") return value ? 1 : 0;
    return String(value);
  });
}

class BrowserDatabase implements AppDatabase {
  private writeQueue: Promise<void> = Promise.resolve();
  private flushQueue: Promise<void> = Promise.resolve();
  private transactionActive = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly database: SqlDatabase) {
    if (typeof window !== "undefined") {
      // Best effort: an IndexedDB transaction started during pagehide may not
      // finish, but the debounce window is short enough to cover most exits.
      window.addEventListener("pagehide", () => {
        void this.flushNow();
      });
    }
  }

  async select<T>(query: string, params?: unknown[]): Promise<T> {
    const statement = this.database.prepare(query);
    try {
      statement.bind(normalizeParams(params));
      const rows: Array<Record<string, unknown>> = [];
      while (statement.step()) rows.push(statement.getAsObject());
      return rows as T;
    } finally {
      statement.free();
    }
  }

  execute(query: string, params?: unknown[]): Promise<unknown> {
    const operation = this.writeQueue.then(() => this.performExecute(query, params));
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushQueue = this.flushQueue
        .then(() => writeBrowserValue(SNAPSHOT_KEY, this.database.export()))
        .catch(() => undefined);
    }, FLUSH_DELAY_MS);
  }

  private async flushNow(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushQueue;
    await writeBrowserValue(SNAPSHOT_KEY, this.database.export());
  }

  private async performExecute(query: string, params?: unknown[]): Promise<unknown> {
    const values = normalizeParams(params);
    if (values.length > 0) {
      const statement = this.database.prepare(query);
      try {
        statement.bind(values);
        statement.step();
      } finally {
        statement.free();
      }
    } else {
      this.database.run(query);
    }
    if (/^\s*BEGIN\b/i.test(query)) {
      this.transactionActive = !/;\s*COMMIT\s*;?\s*$/i.test(query);
    } else if (/^\s*(?:COMMIT|END|ROLLBACK)\b/i.test(query)) {
      this.transactionActive = false;
    }
    if (!this.transactionActive) {
      this.scheduleFlush();
    }
    return { rowsAffected: this.database.getRowsModified() };
  }

  async close(): Promise<void> {
    await this.writeQueue;
    await this.flushNow();
    this.database.close();
  }
}

export async function openBrowserDatabase(): Promise<AppDatabase> {
  const SQL = await loadSql();
  const snapshot = await readBrowserValue<Uint8Array>(SNAPSHOT_KEY);
  return new BrowserDatabase(snapshot ? new SQL.Database(snapshot) : new SQL.Database());
}
