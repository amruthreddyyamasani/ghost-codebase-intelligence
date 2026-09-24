import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createContext } from "../server/_core/context";
export default function handler(_req: VercelRequest, res: VercelResponse) { res.status(200).json({ ok: typeof createContext === "function" }); }
