/**
 * End-to-end research test.
 *
 * Usage:
 *   cp .env.example .env   # fill in API keys
 *   npm run migrate
 *   npm run test:research
 *   npm run test:research -- "What are the latest PHP 8.4 deprecations?"
 */

import path from "path";
import dotenv from "dotenv";

// Load .env before importing config-dependent modules
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const { runMigrations } = await import("../src/db/migrate");
  const { closeDb } = await import("../src/db");
  const { runResearchSync } = await import("../src/services/researchService");

  runMigrations();

  const question =
    process.argv.slice(2).join(" ").trim() ||
    "What are the latest PHP 8.4 deprecations?";

  console.log("=".repeat(60));
  console.log("DeepSearch E2E Test");
  console.log("=".repeat(60));
  console.log(`Question: ${question}\n`);

  const started = Date.now();

  try {
    const { job, report } = await runResearchSync(question);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(60));
    console.log(`Job ID:  ${job.id}`);
    console.log(`Status:  ${job.status}`);
    console.log(`Elapsed: ${elapsed}s`);
    console.log("=".repeat(60));
    console.log("\nSUMMARY\n");
    console.log(report.summary);
    console.log("\nFINDINGS\n");
    for (const f of report.findings) {
      console.log(`• [${f.relevance}] ${f.finding}`);
      console.log(`  source: ${f.source}\n`);
    }
    console.log("SOURCES");
    for (const s of report.sources) {
      console.log(`  - ${s}`);
    }
    console.log("\nTRAIL");
    console.log(JSON.stringify(report.research_trail, null, 2));
    console.log("\nFull report JSON:\n");
    console.log(JSON.stringify(report, null, 2));

    if (job.status !== "completed") {
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("\nE2E test failed:", err);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}

void main();
