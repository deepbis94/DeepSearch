import * as repo from "../repositories/research";
import { runResearchAgent } from "./agent/reactAgent";
import type { ResearchJob, StructuredReport } from "../types";

const running = new Set<string>();

async function executeJob(jobId: string, question: string): Promise<void> {
  if (running.has(jobId)) return;
  running.add(jobId);

  try {
    repo.updateJobStatus(jobId, "running");
    console.log(`[job ${jobId}] Starting research: ${question}`);

    const report: StructuredReport = await runResearchAgent(jobId, question);
    repo.createReport(jobId, report);
    repo.updateJobStatus(jobId, "completed");

    console.log(
      `[job ${jobId}] Completed — ${report.findings.length} findings, ${report.sources.length} sources`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[job ${jobId}] Failed:`, message);
    repo.updateJobStatus(jobId, "failed", message);
  } finally {
    running.delete(jobId);
  }
}

export function submitResearch(question: string): ResearchJob {
  const trimmed = question.trim();
  if (!trimmed) {
    throw new Error("Research question is required");
  }
  if (trimmed.length > 2000) {
    throw new Error("Research question must be 2000 characters or fewer");
  }

  const job = repo.createJob(trimmed);

  // Fire-and-forget background execution
  setImmediate(() => {
    void executeJob(job.id, job.question);
  });

  return job;
}

export function getResearchStatus(id: string): {
  job: ResearchJob;
  report: StructuredReport | null;
} | null {
  const job = repo.getJob(id);
  if (!job) return null;

  const record = repo.getReportByJobId(id);
  let report: StructuredReport | null = null;
  if (record) {
    try {
      report = JSON.parse(record.content) as StructuredReport;
    } catch {
      report = null;
    }
  }

  return { job, report };
}

export function listResearch(): Array<{
  job: ResearchJob;
  report: StructuredReport | null;
}> {
  return repo.listJobs().map((job) => {
    const record = repo.getReportByJobId(job.id);
    let report: StructuredReport | null = null;
    if (record) {
      try {
        report = JSON.parse(record.content) as StructuredReport;
      } catch {
        report = null;
      }
    }
    return { job, report };
  });
}

export function getResearchTrail(id: string) {
  return repo.getFullTrail(id);
}

/** Synchronous runner for the CLI test script */
export async function runResearchSync(
  question: string
): Promise<{ job: ResearchJob; report: StructuredReport }> {
  const job = repo.createJob(question.trim());
  repo.updateJobStatus(job.id, "running");

  try {
    const report = await runResearchAgent(job.id, job.question);
    repo.createReport(job.id, report);
    repo.updateJobStatus(job.id, "completed");
    return { job: repo.getJob(job.id)!, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    repo.updateJobStatus(job.id, "failed", message);
    throw err;
  }
}
