// server/vercel/trpc.ts
import {
  nodeHTTPRequestHandler
} from "@trpc/server/adapters/node-http";

// server/routers.ts
import { z as z2 } from "zod";
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var GROQ_BASE_URL = "https://api.groq.com/openai/v1";
var DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
var resolveApiUrl = () => `${GROQ_BASE_URL}/chat/completions`;
var assertApiKey = () => {
  if (!ENV.groqApiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  payload.model = model ?? DEFAULT_GROQ_MODEL;
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.groqApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";

// server/analysis/analyzer.ts
var RepositoryAnalysisError = class extends Error {
  constructor(code, message, status, retryAt, retryAfterSeconds) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAt = retryAt;
    this.retryAfterSeconds = retryAfterSeconds;
    this.name = "RepositoryAnalysisError";
  }
};
function rateLimitMetadata(response) {
  const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
  const retryAfterValue = response.headers.get("retry-after");
  const retryAfterHeader = retryAfterValue === null ? void 0 : Number(retryAfterValue);
  const retryAt = Number.isFinite(resetSeconds) && resetSeconds > 0 ? resetSeconds * 1e3 : void 0;
  const retryAfterSeconds = typeof retryAfterHeader === "number" && Number.isFinite(retryAfterHeader) && retryAfterHeader >= 0 ? Math.ceil(retryAfterHeader) : retryAt ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1e3)) : void 0;
  return { retryAt, retryAfterSeconds };
}
var CODE_EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs)$/i;
var IGNORED_DIRS = /(^|\/)(node_modules|dist|build|coverage|\.git|\.next|vendor|out)(\/|$)/;
var MAX_FILES = 180;
var MAX_FILE_BYTES = 18e4;
function parseRepoUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new RepositoryAnalysisError("INVALID_URL", "Enter a valid GitHub repository URL.", 400);
  }
  if (url.hostname !== "github.com") {
    throw new RepositoryAnalysisError("INVALID_URL", "GHOST currently supports github.com repository URLs only.", 400);
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new RepositoryAnalysisError("INVALID_URL", "That GitHub URL does not include an owner and repository name.", 400);
  }
  return { owner: parts[0], name: parts[1].replace(/\.git$/, "") };
}
async function githubJson(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "GHOST-Codebase-Intelligence",
      ...ENV.githubToken ? { Authorization: `Bearer ${ENV.githubToken}` } : {}
    }
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new RepositoryAnalysisError("NOT_FOUND", "Repository not found or not publicly accessible.", 404);
    }
    if (response.status === 403 || response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") {
      const metadata = rateLimitMetadata(response);
      throw new RepositoryAnalysisError("RATE_LIMIT", "GitHub rate limit reached. Try again later.", 429, metadata.retryAt, metadata.retryAfterSeconds);
    }
    throw new RepositoryAnalysisError("GITHUB_ERROR", `GitHub returned ${response.status}.`, 502);
  }
  return response.json();
}
async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "GHOST-Codebase-Intelligence",
      ...ENV.githubToken ? { Authorization: `Bearer ${ENV.githubToken}` } : {}
    }
  });
  if (!response.ok) throw new Error(`Unable to read ${url}`);
  return response.text();
}
function fileKind(path) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "tsx") return "tsx";
  if (extension === "jsx") return "jsx";
  if (extension === "mjs") return "mjs";
  if (extension === "cjs") return "cjs";
  if (extension === "ts") return "ts";
  return "js";
}
function countMatches(source, pattern) {
  return source.match(pattern)?.length ?? 0;
}
function getLayer(path) {
  const first = path.split("/")[0]?.toLowerCase() ?? "root";
  if (["src", "app", "client"].includes(first)) return "product";
  if (["server", "api", "backend"].includes(first)) return "server";
  if (["components", "ui", "features", "pages"].includes(first)) return "interface";
  if (["lib", "utils", "shared", "hooks"].includes(first)) return "shared";
  if (["config", "scripts", "tools"].includes(first)) return "tooling";
  return first === "root" ? "root" : "other";
}
function resolveImport(from, specifier, available) {
  if (!specifier.startsWith(".")) return null;
  const base = from.split("/").slice(0, -1).concat(specifier.split("/")).join("/");
  const normalized = base.split("/").reduce((parts, segment) => {
    if (segment === "..") parts.pop();
    else if (segment && segment !== ".") parts.push(segment);
    return parts;
  }, []).join("/");
  const candidates = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}.js`,
    `${normalized}.jsx`,
    `${normalized}.mjs`,
    `${normalized}/index.ts`,
    `${normalized}/index.tsx`,
    `${normalized}/index.js`,
    `${normalized}/index.jsx`
  ];
  return candidates.find((candidate) => available.has(candidate)) ?? null;
}
function extractImports(source) {
  const imports = /* @__PURE__ */ new Set();
  const patterns = [
    /\bimport\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:[^'";]+?\s+from\s+)["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    Array.from(source.matchAll(pattern)).forEach((match) => imports.add(match[1]));
  }
  return Array.from(imports);
}
function extractExports(source) {
  return countMatches(source, /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\b/g) + countMatches(source, /\bexport\s*\{[^}]+\}/g);
}
function extractFunctions(source) {
  return countMatches(source, /\b(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g) + countMatches(source, /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g) + countMatches(source, /\b(?:get|set)\s+[A-Za-z_$][\w$]*\s*\(/g);
}
function calculateComplexity(source) {
  return 1 + countMatches(source, /\b(?:if|else if|for|while|catch|case)\b/g) + countMatches(source, /\b(?:switch|try)\b/g) + countMatches(source, /&&|\|\||\?\?/g);
}
function summarize(path, source, imports, functions, complexity) {
  const name = path.split("/").pop() ?? path;
  const role = path.includes("component") || path.includes("pages") ? "UI surface" : path.includes("test") ? "test module" : "module";
  return `${name} is a ${role} with ${imports} local import${imports === 1 ? "" : "s"}, ${functions} function${functions === 1 ? "" : "s"}, and a complexity score of ${complexity}.`;
}
function stronglyConnectedComponents(nodes, adjacency) {
  const indexByNode = /* @__PURE__ */ new Map();
  const lowLink = /* @__PURE__ */ new Map();
  const stack = [];
  const onStack = /* @__PURE__ */ new Set();
  const components = [];
  let index = 0;
  const visit = (node) => {
    indexByNode.set(node, index);
    lowLink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (!indexByNode.has(next)) {
        visit(next);
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, lowLink.get(next) ?? 0));
      } else if (onStack.has(next)) {
        lowLink.set(node, Math.min(lowLink.get(node) ?? 0, indexByNode.get(next) ?? 0));
      }
    }
    if (lowLink.get(node) === indexByNode.get(node)) {
      const component = [];
      let member = "";
      do {
        member = stack.pop() ?? "";
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) components.push(component.sort());
    }
  };
  nodes.forEach((node) => {
    if (!indexByNode.has(node)) visit(node);
  });
  return components;
}
async function analyzeRepository(repositoryUrl) {
  const { owner, name } = parseRepoUrl(repositoryUrl);
  const repo = await githubJson(`/repos/${owner}/${name}`);
  const tree = await githubJson(`/repos/${owner}/${name}/git/trees/${repo.default_branch}?recursive=1`);
  const entries = tree.tree.filter((entry) => entry.type === "blob" && CODE_EXTENSIONS.test(entry.path) && !IGNORED_DIRS.test(entry.path)).sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path)).slice(0, MAX_FILES);
  const sourceByPath = {};
  await Promise.all(entries.map(async (entry) => {
    if ((entry.size ?? 0) > MAX_FILE_BYTES || !entry.url) return;
    try {
      sourceByPath[entry.path] = await fetchText(entry.url);
    } catch {
    }
  }));
  const paths = Object.keys(sourceByPath).sort();
  const available = new Set(paths);
  const rawModules = /* @__PURE__ */ new Map();
  const edges = [];
  const adjacency = /* @__PURE__ */ new Map();
  const incoming = /* @__PURE__ */ new Map();
  for (const path of paths) {
    const source = sourceByPath[path];
    const imports = extractImports(source);
    const resolvedImports = imports.map((specifier) => ({ specifier, target: resolveImport(path, specifier, available) })).filter((item) => item.target);
    rawModules.set(path, {
      imports: resolvedImports.map((item) => item.target),
      exports: extractExports(source),
      functions: extractFunctions(source),
      complexity: calculateComplexity(source),
      lines: source.split(/\r?\n/).length
    });
    adjacency.set(path, resolvedImports.map((item) => item.target));
    for (const item of resolvedImports) {
      edges.push({ source: path, target: item.target, specifier: item.specifier });
      incoming.set(item.target, (incoming.get(item.target) ?? 0) + 1);
    }
  }
  const nodes = paths.map((path) => {
    const module = rawModules.get(path);
    const coupling = module.imports.length + (incoming.get(path) ?? 0);
    const risk = Math.min(99, Math.round(module.complexity * 2.1 + coupling * 2.6 + module.lines / 90));
    return {
      id: path,
      path,
      kind: fileKind(path),
      layer: getLayer(path),
      lines: module.lines,
      imports: module.imports.length,
      exports: module.exports,
      functions: module.functions,
      complexity: module.complexity,
      risk,
      summary: summarize(path, sourceByPath[path], module.imports.length, module.functions, module.complexity)
    };
  });
  const cycles = stronglyConnectedComponents(paths, adjacency).map((members, index) => ({
    id: `cycle-${index + 1}`,
    members,
    severity: members.length >= 3 ? "critical" : "high",
    label: members.length >= 3 ? "deep cycle" : "circular import"
  }));
  const cycleMembers = new Set(cycles.flatMap((cycle) => cycle.members));
  const adjustedNodes = nodes.map((node) => cycleMembers.has(node.path) ? { ...node, risk: Math.min(99, node.risk + 18) } : node);
  const hotspots = [...adjustedNodes].sort((a, b) => b.risk - a.risk || b.complexity - a.complexity).slice(0, 5);
  return {
    repo: {
      owner,
      name: repo.name,
      url: repo.html_url,
      branch: repo.default_branch,
      description: repo.description,
      stars: repo.stargazers_count,
      lastCommit: repo.pushed_at
    },
    stats: {
      files: adjustedNodes.length,
      lines: adjustedNodes.reduce((total, node) => total + node.lines, 0),
      imports: adjustedNodes.reduce((total, node) => total + node.imports, 0),
      exports: adjustedNodes.reduce((total, node) => total + node.exports, 0),
      functions: adjustedNodes.reduce((total, node) => total + node.functions, 0),
      edges: edges.length,
      cycles: cycles.length,
      hotspots: hotspots.length
    },
    nodes: adjustedNodes,
    edges,
    cycles,
    hotspots,
    sourceByPath,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// server/_core/trpc.ts
var t = initTRPC.context().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) => {
    const cause = error.cause instanceof RepositoryAnalysisError ? error.cause : void 0;
    const retryData = cause?.code === "RATE_LIMIT" ? {
      retryAt: cause.retryAt,
      retryAfterSeconds: cause.retryAfterSeconds
    } : {};
    return {
      ...shape,
      data: {
        ...shape.data,
        ...retryData
      }
    };
  }
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
var assistantInput = z2.object({
  repository: z2.string().min(1).max(240),
  question: z2.string().min(1).max(1200),
  selectedFile: z2.string().max(220).optional(),
  selectedSource: z2.string().max(12e3).optional(),
  context: z2.string().min(1).max(18e3)
});
function contentToText(content) {
  if (typeof content === "string") return content;
  return content.map((part) => part.text ?? "").join("\n").trim();
}
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  ghost: router({
    analyze: publicProcedure.input(z2.object({ url: z2.string().url().max(400) })).mutation(async ({ input }) => {
      try {
        return await analyzeRepository(input.url);
      } catch (error) {
        if (error instanceof RepositoryAnalysisError) {
          const code = error.code === "INVALID_URL" ? "BAD_REQUEST" : error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "RATE_LIMIT" ? "TOO_MANY_REQUESTS" : "INTERNAL_SERVER_ERROR";
          throw new TRPCError3({ code, message: error.message, cause: error });
        }
        throw error;
      }
    }),
    ask: publicProcedure.input(assistantInput).mutation(async ({ input }) => {
      const selected = input.selectedFile ? `The user is inspecting ${input.selectedFile}.` : "No file is currently selected.";
      const source = input.selectedSource ? `

