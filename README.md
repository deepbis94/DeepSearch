# DeepSearch

AI research agent that takes a question, searches the web across multiple sources, reads pages, synthesizes findings, and produces a cited report.

Built with **Node.js**, **Express**, **TypeScript**, **OpenAI (gpt-4o) function calling**, and **Tavily / Serper** web search. The agent follows a **ReAct** loop: Plan → Search → Read → Evaluate → Repeat → Synthesize (max 10 searches per job).

## Architecture

```
src/
├── index.ts                 # Server entry
├── app.ts                   # Express app
├── config.ts                # Env validation (zod)
├── types/                   # Shared types
├── db/
│   ├── index.ts             # SQLite connection
│   ├── migrate.ts           # Migration runner
│   └── migrations/          # SQL migrations
├── repositories/            # Persistence layer
├── routes/research.ts       # REST API
└── services/
    ├── researchService.ts   # Job orchestration
    ├── fetchPage.ts         # URL fetch + Readability
    ├── search/              # Tavily / Serper
    └── agent/
        ├── reactAgent.ts    # ReAct loop + OpenAI tools
        ├── tools.ts         # 5 tool implementations
        └── prompts.ts
scripts/
└── test-research.ts         # End-to-end research runner
```

### Agent tools (OpenAI function calling)

| Tool | Purpose |
|------|---------|
| `search_web` | Web search via Tavily or Serper |
| `fetch_page` | Fetch URL + Mozilla Readability extraction |
| `extract_key_points` | Summarize findings from page text |
| `generate_search_queries` | Create gap-filling queries |
| `save_finding` | Persist a cited finding for the report |

## Prerequisites

- Node.js 22.5+ (uses built-in `node:sqlite`)
- OpenAI API key
- Tavily API key **or** Serper API key

## Setup

```bash
cp .env.example .env
# Edit .env — set OPENAI_API_KEY and either TAVILY_API_KEY or SERPER_API_KEY

npm install
npm run migrate
npm run dev
```

Server listens on `http://localhost:3000` by default.

### Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI key | required |
| `OPENAI_MODEL` | Chat model | `gpt-4o` |
| `SEARCH_PROVIDER` | `tavily` or `serper` | `tavily` |
| `TAVILY_API_KEY` | Tavily key | required if provider=tavily |
| `SERPER_API_KEY` | Serper key | required if provider=serper |
| `MAX_SEARCH_ITERATIONS` | Max `search_web` calls | `10` |
| `MAX_RESULTS_PER_SEARCH` | Results kept per query | `3` |
| `DATABASE_PATH` | SQLite file path | `./data/deepsearch.db` |
| `PORT` | HTTP port | `3000` |

## API

### Submit research

```bash
curl -s -X POST http://localhost:3000/api/research \
  -H 'Content-Type: application/json' \
  -d '{"question":"What are the latest PHP 8.4 deprecations?"}'
```

Returns `202` with a job `id`. Research runs asynchronously.

### Poll status / report

```bash
curl -s http://localhost:3000/api/research/<job-id>
```

### Full research trail

```bash
curl -s http://localhost:3000/api/research/<job-id>/trail
```

Includes every search query, URL, fetched content metadata, finding, and evaluate/synthesize event.

### List all jobs

```bash
curl -s http://localhost:3000/api/research
```

## Report format

```json
{
  "question": "What are the latest PHP 8.4 deprecations?",
  "summary": "PHP 8.4 deprecates several features including...",
  "findings": [
    {
      "finding": "PHP 8.4 deprecates implicit nullable types",
      "source": "https://www.php.net/manual/en/migration84.deprecated.php",
      "relevance": "high"
    }
  ],
  "sources": ["https://www.php.net/manual/en/migration84.deprecated.php"],
  "research_trail": {
    "queries_executed": 7,
    "pages_read": 12,
    "iterations": 4
  }
}
```

## Database schema

SQLite tables via built-in `node:sqlite` (see `src/db/migrations/001_initial.sql`):

- `research_jobs` — question, status, timestamps
- `search_queries` — each query + rationale
- `search_results` — urls, titles, snippets, fetched content
- `findings` — saved findings with relevance
- `reports` — final JSON report + citations
- `trail_events` — ordered ReAct trail

Run migrations:

```bash
npm run migrate
```

## End-to-end test

Runs a full research job synchronously and prints the cited report:

```bash
npm run test:research
```

Custom question:

```bash
npm run test:research -- "What are the latest PHP 8.4 deprecations?"
```

## Production notes

- Jobs are accepted with `202` and processed in-process via `setImmediate`. For multi-instance production, move execution to a queue (BullMQ, SQS, etc.).
- Page fetches use a timeout, content-length caps, and Readability to keep context size manageable.
- Search budget is enforced in the `search_web` tool (`MAX_SEARCH_ITERATIONS`).
- Secrets stay in `.env` (never commit real keys).

## License

MIT
