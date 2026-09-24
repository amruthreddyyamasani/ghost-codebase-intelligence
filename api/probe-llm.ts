import type { VercelRequest, VercelResponse } from "@vercel/node";
import { invokeLLM } from "../server/_core/llm";
export default function handler(_req: VercelRequest, res: VercelResponse) { res.status(200).json({ ok: typeof invokeLLM === "function" }); }
