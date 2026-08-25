import fs from "fs";
import path from "path";
import { getDb, closeDb } from "./index";

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function ensureMigrationsTable(database: ReturnType<typeof getDb>): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getApplied(database: ReturnType<typeof getDb>): Set<string> {
  const rows = database
    .prepare("SELECT name FROM schema_migrations ORDER BY id")
    .all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

export function runMigrations(dbPath?: string): void {
  const database = getDb(dbPath);
  ensureMigrationsTable(database);

  const applied = getApplied(database);
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip  ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    database.exec("BEGIN");
    try {
      database.exec(sql);
      database
        .prepare("INSERT INTO schema_migrations (name) VALUES (?)")
        .run(file);
      database.exec("COMMIT");
      console.log(`apply ${file}`);
    } catch (err) {
      database.exec("ROLLBACK");
      throw err;
    }
  }

  console.log("Migrations complete.");
}

if (require.main === module) {
  try {
    runMigrations();
    closeDb();
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}
