import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
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
} from "lucide-react";
import ArchitectureGraph from "@/components/ArchitectureGraph";
import SignalField from "@/components/SignalField";
import { getRetryDeadline, rateLimitGuidance, type RateLimitData } from "@/lib/retry";
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

function RiskBar({ value }: { value: number }) {
  return (
    <span className="risk-bar">
      <i style={{ width: `${Math.max(6, value)}%` }} />
    </span>
  );
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/facebook/react");
  const [analysis, setAnalysis] = useState<RepositoryAnalysis | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | undefined>();
  const [question, setQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [lastAttemptedUrl, setLastAttemptedUrl] = useState("");
  const [retryRemainingMs, setRetryRemainingMs] = useState(0);
  const [activeSection, setActiveSection] = useState("import");
  const [scrollProgress, setScrollProgress] = useState(0);

  const analyzeMutation = trpc.ghost.analyze.useMutation({
    onSuccess: data => {
      setAnalysis(data);
      setSelectedPath(data.hotspots[0]?.path ?? data.nodes[0]?.path);
      setAssistantMessages([]);
      window.setTimeout(() =>
        document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      70);
    },
  });

  const askMutation = trpc.ghost.ask.useMutation({
    onSuccess: data => {
      setAssistantMessages(current => [...current, { role: "ghost", content: data.answer }]);
    },
  });

  const analysisErrorData = analyzeMutation.error?.data as RateLimitData | undefined;
  const retryDeadline = useMemo(() => getRetryDeadline(analysisErrorData), [analysisErrorData]);
  const isRateLimited = analysisErrorData?.code === "TOO_MANY_REQUESTS";
  const retryAvailable = !retryDeadline || retryRemainingMs <= 0;
  const importErrorMessage =
    rateLimitGuidance(analysisErrorData, retryRemainingMs) ?? analyzeMutation.error?.message;

  useEffect(() => {
    if (!isRateLimited || !retryDeadline) {
      setRetryRemainingMs(0);
      return;
    }
    const updateRemaining = () => setRetryRemainingMs(Math.max(0, retryDeadline - Date.now()));
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [isRateLimited, retryDeadline]);

  useEffect(() => {
    const update = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      setScrollProgress(Math.min(1, Math.max(0, window.scrollY / max)));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [analysis]);

  useEffect(() => {
    const ids = ["import", "explorer", "signals", "assistant"];
    const sections = ids
      .map(id => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;

    const sectionObserver = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -58%", threshold: [0.08, 0.25, 0.55, 0.85] },
    );

    const revealObserver = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );

    sections.forEach(section => {
      sectionObserver.observe(section);
      revealObserver.observe(section);
      section.querySelectorAll("[data-reveal]").forEach(node => revealObserver.observe(node));
    });

    return () => {
      sectionObserver.disconnect();
      revealObserver.disconnect();
    };
  }, [analysis]);

  const selectedNode = useMemo<AnalysisNode | undefined>(
    () => analysis?.nodes.find(node => node.path === selectedPath),
    [analysis, selectedPath],
  );
  const dependencies = useMemo(
    () => analysis?.edges.filter(edge => edge.source === selectedPath).map(edge => edge.target) ?? [],
    [analysis, selectedPath],
  );
  const dependents = useMemo(
    () => analysis?.edges.filter(edge => edge.target === selectedPath).map(edge => edge.source) ?? [],
    [analysis, selectedPath],
  );
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
      selectedNode
        ? `Selected file: ${selectedNode.path}; layer ${selectedNode.layer}; ${selectedNode.imports} imports; ${selectedNode.exports} exports; ${selectedNode.functions} functions; ${selectedNode.lines} lines; risk ${selectedNode.risk}/99.`
        : "No file selected.",
      `Direct dependencies of selected file: ${dependencies.join(", ") || "none resolved"}.`,
      `Direct dependents of selected file: ${dependents.join(", ") || "none resolved"}.`,
    ].join("\n");
  }, [analysis, selectedNode, dependencies, dependents]);

  const handleAnalyze = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!repoUrl.trim() || analyzeMutation.isPending) return;
    const url = repoUrl.trim();
    setLastAttemptedUrl(url);
    analyzeMutation.mutate({ url });
  };

  const handleRetry = () => {
    if (!lastAttemptedUrl || analyzeMutation.isPending || !retryAvailable) return;
    analyzeMutation.mutate({ url: lastAttemptedUrl });
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
    window.setTimeout(() => document.getElementById("file-inspector")?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 20);
  };

  return (
    <div className={`ghost-app ${analysis ? "has-analysis" : "idle-workspace"}`} style={{ "--scroll-p": scrollProgress } as React.CSSProperties}>
      <div className="grain" aria-hidden="true" />
      <div className="scanline" aria-hidden="true" />

      <aside className="rail">
        <div className="brand-lockup">
          <div className="brand-mark">G</div>
          <div>
            <strong>GHOST</strong>
            <span>codebase intelligence</span>
          </div>
        </div>

        <div className="rail-header-line" />
        <div className="rail-meta">
          <span>WORKSPACE INDEX</span>
          <b>01—04</b>
        </div>

        <nav className="rail-nav" aria-label="Primary navigation">
          <span className="rail-caption">NAVIGATE</span>
          <a href="#import" className={`rail-link ${activeSection === "import" ? "active" : ""}`}>
            <b>01</b><ScanSearch size={14} />Import
          </a>
          <a href="#explorer" className={`rail-link ${activeSection === "explorer" ? "active" : ""}`}>
            <b>02</b><Network size={14} />Explorer
          </a>
          <a href="#signals" className={`rail-link ${activeSection === "signals" ? "active" : ""}`}>
            <b>03</b><ShieldAlert size={14} />Signals <span className="rail-count">{analysis?.stats.hotspots ?? "—"}</span>
          </a>
          <a href="#assistant" className={`rail-link ${activeSection === "assistant" ? "active" : ""}`}>
            <b>04</b><MessageSquareText size={14} />Assistant
          </a>
        </nav>

        <div className="rail-spacer" />

        <div className="rail-meter">
          <div className="rail-meter-head"><span>ANALYSIS ENGINE</span><b>{Math.round(scrollProgress * 100).toString().padStart(2, "0")}%</b></div>
          <div className="meter-track"><i style={{ width: `${Math.max(8, Math.round(scrollProgress * 100))}%` }} /></div>
          <div className="rail-meter-foot"><span><i /> ONLINE / V1.0</span><span>DETERMINISTIC</span></div>
        </div>

        <div className="rail-footer"><TerminalSquare size={12} /> static analysis for the unknown</div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="crumb"><span>GHOST</span><span>/</span><b>{analysis ? `${analysis.repo.owner}/${analysis.repo.name}` : "NEW WORKSPACE"}</b></div>
          <div className="topbar-actions">
            {analysis && <span className="commit-note"><GitBranch size={12} /> {analysis.repo.branch} · updated {formatRelativeDate(analysis.repo.lastCommit)}</span>}
            <span className="status-pill"><i /> {analysis ? "analysis live" : "engine ready"}</span>
          </div>
        </header>

        <section className="hero chapter-section" id="import">
          <div className="hero-copy" data-reveal>
            <div className="eyebrow"><span>01</span> / REPOSITORY IMPORT <b className="hero-index">FIELD 01 / 04</b></div>
            <div className="hero-title-wrap">
              <div className="hero-side-index">GHOST / 001</div>
              <h1>Read the <em>hidden</em><br />system.</h1>
            </div>
            <p className="hero-lead">Turn an unfamiliar JavaScript or TypeScript repository into a navigable system of dependencies, risk, and intent.</p>

            <form className="import-form" onSubmit={handleAnalyze}>
              <div className="input-prefix"><Github size={16} /><span>repo</span></div>
              <input aria-label="Public GitHub repository URL" value={repoUrl} onChange={event => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repository" />
              <button className="lime-button" type="submit" disabled={analyzeMutation.isPending}>
                {analyzeMutation.isPending ? <LoaderCircle className="spin" size={15} /> : <ArrowUpRight size={15} />}
                {analyzeMutation.isPending ? "Scanning" : "Analyze repo"}
              </button>
            </form>

            {analyzeMutation.error && (isRateLimited ? (
              <div className="rate-limit-retry" role="alert">
                <div className="rate-limit-copy"><CircleAlert size={14} /><span>{importErrorMessage}</span></div>
                <button className="retry-button" type="button" onClick={handleRetry} disabled={analyzeMutation.isPending || !lastAttemptedUrl || !retryAvailable}>
                  {analyzeMutation.isPending ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />}
                  {analyzeMutation.isPending ? "Retrying" : retryAvailable ? "Retry scan" : "Retry locked"}
                </button>
              </div>
            ) : (
              <div className="form-error"><CircleAlert size={14} /><span>{importErrorMessage}</span></div>
            ))}

            <div className="micro-proof">
              <span><i /> public repos only</span>
              <span><i /> source stays in session</span>
              <span><i /> deterministic import graph</span>
            </div>
          </div>

          <SignalField progress={scrollProgress} />
          <div className="hero-decor hero-decor-a" aria-hidden="true">SCAN / 0001</div>
          <div className="hero-decor hero-decor-b" aria-hidden="true">NODE FIELD / ACTIVE</div>
          <div className="hero-corner hero-corner-a" aria-hidden="true" />
          <div className="hero-corner hero-corner-b" aria-hidden="true" />
        </section>

        <section className="metric-strip" aria-label="Repository statistics" data-reveal>
          <div className="metric-intro">
            <span className="section-kicker">REPOSITORY PULSE</span>
            <span>{analysis ? `scan completed ${new Date(analysis.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "awaiting a repository"}</span>
          </div>
          <div className="metric"><span>FILES</span><strong>{analysis ? formatNumber(analysis.stats.files) : "—"}</strong><small>source set</small></div>
          <div className="metric"><span>LINES</span><strong>{analysis ? formatNumber(analysis.stats.lines) : "—"}</strong><small>indexed</small></div>
          <div className="metric"><span>EDGES</span><strong>{analysis ? formatNumber(analysis.stats.edges) : "—"}</strong><small>local imports</small></div>
          <div className="metric"><span>FUNCTIONS</span><strong>{analysis ? formatNumber(analysis.stats.functions) : "—"}</strong><small>detected</small></div>
          <div className="metric risk-metric"><span>RISK</span><strong>{analysis ? analysis.stats.hotspots : "—"}</strong><small>{analysis ? `${analysis.stats.cycles} cycles` : "run a scan"}</small></div>
        </section>

        {!analysis && !analyzeMutation.isPending && (
          <section className="empty-readout" data-reveal>
            <div className="empty-index">00</div>
            <div>
              <span className="section-kicker">NO REPOSITORY LOADED</span>
              <h2>Start with a public GitHub URL.</h2>
              <p>The first scan fetches the repository tree, reads supported source files, resolves relative imports, and builds the explorer from that evidence.</p>
            </div>
            <div className="empty-notes"><span><b>01</b> import source</span><span><b>02</b> resolve edges</span><span><b>03</b> inspect impact</span></div>
          </section>
        )}

        {analysis && (
          <>
            <section className="workbench-section chapter-section" id="explorer">
              <div className="section-heading" data-reveal>
                <div><div className="eyebrow"><span>02</span> / ARCHITECTURE EXPLORER</div><h2>{analysis.repo.name}<span> / {analysis.repo.owner}</span></h2></div>
                <a className="text-link" href={analysis.repo.url} target="_blank" rel="noreferrer"><Github size={14} /> view on GitHub <ArrowUpRight size={13} /></a>
              </div>

              <div className="graph-toolbar" data-reveal>
                <div className="graph-tabs">
                  <button className="graph-tab active" type="button"><Network size={12} /> Graph</button>
                  <button className="graph-tab" type="button"><ScanSearch size={12} /> Layers</button>
                  <button className="graph-tab" type="button"><RefreshCw size={12} /> Cycles <b>{analysis.cycles.length}</b></button>
                </div>
                <div className="graph-toolbar-meta"><span>{analysis.nodes.length} nodes</span><span>{analysis.edges.length} edges</span><span className="live-dot" /> topology linked</div>
              </div>

              <div className="workbench surface" data-reveal>
                <div className="graph-pane">
                  <div className="graph-pane-grid">
                    <aside className="source-tree" aria-label="Scanned source files">
                      <div className="source-tree-head"><span>FILES</span><span>{analysis.nodes.length}</span></div>
                      <div className="source-tree-search"><Search size={11} /><span>filter modules</span></div>
                      {analysis.nodes.slice(0, 18).map((node, index) => (
                        <button key={node.path} className={`source-tree-row ${node.path === selectedPath ? "selected" : ""}`} type="button" onClick={() => selectFile(node.path)}>
                          <span className="source-tree-index">{String(index + 1).padStart(2, "0")}</span>
                          <FileCode2 size={11} />
                          <span>{node.path.split("/").pop()}</span>
                          <small>{node.layer}</small>
                        </button>
                      ))}
                    </aside>
                    <div className="graph-stage"><ArchitectureGraph nodes={graphNodes} edges={analysis.edges} selectedPath={selectedPath} onSelect={selectFile} scrollProgress={scrollProgress} /></div>
                  </div>
                  <div className="graph-footnote"><span>showing {graphNodes.length} of {analysis.nodes.length} modules</span><span>click a node to trace impact</span><span>drag to orbit</span></div>
                </div>

                <aside className="inspector" id="file-inspector">
                  <div className="inspector-head"><span className="section-kicker">FILE INSPECTOR</span><span className="mini-badge">{selectedNode ? riskLabel(selectedNode.risk) : "—"}</span></div>
                  {selectedNode ? (
                    <>
                      <div className="file-title"><FileCode2 size={17} /><div><h3>{selectedNode.path.split("/").pop()}</h3><span>{selectedNode.path}</span></div></div>
                      <p className="file-summary">{selectedNode.summary}</p>
                      <div className="file-metrics"><div><b>{selectedNode.lines}</b><span>lines</span></div><div><b>{selectedNode.functions}</b><span>functions</span></div><div><b>{selectedNode.complexity}</b><span>complexity</span></div></div>
                      <div className="impact-block"><div className="impact-heading"><span>CHANGE IMPACT</span><b>{dependents.length + dependencies.length} links</b></div><div className="impact-grid"><div><small>depends on</small>{dependencies.length ? dependencies.slice(0, 4).map(path => <button key={path} type="button" onClick={() => selectFile(path)}>{path.split("/").pop()} <ArrowDownRight size={11} /></button>) : <em>none resolved</em>}</div><div><small>used by</small>{dependents.length ? dependents.slice(0, 4).map(path => <button key={path} type="button" onClick={() => selectFile(path)}>{path.split("/").pop()} <ArrowUpRight size={11} /></button>) : <em>none resolved</em>}</div></div></div>
                      <div className="source-preview"><div className="source-head"><span>source excerpt</span><span>{selectedNode.kind.toUpperCase()}</span></div><pre>{(analysis.sourceByPath[selectedNode.path] ?? "No source text available.").split("\n").slice(0, 22).map((line, index) => <code key={`${index}-${line}`}><i>{String(index + 1).padStart(2, "0")}</i>{line || " "}</code>)}</pre></div>
                    </>
                  ) : <div className="inspector-empty"><FolderTree size={20} /><p>Select a node to inspect its direct dependencies and potential impact.</p></div>}
                </aside>
              </div>
            </section>

            <section className="signals-section chapter-section" id="signals">
              <div className="section-heading compact" data-reveal><div><div className="eyebrow"><span>03</span> / RISK SIGNALS</div><h2>Where the graph <em>bends.</em></h2></div><span className="section-note">deterministic heuristics · no guesses</span></div>
              <div className="signals-grid">
                <div className="surface signal-list" data-reveal>
                  <div className="list-head"><span>COMPLEXITY HOTSPOTS</span><span>RISK / 99</span></div>
                  {analysis.hotspots.map((node, index) => <button key={node.path} type="button" className="signal-row" onClick={() => selectFile(node.path)}><span className="rank">{String(index + 1).padStart(2, "0")}</span><span className="signal-file"><b>{node.path.split("/").pop()}</b><small>{node.path}</small></span><RiskBar value={node.risk} /><strong className={node.risk >= 75 ? "critical" : ""}>{node.risk}</strong></button>)}
                  {!analysis.hotspots.length && <div className="no-signals">No hotspots surfaced in the supported source set.</div>}
                </div>
                <div className="surface cycle-panel" data-reveal>
                  <div className="list-head"><span>CIRCULAR DEPENDENCIES</span><span>{analysis.cycles.length.toString().padStart(2, "0")}</span></div>
                  {analysis.cycles.length ? analysis.cycles.map(cycle => <div className="cycle-row" key={cycle.id}><div className="cycle-icon"><RefreshCw size={13} /></div><div><b>{cycle.label}</b><span>{cycle.members.join("  ↔  ")}</span></div><span className={`severity ${cycle.severity}`}>{cycle.severity}</span></div>) : <div className="clean-state"><Sparkles size={16} /><span>No cycles detected in resolved relative imports.</span></div>}
                </div>
              </div>
            </section>

            <section className="assistant-section chapter-section" id="assistant">
              <div className="assistant-copy" data-reveal>
                <div className="eyebrow"><span>04</span> / GHOST ASSISTANT</div>
                <h2>Ask the<br /><em>evidence.</em></h2>
                <p>The assistant sees the current scan, selected file, source excerpt, and resolved impact paths. Answers are constrained by that evidence.</p>
                <div className="assistant-stamp"><Bot size={14} /><span>SOURCE-GROUNDED<br /><b>ANALYSIS CONTEXT ATTACHED</b></span></div>
              </div>
              <div className="assistant-panel surface" data-reveal>
                <div className="assistant-panel-head"><div><span className="live-dot" /> GHOST / ARCHITECTURE COPILOT</div><span>{selectedNode ? selectedNode.path : "repository overview"}</span></div>
                <div className="chat-thread">
                  {!assistantMessages.length && <div className="chat-welcome"><Sparkles size={17} /><p>Ask about architecture, risk, or change impact. Answers are grounded in the scan, not imagined.</p></div>}
                  {assistantMessages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span className="chat-avatar">{message.role === "ghost" ? "G" : "you"}</span><div>{message.role === "ghost" ? <Streamdown>{message.content}</Streamdown> : <p>{message.content}</p>}</div></div>)}
                  {askMutation.isPending && <div className="chat-message ghost"><span className="chat-avatar">G</span><div className="thinking"><i /><i /><i /></div></div>}
                </div>
                {!assistantMessages.length && <div className="starter-row">{starterQuestions.map(item => <button key={item} type="button" onClick={() => askQuestion(item)}>{item}<ArrowUpRight size={12} /></button>)}</div>}
                <form className="assistant-input" onSubmit={event => { event.preventDefault(); askQuestion(question); }}><MessageSquareText size={15} /><input value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about architecture, risk, or change impact…" /><button type="submit" disabled={!question.trim() || askMutation.isPending}><ArrowUpRight size={15} /></button></form>
              </div>
            </section>
          </>
        )}

        <footer className="footer"><span>GHOST / CODEBASE INTELLIGENCE</span><span>READ THE HIDDEN SYSTEM</span><a href="#import"><Search size={12} /> new scan</a></footer>
      </main>
    </div>
  );
}
