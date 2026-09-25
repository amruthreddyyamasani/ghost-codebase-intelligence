const baseUrl = (process.env.GHOST_SMOKE_URL ?? "").replace(/\/$/, "");
const repository = process.env.GHOST_SMOKE_REPOSITORY ?? "https://github.com/expressjs/cookie";
const nonexistent = process.env.GHOST_SMOKE_NONEXISTENT_REPOSITORY ?? "https://github.com/ghost-does-not-exist-xyz/repo-does-not-exist-xyz";

if (!baseUrl) {
  console.error("GHOST_SMOKE_URL is required");
  process.exit(1);
}

async function call(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* plain error text is still reported safely */ }
  return { response, text, json };
}

const auth = await call("/api/trpc/auth.me?batch=1&input=%7B%7D");
if (auth.response.status !== 200 || !auth.json?.[0]?.result) {
  throw new Error(`auth.me failed with HTTP ${auth.response.status}`);
}

const analysis = await call("/api/trpc/ghost.analyze?batch=1", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ 0: { json: { url: repository } } }),
});
const analysisJson = analysis.json?.[0]?.result?.data?.json;
const analysisCode = analysis.json?.[0]?.error?.json?.data?.code;
const analysisRateLimited = analysis.response.status === 429 && analysisCode === "TOO_MANY_REQUESTS";
if (analysis.response.status !== 200 && !analysisRateLimited) {
  throw new Error(`repository analysis failed with HTTP ${analysis.response.status}`);
}

const invalid = await call("/api/trpc/ghost.analyze?batch=1", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ 0: { json: { url: "https://example.com/not-github" } } }),
});
if (invalid.response.status !== 400 || invalid.json?.[0]?.error?.json?.data?.code !== "BAD_REQUEST") {
  throw new Error(`invalid URL mapping failed with HTTP ${invalid.response.status}`);
}

const missing = await call("/api/trpc/ghost.analyze?batch=1", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ 0: { json: { url: nonexistent } } }),
});
const missingCode = missing.json?.[0]?.error?.json?.data?.code;
if (missing.response.status === 404 && missingCode === "NOT_FOUND") {
  console.log(JSON.stringify({ auth: "ok", analysis: analysisRateLimited ? "not verified: GitHub rate limited" : `${analysisJson.stats.files} files`, invalidUrl: "400 BAD_REQUEST", nonexistent: "404 NOT_FOUND" }));
  process.exit(0);
}
if (missing.response.status === 429 && missingCode === "TOO_MANY_REQUESTS") {
  console.warn(JSON.stringify({ auth: "ok", analysis: analysisRateLimited ? "not verified: GitHub rate limited" : `${analysisJson.stats.files} files`, invalidUrl: "400 BAD_REQUEST", nonexistent: "not verified: GitHub rate limited" }));
  process.exit(0);
}
throw new Error(`unexpected nonexistent-repository response: HTTP ${missing.response.status}, tRPC ${missingCode ?? "unknown"}`);
