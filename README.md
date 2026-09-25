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
| `GITHUB_TOKEN` | Optional GitHub API quota | Server-side GitHub token used only for GitHub API requests. Never expose it through `VITE_`, responses, logs, or analysis context. |
| `GROQ_API_KEY` | AI assistant | Server-side Groq API key for `llama-3.3-70b-versatile`. Keep secret. |
| `BUILT_IN_FORGE_API_URL` | Optional scaffold services | Legacy Manus storage/media integrations only; not used by the GHOST assistant. |
| `BUILT_IN_FORGE_API_KEY` | Optional scaffold services | Legacy Manus storage/media credential only; not used by the GHOST assistant. |
| `DATABASE_URL` | Persistent auth/data | MySQL/TiDB connection string. Optional for the current stateless MVP scan flow. |
| `JWT_SECRET` | Manus OAuth sessions | Session signing secret. |
| `VITE_APP_ID` | Manus OAuth | OAuth application ID. |
| `OAUTH_SERVER_URL` | Manus OAuth | OAuth server base URL. |
| `OWNER_OPEN_ID` | Owner role mapping | Optional owner identifier used by the scaffold auth flow. |

For a standalone deployment without Manus OAuth, leave the OAuth/database variables unset and use the public analysis surface. Configure `GROQ_API_KEY` only on the server; do not prefix it with `VITE_` or expose it to the browser.

### Configure `GITHUB_TOKEN` in Vercel

In Vercel, open **Project Settings → Environment Variables → Add New**. Set the name to `GITHUB_TOKEN`, paste the token into the secret value field, and select both **Production** and **Preview** environments. Do not select Development unless you also want local Vercel CLI pulls to receive it. Save the variable and redeploy the project; existing deployments do not receive newly added environment variables automatically.

For public-repository scanning, the minimum recommended credential is a GitHub fine-grained personal access token with **Contents: Read-only** and the required **Metadata: Read-only** permission. Limit the resource owner and repository access to the public repositories you intend to scan. No Issues, Pull requests, Actions, Administration, write, or webhook permissions are needed. Unauthenticated scanning remains supported when `GITHUB_TOKEN` is absent, but GitHub's lower anonymous quota applies.

### Enable the GitHub Actions smoke job

The workflow is already configured to read a repository variable named `GHOST_SMOKE_URL`. To enable its live smoke job, open the GitHub repository and go to **Settings → Secrets and variables → Actions → Variables → New repository variable**. Add:

| Name | Value |
|---|---|
| `GHOST_SMOKE_URL` | `https://ghost-codebase-intelligence.vercel.app/` |
| `GHOST_SMOKE_REPOSITORY` | Optional; defaults to `https://github.com/expressjs/cookie` |
| `GHOST_SMOKE_NONEXISTENT_REPOSITORY` | Optional; defaults to a known nonexistent GitHub repository |

Then run **Actions → GHOST CI → Run workflow** or push to `main`. The job checks `auth.me`, a small public repository analysis, invalid URL mapping, and nonexistent-repository handling. If GitHub returns `429 TOO_MANY_REQUESTS`, the job reports the analysis or nonexistent-repository check as not verified and exits successfully rather than producing a false failure. The smoke job is not considered active until this variable is configured and the workflow has run.

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

`vercel.json` tells Vercel to run `pnpm build:vercel`, publish only `dist/vercel`, and use Vercel's built-in Node runtime for the generated `api/**/*.js` serverless functions. The build bundles GHOST's local server modules into those function entries so Vercel does not need to resolve the TypeScript source tree at runtime. The frontend calls the existing tRPC router through `/api/trpc`; the OAuth callback is preserved at `/api/oauth/callback`. Add `GROQ_API_KEY` to the Vercel project before using the assistant.

The Vercel functions use the same `appRouter`, analyzer, database helpers, OAuth implementation, and server-side Groq client as the Node runtime. Vercel functions are request-scoped, so long-running workers and in-memory persistence are not used by the MVP. Set `GITHUB_TOKEN` as a server-side Vercel environment variable to raise GitHub API limits; the application preserves its public unauthenticated behavior when it is absent. The included `pnpm build` and `pnpm start` commands remain the source of truth for full-stack container deployment.

## Repository analysis boundaries

GHOST analyzes only source files returned by the public GitHub tree API and currently caps a scan at 180 supported source files and 180 KB per file. It resolves relative imports only; package imports and aliases are retained in source context but are not fabricated as graph edges. Complexity is a deterministic heuristic, not a substitute for a compiler or profiler. The assistant is explicitly instructed to stay within the scan facts and selected source excerpt.

## Verification

```bash
pnpm check
pnpm test
pnpm build
```

The analyzer regression suite covers relative import resolution, circular dependency detection, optional-property complexity protection, server-side GitHub authorization, and distinct invalid URL, not-found, and rate-limit errors. GitHub Actions runs these checks plus the Vercel bundle build. To enable the optional live smoke job, set repository variables `GHOST_SMOKE_URL`, `GHOST_SMOKE_REPOSITORY`, and `GHOST_SMOKE_NONEXISTENT_REPOSITORY`; a GitHub rate-limit response is reported as not verified rather than being treated as a 404.

## Project structure

```text
client/src/                 React workbench and Three.js graph
server/vercel/trpc.ts       Source for the bundled Vercel tRPC adapter
server/vercel/oauth.ts      Source for the bundled Vercel OAuth adapter
package.json build:vercel  Bundles local server code into api/
server/analysis/analyzer.ts Deterministic GitHub scanner and graph builder
server/routers.ts           tRPC procedures for analysis and assistant
shared/ghost.ts             Shared analysis contracts
```
