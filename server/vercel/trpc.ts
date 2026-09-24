import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  nodeHTTPRequestHandler,
  type NodeHTTPRequest,
  type NodeHTTPResponse,
} from "@trpc/server/adapters/node-http";
import { appRouter } from "../../server/routers";
import { createContext } from "../../server/_core/context";

function getProcedurePath(req: VercelRequest): string {
  const queryPath = req.query?.path;
  if (Array.isArray(queryPath) && queryPath.length > 0) {
    return queryPath.join("/");
  }
  if (typeof queryPath === "string" && queryPath.length > 0) {
    return queryPath;
  }

  const pathname = (req.url ?? "").split("?", 1)[0] ?? "";
  const marker = "/api/trpc/";
  const markerIndex = pathname.indexOf(marker);
  return markerIndex >= 0 ? pathname.slice(markerIndex + marker.length) : "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = getProcedurePath(req);

  await nodeHTTPRequestHandler({
    router: appRouter,
    req: req as unknown as NodeHTTPRequest,
    res: res as unknown as NodeHTTPResponse,
    path,
    createContext: ({ req: contextReq, res: contextRes }) =>
      createContext({
        req: contextReq as never,
        res: contextRes as never,
      }),
  });
}
