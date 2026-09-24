export type FileKind = "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs";

export type AnalysisNode = {
  id: string;
  path: string;
  kind: FileKind;
  layer: string;
  lines: number;
  imports: number;
  exports: number;
  functions: number;
  complexity: number;
  risk: number;
  summary: string;
};

export type AnalysisEdge = {
  source: string;
  target: string;
  specifier: string;
};

export type DependencyCycle = {
  id: string;
  members: string[];
  severity: "high" | "critical";
  label: string;
};

export type RepositoryAnalysis = {
  repo: {
    owner: string;
    name: string;
    url: string;
    branch: string;
    description: string | null;
    stars: number;
    lastCommit: string | null;
  };
  stats: {
    files: number;
    lines: number;
    imports: number;
    exports: number;
    functions: number;
    edges: number;
    cycles: number;
    hotspots: number;
  };
  nodes: AnalysisNode[];
  edges: AnalysisEdge[];
  cycles: DependencyCycle[];
  hotspots: AnalysisNode[];
  sourceByPath: Record<string, string>;
  generatedAt: string;
};

export type AssistantContext = {
  repository: string;
  question: string;
  selectedFile?: string;
  selectedSource?: string;
  context: string;
};

export type AssistantResponse = {
  answer: string;
};
