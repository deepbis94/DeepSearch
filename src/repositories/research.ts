import { randomUUID } from "crypto";
import { db } from "../db";
import type {
  FindingRecord,
  FullResearchTrail,
  JobStatus,
  RelevanceLevel,
  ReportRecord,
  ResearchJob,
  SearchQueryRecord,
  SearchResultRecord,
  StructuredReport,
  TrailEvent,
} from "../types";

function one<T>(row: unknown): T | undefined {
  return row as T | undefined;
}

function many<T>(rows: unknown): T[] {
  return rows as T[];
}

export function createJob(question: string): ResearchJob {
  const id = randomUUID();
  db()
    .prepare(
      `INSERT INTO research_jobs (id, question, status) VALUES (?, ?, 'pending')`
    )
    .run(id, question);

  return getJob(id)!;
}

export function getJob(id: string): ResearchJob | undefined {
  return one<ResearchJob>(
    db().prepare("SELECT * FROM research_jobs WHERE id = ?").get(id)
  );
}

export function listJobs(): ResearchJob[] {
  return many<ResearchJob>(
    db().prepare("SELECT * FROM research_jobs ORDER BY created_at DESC").all()
  );
}

export function updateJobStatus(
  id: string,
  status: JobStatus,
  errorMessage?: string | null
): void {
  if (status === "completed" || status === "failed") {
    db()
      .prepare(
        `UPDATE research_jobs
         SET status = ?, error_message = ?, completed_at = datetime('now')
         WHERE id = ?`
      )
      .run(status, errorMessage ?? null, id);
  } else {
    db()
      .prepare(
        `UPDATE research_jobs SET status = ?, error_message = ? WHERE id = ?`
      )
      .run(status, errorMessage ?? null, id);
  }
}

export function createSearchQuery(
  jobId: string,
  query: string,
  rationale?: string
): SearchQueryRecord {
  const id = randomUUID();
  db()
    .prepare(
      `INSERT INTO search_queries (id, job_id, query, rationale) VALUES (?, ?, ?, ?)`
    )
    .run(id, jobId, query, rationale ?? null);

  return one<SearchQueryRecord>(
    db().prepare("SELECT * FROM search_queries WHERE id = ?").get(id)
  )!;
}

export function createSearchResult(
  queryId: string,
  result: { url: string; title: string; snippet: string }
): SearchResultRecord {
  const id = randomUUID();
  db()
    .prepare(
      `INSERT INTO search_results (id, query_id, url, title, snippet)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, queryId, result.url, result.title, result.snippet);

  return one<SearchResultRecord>(
    db().prepare("SELECT * FROM search_results WHERE id = ?").get(id)
  )!;
}

export function updateSearchResultContent(
  id: string,
  content: string
): void {
  db()
    .prepare("UPDATE search_results SET fetched_content = ? WHERE id = ?")
    .run(content, id);
}

export function findSearchResultByUrl(
  jobId: string,
  url: string
): SearchResultRecord | undefined {
  return one<SearchResultRecord>(
    db()
      .prepare(
        `SELECT sr.* FROM search_results sr
         JOIN search_queries sq ON sq.id = sr.query_id
         WHERE sq.job_id = ? AND sr.url = ?
         LIMIT 1`
      )
      .get(jobId, url)
  );
}

function scoreToLabel(score: number): RelevanceLevel {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

export function createFinding(
  jobId: string,
  content: string,
  sourceUrl: string,
  relevance: number | RelevanceLevel
): FindingRecord {
  const id = randomUUID();
  let score: number;
  let label: RelevanceLevel;

  if (typeof relevance === "number") {
    score = Math.max(0, Math.min(1, relevance));
    label = scoreToLabel(score);
  } else {
    label = relevance;
    score = label === "high" ? 0.9 : label === "medium" ? 0.5 : 0.2;
  }

  db()
    .prepare(
      `INSERT INTO findings (id, job_id, content, source_url, relevance_score, relevance_label)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, jobId, content, sourceUrl, score, label);

  return one<FindingRecord>(
    db().prepare("SELECT * FROM findings WHERE id = ?").get(id)
  )!;
}

export function listFindings(jobId: string): FindingRecord[] {
  return many<FindingRecord>(
    db()
      .prepare(
        `SELECT * FROM findings WHERE job_id = ? ORDER BY relevance_score DESC, created_at ASC`
      )
      .all(jobId)
  );
}

export function createReport(
  jobId: string,
  report: StructuredReport
): ReportRecord {
  const id = randomUUID();
  const content = JSON.stringify(report);
  const citations = JSON.stringify(report.sources);

  db()
    .prepare(
      `INSERT INTO reports (id, job_id, content, citations) VALUES (?, ?, ?, ?)`
    )
    .run(id, jobId, content, citations);

  return one<ReportRecord>(
    db().prepare("SELECT * FROM reports WHERE id = ?").get(id)
  )!;
}

export function getReportByJobId(jobId: string): ReportRecord | undefined {
  return one<ReportRecord>(
    db().prepare("SELECT * FROM reports WHERE job_id = ?").get(jobId)
  );
}

export function addTrailEvent(
  jobId: string,
  type: TrailEvent["type"],
  data: Record<string, unknown>
): void {
  const id = randomUUID();
  db()
    .prepare(
      `INSERT INTO trail_events (id, job_id, event_type, event_data) VALUES (?, ?, ?, ?)`
    )
    .run(id, jobId, type, JSON.stringify(data));
}

export function listTrailEvents(jobId: string): TrailEvent[] {
  const rows = many<{
    event_type: TrailEvent["type"];
    event_data: string;
    created_at: string;
  }>(
    db()
      .prepare(
        `SELECT event_type, event_data, created_at FROM trail_events
         WHERE job_id = ? ORDER BY created_at ASC`
      )
      .all(jobId)
  );

  return rows.map((r) => ({
    type: r.event_type,
    timestamp: r.created_at,
    data: JSON.parse(r.event_data) as Record<string, unknown>,
  }));
}

export function getFullTrail(jobId: string): FullResearchTrail | null {
  const job = getJob(jobId);
  if (!job) return null;

  const queries = many<SearchQueryRecord>(
    db()
      .prepare(
        `SELECT * FROM search_queries WHERE job_id = ? ORDER BY created_at ASC`
      )
      .all(jobId)
  );

  const search_queries = queries.map((q) => {
    const results = many<SearchResultRecord>(
      db()
        .prepare(
          `SELECT * FROM search_results WHERE query_id = ? ORDER BY created_at ASC`
        )
        .all(q.id)
    );
    return { ...q, results };
  });

  const findings = listFindings(jobId);
  const events = listTrailEvents(jobId);
  const iterations = events.filter((e) => e.type === "evaluate").length;

  return {
    job_id: jobId,
    question: job.question,
    status: job.status,
    search_queries,
    findings,
    iterations,
    events,
  };
}

export function countQueries(jobId: string): number {
  const row = one<{ c: number }>(
    db()
      .prepare(`SELECT COUNT(*) as c FROM search_queries WHERE job_id = ?`)
      .get(jobId)
  );
  return row?.c ?? 0;
}

export function countFetchedPages(jobId: string): number {
  const row = one<{ c: number }>(
    db()
      .prepare(
        `SELECT COUNT(*) as c FROM search_results sr
         JOIN search_queries sq ON sq.id = sr.query_id
         WHERE sq.job_id = ? AND sr.fetched_content IS NOT NULL`
      )
      .get(jobId)
  );
  return row?.c ?? 0;
}
