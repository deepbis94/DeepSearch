import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import { researchRouter } from "./routes/research";
import { requestLogger } from "./middleware/requestLogger";
import { logger } from "./utils/logger";

const startedAt = Date.now();

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "deepsearch",
      uptime_s: Math.floor((Date.now() - startedAt) / 1000),
      version: process.env.npm_package_version ?? "1.0.0",
    });
  });

  app.use("/api/research", researchRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const message = err instanceof Error ? err.message : "Internal server error";
      logger.error("Unhandled error", { error: message });
      res.status(500).json({ error: message });
    }
  );

  return app;
}
