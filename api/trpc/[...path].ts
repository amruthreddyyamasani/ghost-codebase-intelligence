import type { VercelRequest, VercelResponse } from "@vercel/node";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const trpcMiddleware = createExpressMiddleware({
  router: appRouter,
  createContext,
});

// Vercel may invoke a filesystem function with either the matched URL intact
// or the path stripped. Supporting both keeps the handler portable.
app.use("/api/trpc", trpcMiddleware);
app.use(trpcMiddleware);

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
