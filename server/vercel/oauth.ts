import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import { registerOAuthRoutes } from "../../server/_core/oauth";

const app = express();
registerOAuthRoutes(app);

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
