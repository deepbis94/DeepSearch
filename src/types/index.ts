export type JobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export type RelevanceLevel = "high" | "medium" | "low";

export interface ResearchJob {
  id: string;
  question: string;
  status: JobStatus;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SearchQueryRecord {
  id: string;
  job_id: string;
  query: string;
  rationale: string | null;
  created_at: string;
}

export interface SearchResultRecord {
  id: string;
  query_id: string;
  url: string;
  title: string | null;
  snippet: string | null;
  fetched_content: string | null;
  created_at: string;
}

export interface FindingRecord {
  id: string;
  job_id: string;
  content: string;
  source_url: string;
  relevance_score: number;
  relevance_label: RelevanceLevel;
  created_at: string;
}

export interface ReportRecord {
  id: string;
  job_id: string;
  content: string;
  citations: string;
  created_at: string;
}

export interface ReportFinding {
  finding: string;
  source: string;
  relevance: RelevanceLevel;
}

export interface ResearchTrailSummary {
  queries_executed: number;
  pages_read: number;
  iterations: number;
}

export interface StructuredReport {
  question: string;
  summary: string;
  findings: ReportFinding[];
  sources: string[];
  research_trail: ResearchTrailSummary;
}

export interface TrailEvent {
  type: "search" | "fetch" | "finding" | "evaluate" | "synthesize";
  timestamp: string;
  data: Record<string, unknown>;
}

export interface FullResearchTrail {
  job_id: string;
  question: string;
  status: JobStatus;
  search_queries: Array<
    SearchQueryRecord & {
      results: SearchResultRecord[];
    }
  >;
  findings: FindingRecord[];
  iterations: number;
  events: TrailEvent[];
}

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface AgentContext {
  jobId: string;
  question: string;
  knownFindings: FindingRecord[];
  searchCount: number;
  pagesRead: number;
  iteration: number;
  maxIterations: number;
  trailEvents: TrailEvent[];
}
