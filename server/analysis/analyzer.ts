import type {
  AnalysisEdge,
  AnalysisNode,
  DependencyCycle,
  FileKind,
  RepositoryAnalysis,
} from "../../shared/ghost";
import { ENV } from "../_core/env";

export type RepositoryAnalysisErrorCode = "INVALID_URL" | "NOT_FOUND" | "RATE_LIMIT" | "GITHUB_ERROR";

export class RepositoryAnalysisError extends Error {
  constructor(
    public readonly code: RepositoryAnalysisErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAt?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "RepositoryAnalysisError";
  }
}

function rateLimitMetadata(response: Response) {
  const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
  const retryAfterValue = response.headers.get("retry-after");
  const retryAfterHeader = retryAfterValue === null ? undefined : Number(retryAfterValue);
  const retryAt = Number.isFinite(resetSeconds) && resetSeconds > 0 ? resetSeconds * 1000 : undefined;
  const retryAfterSeconds = typeof retryAfterHeader === "number" && Number.isFinite(retryAfterHeader) && retryAfterHeader >= 0
    ? Math.ceil(retryAfterHeader)
    : retryAt
      ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
      : undefined;
  return { retryAt, retryAfterSeconds };
}

type GitHubRepo = {
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string | null;
};

type GitHubTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
  url?: string;
};

const CODE_EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs)$/i;
const IGNORED_DIRS = /(^|\/)(node_modules|dist|build|coverage|\.git|\.next|vendor|out)(\/|$)/;
const MAX_FILES = 180;
const MAX_FILE_BYTES = 180_000;

