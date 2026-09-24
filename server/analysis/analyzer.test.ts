import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeRepository } from "./analyzer";
import { ENV } from "../_core/env";

describe("GHOST repository analyzer", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    ENV.githubToken = "";
    vi.restoreAllMocks();
  });

  it("uses the optional server-side GitHub token and preserves it out of results", async () => {
    ENV.githubToken = "test-token-only";
    let repoHeaders: HeadersInit | undefined;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/acme/tokenized") {
        repoHeaders = init?.headers;
        return new Response(JSON.stringify({ name: "tokenized", full_name: "acme/tokenized", html_url: "https://github.com/acme/tokenized", default_branch: "main", description: null, stargazers_count: 0, pushed_at: null }), { status: 200 });
      }
      if (url.includes("/git/trees/main")) return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      return new Response("", { status: 200 });
    }) as typeof fetch;

    const result = await analyzeRepository("https://github.com/acme/tokenized");

    expect(new Headers(repoHeaders).get("authorization")).toBe("Bearer test-token-only");
    expect(JSON.stringify(result)).not.toContain("test-token-only");
  });

  it("distinguishes invalid URLs, missing repositories, and rate limits", async () => {
    await expect(analyzeRepository("https://example.com/not-github")).rejects.toMatchObject({ code: "INVALID_URL", status: 400 });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/missing")) return new Response("", { status: 404 });
      return new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } });
    }) as typeof fetch;

    await expect(analyzeRepository("https://github.com/acme/missing")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    await expect(analyzeRepository("https://github.com/acme/rate-limited")).rejects.toMatchObject({ code: "RATE_LIMIT", status: 429 });
  });

  it("resolves relative imports and reports circular dependencies", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/acme/ghost") {
        return new Response(JSON.stringify({
          name: "ghost",
          full_name: "acme/ghost",
          html_url: "https://github.com/acme/ghost",
          default_branch: "main",
          description: "fixture",
          stargazers_count: 4,
          pushed_at: "2026-09-20T00:00:00Z",
        }), { status: 200 });
      }
      if (url.includes("/git/trees/main")) {
        return new Response(JSON.stringify({ tree: [
          { path: "src/a.ts", type: "blob", size: 120, url: "https://raw.local/a.ts" },
          { path: "src/b.ts", type: "blob", size: 120, url: "https://raw.local/b.ts" },
          { path: "src/types.ts", type: "blob", size: 120, url: "https://raw.local/types.ts" },
        ] }), { status: 200 });
      }
      if (url.endsWith("/a.ts")) {
        return new Response(`import { b } from "./b";\nexport const a = () => b;\n`, { status: 200 });
      }
      if (url.endsWith("/b.ts")) {
        return new Response(`import { a } from "./a";\nexport function b() { if (a) return a; return null; }\n`, { status: 200 });
      }
      return new Response("export type ID = string;\n", { status: 200 });
    }) as typeof fetch;

    const result = await analyzeRepository("https://github.com/acme/ghost");

    expect(result.stats.files).toBe(3);
    expect(result.stats.edges).toBe(2);
    expect(result.stats.cycles).toBe(1);
    expect(result.cycles[0]?.members).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "src/a.ts", target: "src/b.ts" }),
      expect.objectContaining({ source: "src/b.ts", target: "src/a.ts" }),
    ]));
  });

  it("does not treat optional property syntax as control-flow complexity", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/git/trees/main")) {
        return new Response(JSON.stringify({ tree: [{ path: "index.ts", type: "blob", size: 80, url: "https://raw.local/index.ts" }] }), { status: 200 });
      }
      if (url.includes("/repos/acme/optional")) {
        return new Response(JSON.stringify({ name: "optional", full_name: "acme/optional", html_url: "https://github.com/acme/optional", default_branch: "main", description: null, stargazers_count: 0, pushed_at: null }), { status: 200 });
      }
      return new Response("export type Config = { name?: string };\n", { status: 200 });
    }) as typeof fetch;

    const result = await analyzeRepository("https://github.com/acme/optional");

    expect(result.nodes[0]?.complexity).toBe(1);
  });
});
