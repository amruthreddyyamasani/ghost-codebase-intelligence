import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { analyzeRepository, RepositoryAnalysisError } from "./analysis/analyzer";

const assistantInput = z.object({
  repository: z.string().min(1).max(240),
  question: z.string().min(1).max(1200),
  selectedFile: z.string().max(220).optional(),
  selectedSource: z.string().max(12000).optional(),
  context: z.string().min(1).max(18000),
});

function contentToText(content: string | Array<{ type: string; text?: string }>) {
  if (typeof content === "string") return content;
  return content.map(part => part.text ?? "").join("\n").trim();
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  ghost: router({
    analyze: publicProcedure
      .input(z.object({ url: z.string().url().max(400) }))
      .mutation(async ({ input }) => {
        try {
          return await analyzeRepository(input.url);
        } catch (error) {
          if (error instanceof RepositoryAnalysisError) {
            const code = error.code === "INVALID_URL"
              ? "BAD_REQUEST"
              : error.code === "NOT_FOUND"
                ? "NOT_FOUND"
                : error.code === "RATE_LIMIT"
                  ? "TOO_MANY_REQUESTS"
                  : "INTERNAL_SERVER_ERROR";
            throw new TRPCError({ code, message: error.message, cause: error });
          }
          throw error;
        }
      }),
    ask: publicProcedure.input(assistantInput).mutation(async ({ input }) => {
      const selected = input.selectedFile ? `The user is inspecting ${input.selectedFile}.` : "No file is currently selected.";
      const source = input.selectedSource
        ? `\n\nSOURCE (the only source text you may quote):\n---\n${input.selectedSource}\n---`
        : "";

      try {
        const response = await invokeLLM({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are GHOST, a precise codebase intelligence assistant. Explain only what is supported by the repository facts and source supplied below. Never invent files, imports, call paths, or runtime behavior. If the evidence is insufficient, say so. Prefer compact markdown with a short conclusion followed by evidence. Repository: ${input.repository}. ${selected}\n\nANALYSIS FACTS:\n${input.context}${source}`,
            },
            { role: "user", content: input.question },
          ],
          maxTokens: 700,
        });
        const answer = contentToText(response.choices[0]?.message.content ?? "");
        if (answer) return { answer };
      } catch (error) {
        console.warn("[GHOST] Assistant unavailable:", error);
      }

      return {
        answer: `I couldn't reach the reasoning model, so I won't speculate. Based on the deterministic scan, ${input.selectedFile ? `${input.selectedFile} is the current focus. ` : "no file is selected. "}Use the dependency and risk signals in the explorer as the source of truth.`,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
