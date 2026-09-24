# GHOST — Codebase Intelligence

GHOST is a full-stack developer tool for understanding unfamiliar public JavaScript and TypeScript repositories. Paste a GitHub repository URL to fetch its source tree, resolve relative imports, build a dependency graph, detect circular dependencies, score complexity hotspots, inspect direct impact paths, and ask a source-grounded architecture assistant questions about the scan.

## MVP capabilities

- Public GitHub repository import through the GitHub REST API.
- Deterministic JavaScript and TypeScript source scanning for imports, exports, functions, lines, and control-flow complexity.
- Relative import resolution for `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, and `.tsx` files.
- Dependency edges, strongly connected component cycle detection, hotspot scoring, and direct blast-radius inspection.
- Interactive React Three Fiber architecture graph with layer coloring and node selection.
- Source excerpts and dependency/dependent lists for the selected file.
- Server-side source-grounded AI assistant with a strict evidence-only prompt and deterministic fallback when the model is unavailable.
- Dark, responsive GHOST workbench UI.

## Stack

- React 19, TypeScript, Vite, Tailwind CSS 4
- Express 4, tRPC 11, Drizzle ORM, MySQL/TiDB support
- React Three Fiber, Three.js, Drei
- Vitest for backend regression tests

## Local development

Requirements: Node.js 22+, pnpm 10+, and network access to GitHub's public API.

```bash
git clone https://github.com/amruthreddyyamasani/ghost-codebase-intelligence.git
cd ghost-codebase-intelligence
pnpm install
pnpm check
pnpm test
pnpm dev
```

The app runs at `http://localhost:3000`. Repository analysis works without a database or authentication configuration. The AI assistant requires a Groq API key configured on the server.

## Environment variables

Never commit a real `.env` file. Set the variables in your shell, secret manager, or deployment platform.

| Variable | Required for | Description |
|---|---|---|
| `GROQ_API_KEY` | AI assistant | Server-side Groq API key for `llama-3.3-70b-versatile`. Keep secret. |
| `BUILT_IN_FORGE_API_URL` | Optional scaffold services | Legacy Manus storage/media integrations only; not used by the GHOST assistant. |
| `BUILT_IN_FORGE_API_KEY` | Optional scaffold services | Legacy Manus storage/media credential only; not used by the GHOST assistant. |
| `DATABASE_URL` | Persistent auth/data | MySQL/TiDB connection string. Optional for the current stateless MVP scan flow. |
| `JWT_SECRET` | Manus OAuth sessions | Session signing secret. |
| `VITE_APP_ID` | Manus OAuth | OAuth application ID. |
| `OAUTH_SERVER_URL` | Manus OAuth | OAuth server base URL. |
| `OWNER_OPEN_ID` | Owner role mapping | Optional owner identifier used by the scaffold auth flow. |

For a standalone deployment without Manus OAuth, leave the OAuth/database variables unset and use the public analysis surface. Configure `GROQ_API_KEY` only on the server; do not prefix it with `VITE_` or expose it to the browser.

## Deployment

### Node / container deployment

The supported full-stack deployment is the included Node server. It builds the Vite client and bundles the Express/tRPC server:

```bash
pnpm install --frozen-lockfile
pnpm build
NODE_ENV=production pnpm start
```

Run behind a reverse proxy or platform that supports a long-running Node process and forwards traffic to port `3000`.

### Vercel

`vercel.json` tells Vercel to run `pnpm build:vercel`, publish only `dist/vercel`, and use Vercel's built-in Node runtime for `api/**/*.ts` serverless functions. The frontend calls the existing tRPC router through `/api/trpc`; the OAuth callback is preserved at `/api/oauth/callback`. Add `GROQ_API_KEY` to the Vercel project before using the assistant.

The Vercel functions use the same `appRouter`, analyzer, database helpers, OAuth implementation, and server-side Groq client as the Node runtime. Vercel functions are request-scoped, so long-running workers and in-memory persistence are not used by the MVP. The included `pnpm build` and `pnpm start` commands remain the source of truth for full-stack container deployment.

## Repository analysis boundaries

GHOST analyzes only source files returned by the public GitHub tree API and currently caps a scan at 180 supported source files and 180 KB per file. It resolves relative imports only; package imports and aliases are retained in source context but are not fabricated as graph edges. Complexity is a deterministic heuristic, not a substitute for a compiler or profiler. The assistant is explicitly instructed to stay within the scan facts and selected source excerpt.

## Verification

```bash
pnpm check
pnpm test
pnpm build
```

The analyzer regression suite covers relative import resolution, circular dependency detection, and protection against counting optional property syntax as control-flow complexity.

## Project structure

```text
client/src/                 React workbench and Three.js graph
api/trpc/[...path].ts       Vercel serverless tRPC adapter
api/oauth/callback.ts       Vercel serverless OAuth callback adapter
server/analysis/analyzer.ts Deterministic GitHub scanner and graph builder
server/routers.ts           tRPC procedures for analysis and assistant
shared/ghost.ts             Shared analysis contracts
```
