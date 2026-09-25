import { describe, expect, it } from "vitest";
import { normalizeTRPCResponse } from "./api-response";

describe("normalizeTRPCResponse", () => {
  it("preserves a valid JSON tRPC response", async () => {
    const response = await normalizeTRPCResponse(new Response('[{"result":{"data":{"json":null}}}]', {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual([{ result: { data: { json: null } } }]);
  });

  it("normalizes JSON returned with a text content type without changing the status", async () => {
    const response = await normalizeTRPCResponse(new Response('{"error":"bad request"}', {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }));

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "bad request" });
  });

  it("turns a plain-text platform error into a safe tRPC error envelope", async () => {
    const response = await normalizeTRPCResponse(new Response("A server error occurred", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }));

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual([{
      error: {
        json: {
          message: "The server returned an invalid response. Please try again.",
          code: -32603,
          data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
        },
      },
    }]);
  });
});