SOURCE (the only source text you may quote):
---
${input.selectedSource}
---` : "";
      try {
        const response = await invokeLLM({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are GHOST, a precise codebase intelligence assistant. Explain only what is supported by the repository facts and source supplied below. Never invent files, imports, call paths, or runtime behavior. If the evidence is insufficient, say so. Prefer compact markdown with a short conclusion followed by evidence. Repository: ${input.repository}. ${selected}

ANALYSIS FACTS:
${input.context}${source}`
            },
            { role: "user", content: input.question }
          ],
          maxTokens: 700
        });
        const answer = contentToText(response.choices[0]?.message.content ?? "");
        if (answer) return { answer };
      } catch (error) {
        console.warn("[GHOST] Assistant unavailable:", error);
      }
      return {
        answer: `I couldn't reach the reasoning model, so I won't speculate. Based on the deterministic scan, ${input.selectedFile ? `${input.selectedFile} is the current focus. ` : "no file is selected. "}Use the dependency and risk signals in the explorer as the source of truth.`
      };
    })
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});

// server/db.ts
var _db = null;
async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}

// server/_core/sdk.ts
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/vercel/trpc.ts
function getProcedurePath(req) {
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
async function handler(req, res) {
  const path = getProcedurePath(req);
  await nodeHTTPRequestHandler({
    router: appRouter,
    req,
    res,
    path,
    createContext: ({ req: contextReq, res: contextRes }) => createContext({
      req: contextReq,
      res: contextRes
    })
  });
}
export {
  handler as default
};
