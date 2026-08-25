import { createApp } from "./app";
import { getConfig } from "./config";
import { runMigrations } from "./db/migrate";
import { closeDb } from "./db";

function main() {
  runMigrations();

  const config = getConfig();
  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`DeepSearch listening on http://localhost:${config.port}`);
    console.log(`Search provider: ${config.search.provider}`);
    console.log(`Model: ${config.openai.model}`);
    console.log(`Max search iterations: ${config.agent.maxSearchIterations}`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
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
  console.error("Failed to start:", err);
  process.exit(1);
}
