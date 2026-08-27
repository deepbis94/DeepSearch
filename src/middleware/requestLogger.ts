import type { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const started = Date.now();
  res.on("finish", () => {
    logger.info("HTTP request", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - started,
    });
  });
  next();
}
