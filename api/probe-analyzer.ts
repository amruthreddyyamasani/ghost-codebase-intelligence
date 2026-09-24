import type { VercelRequest, VercelResponse } from "@vercel/node";
import { analyzeRepository } from "../server/analysis/analyzer";
export default function handler(_req: VercelRequest, res: VercelResponse) { res.status(200).json({ ok: typeof analyzeRepository === "function" }); }
