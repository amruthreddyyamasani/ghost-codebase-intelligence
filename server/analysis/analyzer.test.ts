import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeRepository } from "./analyzer";

describe("GHOST repository analyzer", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
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
