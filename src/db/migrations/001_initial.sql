-- Migration 001: Initial schema

CREATE TABLE IF NOT EXISTS research_jobs (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS search_queries (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  rationale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_search_queries_job_id ON search_queries(job_id);

CREATE TABLE IF NOT EXISTS search_results (
  id TEXT PRIMARY KEY,
  query_id TEXT NOT NULL REFERENCES search_queries(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  fetched_content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_search_results_query_id ON search_results(query_id);
CREATE INDEX IF NOT EXISTS idx_search_results_url ON search_results(url);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source_url TEXT NOT NULL,
  relevance_score REAL NOT NULL DEFAULT 0.5,
  relevance_label TEXT NOT NULL DEFAULT 'medium'
    CHECK (relevance_label IN ('high', 'medium', 'low')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_findings_job_id ON findings(job_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES research_jobs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  citations TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_job_id ON reports(job_id);

CREATE TABLE IF NOT EXISTS trail_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trail_events_job_id ON trail_events(job_id);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