function parseRepoUrl(value: string) {
  let url: URL;
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

async function githubJson<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "GHOST-Codebase-Intelligence",
      ...(ENV.githubToken ? { Authorization: `Bearer ${ENV.githubToken}` } : {}),
    },
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

  return response.json() as Promise<T>;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      "User-Agent": "GHOST-Codebase-Intelligence",
      ...(ENV.githubToken ? { Authorization: `Bearer ${ENV.githubToken}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`Unable to read ${url}`);
  return response.text();
}

function fileKind(path: string): FileKind {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "tsx") return "tsx";
  if (extension === "jsx") return "jsx";
  if (extension === "mjs") return "mjs";
  if (extension === "cjs") return "cjs";
  if (extension === "ts") return "ts";
  return "js";
}

function countMatches(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

function getLayer(path: string) {
  const first = path.split("/")[0]?.toLowerCase() ?? "root";
  if (["src", "app", "client"].includes(first)) return "product";
  if (["server", "api", "backend"].includes(first)) return "server";
  if (["components", "ui", "features", "pages"].includes(first)) return "interface";
  if (["lib", "utils", "shared", "hooks"].includes(first)) return "shared";
  if (["config", "scripts", "tools"].includes(first)) return "tooling";
  return first === "root" ? "root" : "other";
}

function resolveImport(from: string, specifier: string, available: Set<string>) {
  if (!specifier.startsWith(".")) return null;
  const base = from.split("/").slice(0, -1).concat(specifier.split("/")).join("/");
  const normalized = base.split("/").reduce<string[]>((parts, segment) => {
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
    `${normalized}/index.jsx`,
  ];
  return candidates.find(candidate => available.has(candidate)) ?? null;
}

function extractImports(source: string) {
  const imports = new Set<string>();
  const patterns = [
    /\bimport\s+(?:[^'";]+?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:[^'";]+?\s+from\s+)["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    Array.from(source.matchAll(pattern)).forEach(match => imports.add(match[1]));
  }
  return Array.from(imports);
}

function extractExports(source: string) {
  return countMatches(source, /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\b/g)
    + countMatches(source, /\bexport\s*\{[^}]+\}/g);
}

function extractFunctions(source: string) {
  return countMatches(source, /\b(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g)
    + countMatches(source, /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)
    + countMatches(source, /\b(?:get|set)\s+[A-Za-z_$][\w$]*\s*\(/g);
}

function calculateComplexity(source: string) {
  return 1 + countMatches(source, /\b(?:if|else if|for|while|catch|case)\b/g)
    + countMatches(source, /\b(?:switch|try)\b/g)
    + countMatches(source, /&&|\|\||\?\?/g)
}

function summarize(path: string, source: string, imports: number, functions: number, complexity: number) {
  const name = path.split("/").pop() ?? path;
  const role = path.includes("component") || path.includes("pages") ? "UI surface" : path.includes("test") ? "test module" : "module";
  return `${name} is a ${role} with ${imports} local import${imports === 1 ? "" : "s"}, ${functions} function${functions === 1 ? "" : "s"}, and a complexity score of ${complexity}.`;
}

function stronglyConnectedComponents(nodes: string[], adjacency: Map<string, string[]>) {
  const indexByNode = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  let index = 0;

  const visit = (node: string) => {
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
      const component: string[] = [];
      let member = "";
      do {
        member = stack.pop() ?? "";
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      if (component.length > 1) components.push(component.sort());
    }
  };

  nodes.forEach(node => {
    if (!indexByNode.has(node)) visit(node);
  });
  return components;
}

export async function analyzeRepository(repositoryUrl: string): Promise<RepositoryAnalysis> {
  const { owner, name } = parseRepoUrl(repositoryUrl);
  const repo = await githubJson<GitHubRepo>(`/repos/${owner}/${name}`);
  const tree = await githubJson<{ tree: GitHubTreeEntry[]; truncated?: boolean }>(`/repos/${owner}/${name}/git/trees/${repo.default_branch}?recursive=1`);

  const entries = tree.tree
    .filter(entry => entry.type === "blob" && CODE_EXTENSIONS.test(entry.path) && !IGNORED_DIRS.test(entry.path))
    .sort((a, b) => (a.path.length - b.path.length) || a.path.localeCompare(b.path))
    .slice(0, MAX_FILES);
  const sourceByPath: Record<string, string> = {};

  await Promise.all(entries.map(async entry => {
    if ((entry.size ?? 0) > MAX_FILE_BYTES || !entry.url) return;
    try {
      sourceByPath[entry.path] = await fetchText(entry.url);
    } catch {
      // A single unreadable file should not prevent the rest of the repository from being understood.
    }
  }));

  const paths = Object.keys(sourceByPath).sort();
  const available = new Set(paths);
  const rawModules = new Map<string, { imports: string[]; exports: number; functions: number; complexity: number; lines: number }>();
  const edges: AnalysisEdge[] = [];
  const adjacency = new Map<string, string[]>();
  const incoming = new Map<string, number>();

  for (const path of paths) {
    const source = sourceByPath[path];
    const imports = extractImports(source);
    const resolvedImports = imports.map(specifier => ({ specifier, target: resolveImport(path, specifier, available) })).filter(item => item.target);
    rawModules.set(path, {
      imports: resolvedImports.map(item => item.target as string),
      exports: extractExports(source),
      functions: extractFunctions(source),
      complexity: calculateComplexity(source),
      lines: source.split(/\r?\n/).length,
    });
    adjacency.set(path, resolvedImports.map(item => item.target as string));
    for (const item of resolvedImports) {
      edges.push({ source: path, target: item.target as string, specifier: item.specifier });
      incoming.set(item.target as string, (incoming.get(item.target as string) ?? 0) + 1);
    }
  }

  const nodes: AnalysisNode[] = paths.map(path => {
    const module = rawModules.get(path)!;
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
      summary: summarize(path, sourceByPath[path], module.imports.length, module.functions, module.complexity),
    };
  });

  const cycles = stronglyConnectedComponents(paths, adjacency).map((members, index): DependencyCycle => ({
    id: `cycle-${index + 1}`,
    members,
    severity: members.length >= 3 ? "critical" : "high",
    label: members.length >= 3 ? "deep cycle" : "circular import",
  }));
  const cycleMembers = new Set(cycles.flatMap(cycle => cycle.members));
  const adjustedNodes = nodes.map(node => cycleMembers.has(node.path) ? { ...node, risk: Math.min(99, node.risk + 18) } : node);
  const hotspots = [...adjustedNodes]
    .sort((a, b) => b.risk - a.risk || b.complexity - a.complexity)
    .slice(0, 5);

  return {
    repo: {
      owner,
      name: repo.name,
      url: repo.html_url,
      branch: repo.default_branch,
      description: repo.description,
      stars: repo.stargazers_count,
      lastCommit: repo.pushed_at,
    },
    stats: {
      files: adjustedNodes.length,
      lines: adjustedNodes.reduce((total, node) => total + node.lines, 0),
      imports: adjustedNodes.reduce((total, node) => total + node.imports, 0),
      exports: adjustedNodes.reduce((total, node) => total + node.exports, 0),
      functions: adjustedNodes.reduce((total, node) => total + node.functions, 0),
      edges: edges.length,
      cycles: cycles.length,
      hotspots: hotspots.length,
    },
    nodes: adjustedNodes,
    edges,
    cycles,
    hotspots,
    sourceByPath,
    generatedAt: new Date().toISOString(),
  };
}
