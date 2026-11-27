import initSqlJs, { type Database as SqlDatabase, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { AppDatabase } from "./db";
import { readBrowserValue, writeBrowserValue } from "./browserStorage";

const SNAPSHOT_KEY = "sqlite-snapshot";
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
  constructor(private readonly database: SqlDatabase) {}

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

  async execute(query: string, params?: unknown[]): Promise<unknown> {
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
    await writeBrowserValue(SNAPSHOT_KEY, this.database.export());
    return { rowsAffected: this.database.getRowsModified() };
  }

  async close(): Promise<void> {
    this.database.close();
  }
}

export async function openBrowserDatabase(): Promise<AppDatabase> {
  const SQL = await loadSql();
  const snapshot = await readBrowserValue<Uint8Array>(SNAPSHOT_KEY);
  return new BrowserDatabase(snapshot ? new SQL.Database(snapshot) : new SQL.Database());
}
