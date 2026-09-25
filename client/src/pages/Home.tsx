import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Braces,
  CircleAlert,
  FileCode2,
  FolderTree,
  GitBranch,
  Github,
  LoaderCircle,
  MessageSquareText,
  Network,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
  Waypoints,
  X,
} from "lucide-react";
import ArchitectureGraph from "@/components/ArchitectureGraph";
import { trpc } from "@/lib/trpc";
import type { AnalysisNode, RepositoryAnalysis } from "@shared/ghost";

type AssistantMessage = { role: "user" | "ghost"; content: string };

const starterQuestions = [
  "What is the architectural role of this file?",
  "Which modules would be affected if I change this file?",
  "Where are the highest-risk dependency boundaries?",
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatRelativeDate(date: string | null) {
  if (!date) return "unknown";
  const days = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function riskLabel(risk: number) {
  if (risk >= 75) return "critical";
  if (risk >= 48) return "elevated";
  return "stable";
}

function rateLimitGuidance(data?: { code?: string; retryAt?: number; retryAfterSeconds?: number }) {
  if (data?.code !== "TOO_MANY_REQUESTS") return null;
  if (typeof data.retryAt === "number" && Number.isFinite(data.retryAt) && data.retryAt > 0) {
    return `GitHub is rate-limited. Retry after ${new Date(data.retryAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
  }
  if (typeof data.retryAfterSeconds === "number" && Number.isFinite(data.retryAfterSeconds) && data.retryAfterSeconds >= 0) {
    return data.retryAfterSeconds === 0
      ? "GitHub rate limit reset is due now. Retry the scan."
      : `GitHub is rate-limited. Retry in about ${Math.ceil(data.retryAfterSeconds / 60)} minute${data.retryAfterSeconds < 120 ? "" : "s"}.`;
  }
  return "GitHub is rate-limited. Try again later.";
}

function RiskBar({ value }: { value: number }) {
  return <span className="risk-bar"><i style={{ width: `${Math.max(6, value)}%` }} /></span>;
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/facebook/react");
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [question, setQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);

  const analyzeMutation = trpc.ghost.analyze.useMutation({
    onSuccess: data => {
      setAnalysis(data);
      setSelectedPath(data.hotspots[0]?.path ?? data.nodes[0]?.path);
      setAssistantMessages([]);
      window.setTimeout(() => document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    },
  });

  const askMutation = trpc.ghost.ask.useMutation({
    onSuccess: data => {
      setAssistantMessages(current => [...current, { role: "ghost", content: data.answer }]);
    },
  });

  const analysisErrorData = analyzeMutation.error?.data as { code?: string; retryAt?: number; retryAfterSeconds?: number } | undefined;
  const importErrorMessage = rateLimitGuidance(analysisErrorData) ?? analyzeMutation.error?.message;

  const selectedNode = useMemo<AnalysisNode | undefined>(() => analysis?.nodes.find(node => node.path === selectedPath), [analysis, selectedPath]);
  const dependencies = useMemo(() => analysis?.edges.filter(edge => edge.source === selectedPath).map(edge => edge.target) ?? [], [analysis, selectedPath]);
  const dependents = useMemo(() => analysis?.edges.filter(edge => edge.target === selectedPath).map(edge => edge.source) ?? [], [analysis, selectedPath]);
  const graphNodes = useMemo(() => analysis?.nodes.slice(0, 100) ?? [], [analysis]);

  const analysisContext = useMemo(() => {
    if (!analysis) return "";
    const cycleText = analysis.cycles.length
      ? analysis.cycles.map(cycle => `${cycle.severity}: ${cycle.members.join(" -> ")}`).join("; ")
      : "none detected";
    return [
      `Repository: ${analysis.repo.owner}/${analysis.repo.name} on ${analysis.repo.branch}.`,
      `Stats: ${analysis.stats.files} files, ${analysis.stats.lines} lines, ${analysis.stats.edges} local dependency edges, ${analysis.stats.cycles} cycles.`,
      `Hotspots: ${analysis.hotspots.map(node => `${node.path} (risk ${node.risk}/99, complexity ${node.complexity})`).join("; ") || "none detected"}.`,
      `Cycles: ${cycleText}.`,
      selectedNode ? `Selected file: ${selectedNode.path}; layer ${selectedNode.layer}; ${selectedNode.imports} imports; ${selectedNode.exports} exports; ${selectedNode.functions} functions; ${selectedNode.lines} lines; risk ${selectedNode.risk}/99.` : "No file selected.",
      `Direct dependencies of selected file: ${dependencies.join(", ") || "none resolved"}.`,
      `Direct dependents of selected file: ${dependents.join(", ") || "none resolved"}.`,
    ].join("\n");
  }, [analysis, selectedNode, dependencies, dependents]);

  const handleAnalyze = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repoUrl.trim() || analyzeMutation.isPending) return;
    analyzeMutation.mutate({ url: repoUrl.trim() });
  };

  const askQuestion = (text: string) => {
    if (!analysis || !text.trim() || askMutation.isPending) return;
    setAssistantMessages(current => [...current, { role: "user", content: text.trim() }]);
    setQuestion("");
    askMutation.mutate({
      repository: `${analysis.repo.owner}/${analysis.repo.name}`,
      question: text.trim(),
      selectedFile: selectedPath,
      selectedSource: selectedPath ? analysis.sourceByPath[selectedPath]?.slice(0, 12000) : undefined,
      context: analysisContext,
    });
  };

  const selectFile = (path: string) => {
    setSelectedPath(path);
    document.getElementById("file-inspector")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className="ghost-app">
      <aside className="rail">
        <div className="brand-lockup">
          <div className="brand-mark">G</div>
          <div><strong>GHOST</strong><span>codebase intelligence</span></div>
        </div>
        <div className="rail-rule" />
        <nav className="rail-nav" aria-label="Primary navigation">
          <span className="rail-caption">WORKSPACE</span>
          <a href="#import" className="rail-link active"><ScanSearch size={15} />Import</a>
          <a href="#explorer" className="rail-link"><Network size={15} />Explorer</a>
          <a href="#signals" className="rail-link"><ShieldAlert size={15} />Signals <span className="rail-count">{analysis?.stats.hotspots ?? "—"}</span></a>
          <a href="#assistant" className="rail-link"><MessageSquareText size={15} />Assistant</a>
        </nav>
        <div className="rail-spacer" />
        <div className="engine-status"><i /> <span>ANALYSIS ENGINE<br /><b>ONLINE / V1.0</b></span></div>
        <div className="rail-footer"><TerminalSquare size={13} /> deterministic by default</div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="crumb"><span>GHOST</span><span>/</span><b>{analysis ? `${analysis.repo.owner}/${analysis.repo.name}` : "new workspace"}</b></div>
          <div className="topbar-actions">
            {analysis && <span className="commit-note"><GitBranch size={13} /> {analysis.repo.branch} · updated {formatRelativeDate(analysis.repo.lastCommit)}</span>}
            <span className="status-pill"><i /> live analysis</span>
          </div>
        </header>

        <section className="hero" id="import">
          <div className="hero-copy">
            <div className="eyebrow"><span>01</span> / REPOSITORY IMPORT</div>
            <h1>See the code<br /><em>behind the code.</em></h1>
            <p>GHOST turns unfamiliar JavaScript and TypeScript repositories into a navigable system of dependencies, risk, and intent.</p>
            <form className="import-form" onSubmit={handleAnalyze}>
              <Github size={18} />
              <input aria-label="Public GitHub repository URL" value={repoUrl} onChange={event => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repository" />
              <button className="lime-button" type="submit" disabled={analyzeMutation.isPending}>
                {analyzeMutation.isPending ? <LoaderCircle className="spin" size={16} /> : <ArrowUpRight size={16} />}
                {analyzeMutation.isPending ? "Scanning" : "Analyze repo"}
              </button>
            </form>
            {analyzeMutation.error && <div className="form-error"><CircleAlert size={15} />{importErrorMessage}</div>}
            <div className="micro-proof"><span><i />public repos only</span><span><i />no source leaves your session</span><span><i />deterministic import graph</span></div>
          </div>
          <div className="hero-signal" aria-label="Analysis promise">
            <div className="signal-grid" />
            <div className="signal-orbit orbit-a" /><div className="signal-orbit orbit-b" />
            <div className="signal-core"><Braces size={20} /><span>map the<br /><b>unknown</b></span></div>
            <span className="signal-label label-top">IMPORT GRAPH</span><span className="signal-label label-bottom">TRACE / EXPLAIN / CHANGE</span>
          </div>
        </section>

        <section className="metric-strip" aria-label="Repository statistics">
          <div className="metric-intro"><span className="section-kicker">CURRENT READOUT</span><span>{analysis ? `scan completed ${new Date(analysis.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "awaiting a repository"}</span></div>
          <div className="metric"><span>FILES</span><strong>{analysis ? formatNumber(analysis.stats.files) : "—"}</strong></div>
          <div className="metric"><span>LINES</span><strong>{analysis ? formatNumber(analysis.stats.lines) : "—"}</strong></div>
          <div className="metric"><span>EDGES</span><strong>{analysis ? formatNumber(analysis.stats.edges) : "—"}</strong></div>
          <div className="metric"><span>FUNCTIONS</span><strong>{analysis ? formatNumber(analysis.stats.functions) : "—"}</strong></div>
          <div className="metric risk-metric"><span>RISK SIGNALS</span><strong>{analysis ? analysis.stats.hotspots : "—"}</strong><small>{analysis ? `${analysis.stats.cycles} cycles` : "run a scan"}</small></div>
        </section>

        {!analysis && !analyzeMutation.isPending && (
          <section className="empty-readout">
            <div className="empty-index">00</div>
            <div><span className="section-kicker">NO REPOSITORY LOADED</span><h2>Start with a public GitHub URL.</h2><p>The first scan fetches the repository tree, reads supported source files, resolves relative imports, and builds the explorer from that evidence.</p></div>
            <div className="empty-notes"><span><b>01</b> import source</span><span><b>02</b> resolve edges</span><span><b>03</b> inspect impact</span></div>
          </section>
        )}

        {analysis && (
          <>
            <section className="workbench-section" id="explorer">
              <div className="section-heading"><div><div className="eyebrow"><span>02</span> / ARCHITECTURE EXPLORER</div><h2>{analysis.repo.name}<span> / {analysis.repo.owner}</span></h2></div><a className="text-link" href={analysis.repo.url} target="_blank" rel="noreferrer"><Github size={15} /> view on GitHub <ArrowUpRight size={14} /></a></div>
              <div className="workbench surface">
                <div className="graph-pane"><ArchitectureGraph nodes={graphNodes} edges={analysis.edges} selectedPath={selectedPath} onSelect={selectFile} /><div className="graph-footnote">showing {graphNodes.length} of {analysis.nodes.length} source modules · click a node to trace impact</div></div>
                <aside className="inspector" id="file-inspector">
                  <div className="inspector-head"><span className="section-kicker">FILE INSPECTOR</span><span className="mini-badge">{selectedNode ? riskLabel(selectedNode.risk) : "—"}</span></div>
                  {selectedNode ? (
                    <>
                      <div className="file-title"><FileCode2 size={18} /><div><h3>{selectedNode.path.split("/").pop()}</h3><span>{selectedNode.path}</span></div></div>
                      <p className="file-summary">{selectedNode.summary}</p>
                      <div className="file-metrics"><div><b>{selectedNode.lines}</b><span>lines</span></div><div><b>{selectedNode.functions}</b><span>functions</span></div><div><b>{selectedNode.complexity}</b><span>complexity</span></div></div>
                      <div className="impact-block"><div className="impact-heading"><span>CHANGE IMPACT</span><b>{dependents.length + dependencies.length} links</b></div><div className="impact-grid"><div><small>depends on</small>{dependencies.length ? dependencies.slice(0, 4).map(path => <button key={path} onClick={() => selectFile(path)}>{path.split("/").pop()} <ArrowDownRight size={12} /></button>) : <em>none resolved</em>}</div><div><small>used by</small>{dependents.length ? dependents.slice(0, 4).map(path => <button key={path} onClick={() => selectFile(path)}>{path.split("/").pop()} <ArrowUpRight size={12} /></button>) : <em>none resolved</em>}</div></div></div>
                      <div className="source-preview"><div className="source-head"><span>source excerpt</span><span>{selectedNode.kind.toUpperCase()}</span></div><pre>{(analysis.sourceByPath[selectedNode.path] ?? "No source text available.").split("\n").slice(0, 22).map((line, index) => <code key={`${index}-${line}`}><i>{String(index + 1).padStart(2, "0")}</i>{line || " "}</code>)}</pre></div>
                    </>
                  ) : <div className="inspector-empty"><FolderTree size={22} /><p>Select a node to inspect its direct dependencies and potential impact.</p></div>}
                </aside>
              </div>
            </section>

            <section className="signals-section" id="signals">
              <div className="section-heading compact"><div><div className="eyebrow"><span>03</span> / RISK SIGNALS</div><h2>Where the graph <em>bends.</em></h2></div><span className="section-note">deterministic heuristics · no guesses</span></div>
              <div className="signals-grid">
                <div className="surface signal-list"><div className="list-head"><span>COMPLEXITY HOTSPOTS</span><span>RISK / 99</span></div>{analysis.hotspots.map((node, index) => <button key={node.path} className="signal-row" onClick={() => selectFile(node.path)}><span className="rank">0{index + 1}</span><span className="signal-file"><b>{node.path.split("/").pop()}</b><small>{node.path}</small></span><RiskBar value={node.risk} /><strong className={node.risk >= 75 ? "critical" : ""}>{node.risk}</strong></button>)}{!analysis.hotspots.length && <div className="no-signals">No hotspots surfaced in the supported source set.</div>}</div>
                <div className="surface cycle-panel"><div className="list-head"><span>CIRCULAR DEPENDENCIES</span><span>{analysis.cycles.length.toString().padStart(2, "0")}</span></div>{analysis.cycles.length ? analysis.cycles.map(cycle => <div className="cycle-row" key={cycle.id}><div className="cycle-icon"><RefreshCw size={14} /></div><div><b>{cycle.label}</b><span>{cycle.members.join("  ↔  ")}</span></div><span className={`severity ${cycle.severity}`}>{cycle.severity}</span></div>) : <div className="clean-state"><Sparkles size={17} /><span>No cycles detected in resolved relative imports.</span></div>}</div>
              </div>
            </section>

            <section className="assistant-section" id="assistant">
              <div className="assistant-copy"><div className="eyebrow"><span>04</span> / GHOST ASSISTANT</div><h2>Ask the<br /><em>evidence.</em></h2><p>The assistant sees the current scan, selected file, source excerpt, and resolved impact paths. It is instructed to stay inside those boundaries.</p><div className="assistant-stamp"><Bot size={15} /><span>source-grounded<br /><b>analysis context attached</b></span></div></div>
              <div className="assistant-panel surface">
                <div className="assistant-panel-head"><div><span className="live-dot" /> GHOST / ARCHITECTURE COPILOT</div><span>{selectedNode ? selectedNode.path : "repository overview"}</span></div>
                <div className="chat-thread">
                  {!assistantMessages.length && <div className="chat-welcome"><Sparkles size={18} /><p>Ask a question about the repository or selected file. Answers are grounded in the scan, not imagined.</p></div>}
                  {assistantMessages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span className="chat-avatar">{message.role === "ghost" ? "G" : "you"}</span><div>{message.role === "ghost" ? <Streamdown>{message.content}</Streamdown> : <p>{message.content}</p>}</div></div>)}
                  {askMutation.isPending && <div className="chat-message ghost"><span className="chat-avatar">G</span><div className="thinking"><i /><i /><i /></div></div>}
                </div>
                {!assistantMessages.length && <div className="starter-row">{starterQuestions.map(item => <button key={item} onClick={() => askQuestion(item)}>{item}<ArrowUpRight size={13} /></button>)}</div>}
                <form className="assistant-input" onSubmit={event => { event.preventDefault(); askQuestion(question); }}><MessageSquareText size={16} /><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about architecture, risk, or change impact…" /><button type="submit" disabled={!question.trim() || askMutation.isPending}><ArrowUpRight size={16} /></button></form>
              </div>
            </section>
          </>
        )}

        <footer className="footer"><span>GHOST / CODEBASE INTELLIGENCE</span><span>STATIC ANALYSIS FOR THE UNKNOWN</span><a href="#import"><Search size={13} /> new scan</a></footer>
      </main>
    </div>
  );
}
