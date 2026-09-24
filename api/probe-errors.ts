import type { VercelRequest, VercelResponse } from "@vercel/node";

type ProbeResult = { ok: true } | { ok: false; name: string; message: string };

async function probe(loader: () => Promise<unknown>): Promise<ProbeResult> {
  try {
    await loader();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown module import failure",
    };
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const result = {
    trpc: await probe(() => import("../server/_core/trpc")),
    llm: await probe(() => import("../server/_core/llm")),
    analyzer: await probe(() => import("../server/analysis/analyzer")),
    context: await probe(() => import("../server/_core/context")),
    router: await probe(() => import("../server/routers")),
  };
  res.status(200).json(result);
}
