import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import {
  submitResearch,
  getResearchStatus,
  listResearch,
  getResearchTrail,
} from "../services/researchService";

export const researchRouter = Router();

const submitSchema = z.object({
  question: z.string().min(3).max(2000),
});

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * POST /api/research — submit a research question, returns job ID
 */
researchRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request",
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const job = submitResearch(parsed.data.question);
      res.status(202).json({
        id: job.id,
        question: job.question,
        status: job.status,
        created_at: job.created_at,
        message: "Research job accepted. Poll GET /api/research/:id for status.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("Too many concurrent")) {
        res.status(429).json({ error: message });
        return;
      }
      throw err;
    }
  })
);

/**
 * GET /api/research — list all research reports
 */
researchRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = listResearch().map(({ job, report }) => ({
      id: job.id,
      question: job.question,
      status: job.status,
      created_at: job.created_at,
      completed_at: job.completed_at,
      error_message: job.error_message,
      report,
    }));
    res.json({ count: items.length, jobs: items });
  })
);

/**
 * GET /api/research/:id — status and results
 */
researchRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = getResearchStatus(req.params.id);
    if (!result) {
      res.status(404).json({ error: "Research job not found" });
      return;
    }

    const { job, report } = result;
    res.json({
      id: job.id,
      question: job.question,
      status: job.status,
      created_at: job.created_at,
      completed_at: job.completed_at,
      error_message: job.error_message,
      report,
    });
  })
);

/**
 * GET /api/research/:id/trail — full research trail
 */
researchRouter.get(
  "/:id/trail",
  asyncHandler(async (req, res) => {
    const trail = getResearchTrail(req.params.id);
    if (!trail) {
      res.status(404).json({ error: "Research job not found" });
      return;
    }
    res.json(trail);
  })
);
