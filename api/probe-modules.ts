import type { VercelRequest, VercelResponse } from "@vercel/node";
import { appRouter } from "../server/routers";
import { analyzeRepository } from "../server/analysis/analyzer";
import { createContext } from "../server/_core/context";
import { invokeLLM } from "../server/_core/llm";
import { systemRouter } from "../server/_core/systemRouter";
import { router } from "../server/_core/trpc";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    appRouter: !!appRouter,
    analyzeRepository: typeof analyzeRepository === "function",
    createContext: typeof createContext === "function",
    invokeLLM: typeof invokeLLM === "function",
    systemRouter: !!systemRouter,
    router: typeof router === "function",
  });
}
