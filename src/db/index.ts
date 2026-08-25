import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { getDatabasePath } from "../config";

export type Database = DatabaseSync;

export function getDb(dbPath?: string): DatabaseSync {
  const resolved = dbPath ?? getDatabasePath();
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const database = new DatabaseSync(resolved);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}

let singleton: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (!singleton) {
    singleton = getDb();
  }
  return singleton;
}

export function closeDb(): void {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}
