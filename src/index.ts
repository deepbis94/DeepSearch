import { createApp } from "./app";
import { getConfig } from "./config";
import { runMigrations } from "./db/migrate";
import { closeDb } from "./db";
import { logger } from "./utils/logger";

function main() {
  runMigrations();

  const config = getConfig();
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info("DeepSearch started", {
      port: config.port,
      searchProvider: config.search.provider,
      model: config.openai.model,
      maxSearchIterations: config.agent.maxSearchIterations,
      maxConcurrentJobs: config.agent.maxConcurrentJobs,
    });
  });

  const shutdown = (signal: string) => {
    logger.info("Shutting down", { signal });
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

try {
  main();
} catch (err) {
  logger.error("Failed to start", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
}
