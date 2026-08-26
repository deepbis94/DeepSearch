import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  SEARCH_PROVIDER: z.enum(["tavily", "serper"]).default("tavily"),
  TAVILY_API_KEY: z.string().optional(),
  SERPER_API_KEY: z.string().optional(),
  MAX_SEARCH_ITERATIONS: z.coerce.number().default(10),
  MAX_RESULTS_PER_SEARCH: z.coerce.number().default(3),
  MAX_CONCURRENT_JOBS: z.coerce.number().default(3),
  DATABASE_PATH: z.string().default("./data/deepsearch.db"),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const env = parsed.data;

  if (env.SEARCH_PROVIDER === "tavily" && !env.TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is required when SEARCH_PROVIDER=tavily");
  }
  if (env.SEARCH_PROVIDER === "serper" && !env.SERPER_API_KEY) {
    throw new Error("SERPER_API_KEY is required when SEARCH_PROVIDER=serper");
  }

  return {
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    openai: {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
    },
    search: {
      provider: env.SEARCH_PROVIDER,
      tavilyApiKey: env.TAVILY_API_KEY,
      serperApiKey: env.SERPER_API_KEY,
      maxResultsPerSearch: env.MAX_RESULTS_PER_SEARCH,
    },
    agent: {
      maxSearchIterations: env.MAX_SEARCH_ITERATIONS,
      maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
    },
    databasePath: path.resolve(env.DATABASE_PATH),
  };
}

export type Config = ReturnType<typeof loadConfig>;

let cached: Config | null = null;

export function getConfig(): Config {
  if (!cached) {
    cached = loadConfig();
  }
  return cached;
}

/** Soft load for migrate / scripts that only need DB path */
export function getDatabasePath(): string {
  dotenv.config();
  return path.resolve(process.env.DATABASE_PATH ?? "./data/deepsearch.db");
}
