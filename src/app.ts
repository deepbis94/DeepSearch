import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import { researchRouter } from "./routes/research";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "deepsearch" });
  });

  app.use("/api/research", researchRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const message = err instanceof Error ? err.message : "Internal server error";
      console.error("[error]", err);
      res.status(500).json({ error: message });
    }
  );

  return app;
}
