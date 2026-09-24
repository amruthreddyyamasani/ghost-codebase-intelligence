import type { VercelRequest, VercelResponse } from "@vercel/node";
import { router } from "../server/_core/trpc";
export default function handler(_req: VercelRequest, res: VercelResponse) { res.status(200).json({ ok: typeof router === "function" }); }
