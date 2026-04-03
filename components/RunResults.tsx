"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSSE } from "@/lib/hooks/useSSE";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Highlight, themes } from "prism-react-renderer";
import type { Project, Agent, TestRun, SSEEvent } from "@/lib/types";
import {
  Play,
  RotateCcw,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Clock,
  ChevronDown,
  Trash2,
  ChevronRight,
  X,
  Code2,
  FileText,
  Copy,
  Check,
  Pencil,
} from "lucide-react";

interface StepResult {
  index: number;
  name: string;
  status: string;
  durationMs?: number;
  error?: string;
  screenshot?: string | null;
}

export default function RunResults({
  project,
}: {
  project: Project;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autorunTriggered = useRef(false);

  const paramAgent = searchParams.get("agent");

  const [agentsList, setAgentsList] = useState<Agent[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, TestRun[]>>({});
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runDuration, setRunDuration] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [historySteps, setHistorySteps] = useState<Record<string, StepResult[]>>({});
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});

  const onEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case "status":
        setStatusMessage(event.message);
        break;
      case "step":
        setSteps((prev) => [
          ...prev,
          {
            index: event.index,
            name: event.name,
            status: event.status,
            durationMs: event.durationMs,
            error: event.error,
            screenshot: event.screenshot,
          },
        ]);
        break;
      case "done":
        setRunStatus(event.status ?? null);
        setRunDuration(event.durationMs ?? null);
        setRunError(event.error ?? null);
        setIsRunning(false);
        setStatusMessage("");
        // Refresh run history
        refreshRuns();
        break;
      case "error":
        setRunStatus("error");
        setRunError(event.message);
        setIsRunning(false);
        setStatusMessage("");
        break;
    }
  }, []);

  const { isStreaming, error, start } = useSSE({
    url: "/api/run",
    onEvent,
  });

  // Load agents and runs client-side on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/agents?projectId=${encodeURIComponent(project.id)}`);
        if (!res.ok) return;
        const allAgents: Agent[] = await res.json();
        const withCode = allAgents.filter((a) => a.test_code);
        setAgentsList(withCode);
        setAgentNames(Object.fromEntries(withCode.map((a) => [a.id, a.name])));

        // Select agent from URL param or first available
        const selectId = paramAgent && withCode.some((a) => a.id === paramAgent)
          ? paramAgent
          : withCode[0]?.id ?? null;
        setSelectedAgentId(selectId);

        // Load runs for each agent
        for (const agent of withCode) {
          const runsRes = await fetch(`/api/test-runs?agentId=${encodeURIComponent(agent.id)}`);
          if (runsRes.ok) {
            const data = await runsRes.json();
            setRuns((prev) => ({ ...prev, [agent.id]: data }));
          }
        }
      } catch {
        // ignore
      }
      setAgentsLoaded(true);
      if (paramAgent) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();
  }, [project.id, paramAgent]);

  const refreshRuns = useCallback(async () => {
    for (const agent of agentsList) {
      try {
        const res = await fetch(`/api/test-runs?agentId=${encodeURIComponent(agent.id)}`);
        if (res.ok) {
          const data = await res.json();
          setRuns((prev) => ({ ...prev, [agent.id]: data }));
        }
      } catch {
        // ignore
      }
    }
  }, [agentsList]);

  const handleRun = (agentId: string) => {
    setSteps([]);
    setRunStatus(null);
    setRunDuration(null);
    setRunError(null);
    setStatusMessage("");
    setIsRunning(true);
    setRunningAgentId(agentId);
    setSelectedAgentId(agentId);
    start({ agentId });
  };

  const loadHistorySteps = async (runId: string) => {
    if (historySteps[runId]) {
      setExpandedHistory(expandedHistory === runId ? null : runId);
      return;
    }
    try {
      const res = await fetch(`/api/test-runs/${encodeURIComponent(runId)}/steps`);
      if (res.ok) {
        const data = await res.json();
        setHistorySteps((prev) => ({ ...prev, [runId]: data }));
      }
    } catch {
      // ignore
    }
    setExpandedHistory(runId);
  };

  const handleDeleteRun = async (runId: string, agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/test-runs/${runId}`, { method: "DELETE" });
      setRuns((prev) => ({
        ...prev,
        [agentId]: (prev[agentId] ?? []).filter((r) => r.id !== runId),
      }));
    } catch {
      // ignore
    }
  };

  const startEditName = (agentId: string, currentName: string) => {
    setEditingAgent(agentId);
    setEditName(currentName);
  };

  const saveAgentName = async (agentId: string) => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === agentNames[agentId]) {
      setEditingAgent(null);
      return;
    }
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      setAgentNames((prev) => ({ ...prev, [agentId]: trimmed }));
    } catch {
      // ignore
    }
    setEditingAgent(null);
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      router.refresh();
    } catch {
      // ignore
    }
  };

  const hasCurrentRun = steps.length > 0 || isRunning || runStatus;

  if (!agentsLoaded) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (agentsList.length === 0) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Test Runs — {project.name}</h1>
            <p className="text-sm text-muted-foreground">{project.dapp_url}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/projects/${project.id}/chat`)}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Create Test
          </Button>
        </div>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Code2 className="mx-auto mb-2 h-8 w-8" />
            No tests generated yet. Go to Chat to describe and generate a test.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Test Runs — {project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.dapp_url}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/projects/${project.id}/chat`)}
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          Create New Test
        </Button>
      </div>

      {/* Agent cards */}
      {agentsList.map((agent) => {
        const agentRuns = runs[agent.id] ?? [];
        const isSelected = selectedAgentId === agent.id;
        const isThisRunning = isRunning && runningAgentId === agent.id;
        const canRun = !isRunning && !isStreaming;

        return (
          <Card
            key={agent.id}
            className={`transition-colors ${isSelected ? "ring-1 ring-primary/30" : ""}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {editingAgent === agent.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={() => saveAgentName(agent.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveAgentName(agent.id);
                          if (e.key === "Escape") setEditingAgent(null);
                        }}
                        className="h-7 rounded border bg-background px-2 text-base font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      <CardTitle
                        className="group flex cursor-pointer items-center gap-1.5 text-base"
                        onClick={() => startEditName(agent.id, agentNames[agent.id] ?? agent.name)}
                      >
                        {agentNames[agent.id] ?? agent.name}
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </CardTitle>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {agent.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(agent.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {agent.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {agent.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setExpandedCode(expandedCode === agent.id ? null : agent.id)
                    }
                  >
                    <Code2 className="mr-1 h-3 w-3" />
                    Code
                  </Button>
                  {canRun && (
                    <Button size="sm" onClick={() => handleRun(agent.id)}>
                      <Play className="mr-1 h-3 w-3" />
                      Run
                    </Button>
                  )}
                  {isThisRunning && (
                    <Button size="sm" disabled>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Running
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteAgent(agent.id)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Code viewer */}
              {expandedCode === agent.id && agent.test_code && (
                <div className="space-y-3">
                  {agent.description && (
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">What this test does</p>
                      <p className="text-sm leading-relaxed">{agent.description}</p>
                    </div>
                  )}
                  <SyntaxCodeBlock code={agent.test_code} onClose={() => setExpandedCode(null)} />
                </div>
              )}

              {/* Current run for this agent */}
              {isThisRunning || (hasCurrentRun && runningAgentId === agent.id) ? (
                <div className="rounded-lg border bg-muted/10 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium">Current Run</span>
                    {runStatus && (
                      <div className="flex items-center gap-2">
                        <StatusBadge status={runStatus} />
                        {runDuration != null && (
                          <span className="text-sm text-muted-foreground">
                            {(runDuration / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {(isRunning || isStreaming) && statusMessage && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{statusMessage}</span>
                    </div>
                  )}

                  {error && (
                    <div className="mb-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  {runError && (
                    <div className="mb-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
                      <p className="mb-1 font-medium text-destructive">Test Error</p>
                      <pre className="whitespace-pre-wrap text-xs text-destructive/80">
                        {runError}
                      </pre>
                    </div>
                  )}

                  <div className="space-y-3">
                    {steps.map((step) => (
                      <StepCard
                        key={step.index}
                        step={step}
                        onScreenshotClick={setExpandedScreenshot}
                      />
                    ))}
                    {isRunning && steps.length === 0 && (
                      <div className="flex items-center justify-center py-6 text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Preparing test environment...
                      </div>
                    )}
                  </div>

                  {runStatus && !isRunning && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRun(agent.id)}
                        disabled={!canRun}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" />
                        Re-run
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Run history for this agent */}
              {agentRuns.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Run History ({agentRuns.length}{agentRuns.length > 5 ? ", showing last 5" : ""})
                  </p>
                  <div className="space-y-2">
                    {agentRuns.slice(0, 5).map((run) => (
                      <RunHistoryCard
                        key={run.id}
                        run={run}
                        isExpanded={expandedHistory === run.id}
                        steps={historySteps[run.id]}
                        onToggle={() => loadHistorySteps(run.id)}
                        onDelete={(e) => handleDeleteRun(run.id, agent.id, e)}
                        onScreenshotClick={setExpandedScreenshot}
                      />
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Screenshot modal */}
      {expandedScreenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setExpandedScreenshot(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <button
              onClick={() => setExpandedScreenshot(null)}
              className="absolute -right-3 -top-3 rounded-full bg-background p-1 shadow"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={expandedScreenshot}
              alt="Step screenshot"
              className="max-h-[90vh] rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StepCard({
  step,
  onScreenshotClick,
  compact = false,
}: {
  step: StepResult;
  onScreenshotClick: (src: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 ${
        step.status === "failed" ? "border-destructive/30 bg-destructive/5" : ""
      }`}
    >
      <StepStatusIcon status={step.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${compact ? "text-xs" : ""}`}>
            Step {step.index + 1}: {step.name}
          </span>
          {step.durationMs != null && (
            <span className="text-xs text-muted-foreground">
              {(step.durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        {step.error && (
          <p className="mt-1 text-xs text-destructive">{step.error}</p>
        )}
        {step.screenshot && (
          <button
            onClick={() => onScreenshotClick(step.screenshot!)}
            className="mt-2 overflow-hidden rounded border hover:opacity-80"
          >
            <img
              src={step.screenshot}
              alt={`Step ${step.index + 1} screenshot`}
              className={compact ? "max-h-24" : "max-h-40"}
            />
          </button>
        )}
      </div>
    </div>
  );
}

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />;
    case "failed":
      return <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />;
    case "skipped":
      return <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />;
    default:
      return <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "passed":
      return (
        <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/10">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Passed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" /> Failed
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive">
          <AlertCircle className="mr-1 h-3 w-3" /> Error
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Running
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function SyntaxCodeBlock({ code, onClose }: { code: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          <FileText className="mr-1 inline h-3 w-3" />
          test.spec.ts
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 gap-1 text-xs"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy
              </>
            )}
          </Button>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="max-h-[500px] overflow-auto">
        <Highlight theme={themes.nightOwl} code={code} language="typescript">
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre className="p-4 text-xs leading-5" style={{ ...style, margin: 0 }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  <span className="mr-4 inline-block w-6 select-none text-right text-muted-foreground/40">
                    {i + 1}
                  </span>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  );
}

function RunHistoryCard({
  run,
  isExpanded,
  steps,
  onToggle,
  onDelete,
  onScreenshotClick,
}: {
  run: TestRun;
  isExpanded: boolean;
  steps?: StepResult[];
  onToggle: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onScreenshotClick: (src: string) => void;
}) {
  return (
    <div className={`rounded-lg border ${isExpanded ? "ring-1 ring-primary/20" : ""}`}>
      <div className="flex items-center">
        <button
          onClick={onToggle}
          className="flex flex-1 items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <StatusBadge status={run.status} />
            <span className="text-xs text-muted-foreground">
              {new Date(run.started_at).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            {run.duration_ms != null && (
              <span className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {(run.duration_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </button>
        <button
          onClick={onDelete}
          className="mr-3 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {isExpanded && (
        <div className="border-t">
          {steps && steps.length > 0 ? (
            <div className="space-y-2 px-4 py-3">
              {steps.map((step: StepResult) => (
                <StepCard
                  key={step.index}
                  step={step}
                  onScreenshotClick={onScreenshotClick}
                  compact
                />
              ))}
            </div>
          ) : steps && steps.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              No step details recorded for this run.
            </div>
          ) : (
            <div className="flex items-center justify-center px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {run.error_summary && (
            <div className="border-t px-4 py-2 text-xs text-destructive">
              <span className="font-medium">Error: </span>{run.error_summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
