"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSSE } from "@/lib/hooks/useSSE";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Highlight, themes } from "prism-react-renderer";
import type { Project, Agent, TestRun, SSEEvent, ScheduleInterval, ScheduledReport } from "@/lib/types";
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
  Terminal,
  Wifi,
  CalendarClock,
  Timer,
} from "lucide-react";

interface StepResult {
  index: number;
  name: string;
  status: string;
  durationMs?: number;
  error?: string;
  screenshot?: string | null;
  consoleLogs?: Array<{ type: string; text: string; timestamp: number }>;
  networkErrors?: Array<{ url: string; status: number; method: string; timestamp: number }>;
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
  const [healingAttempts, setHealingAttempts] = useState<Array<{ steps: StepResult[]; message: string; failedSteps?: Array<{ name: string; error: string }> }>>([]);
  const [healedInfo, setHealedInfo] = useState<{ attempt: number; totalAttempts: number; passedSteps?: Array<{ name: string; durationMs: number }> } | null>(null);
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
  const [schedules, setSchedules] = useState<Record<string, { schedule: ScheduleInterval; schedule_enabled: boolean; next_run_at: string | null; last_scheduled_run_at: string | null }>>({});
  const [reports, setReports] = useState<Record<string, ScheduledReport[]>>({});
  const [expandedReports, setExpandedReports] = useState<string | null>(null);
  const [loadingReports, setLoadingReports] = useState<Record<string, boolean>>({});

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
            consoleLogs: event.consoleLogs,
            networkErrors: event.networkErrors,
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
      case "healing":
        // Save current failed steps as a healing attempt before clearing
        setHealingAttempts((prev) => [
          ...prev,
          { steps: [...steps], message: event.message, failedSteps: event.failedSteps },
        ]);
        setStatusMessage(event.message);
        break;
      case "healed":
        setHealedInfo({ attempt: event.attempt, totalAttempts: event.totalAttempts, passedSteps: event.passedSteps });
        break;
      case "clear_steps":
        setSteps([]);
        break;
      case "healing_error":
        setStatusMessage("");
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
        setSchedules(Object.fromEntries(withCode.map((a) => [a.id, {
          schedule: a.schedule ?? 'off',
          schedule_enabled: a.schedule_enabled ?? false,
          next_run_at: a.next_run_at ?? null,
          last_scheduled_run_at: a.last_scheduled_run_at ?? null,
        }])));

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
    setHealingAttempts([]);
    setHealedInfo(null);
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
      setAgentsList((prev) => prev.filter((a) => a.id !== agentId));
      setRuns((prev) => {
        const next = { ...prev };
        delete next[agentId];
        return next;
      });
      if (selectedAgentId === agentId) {
        setSelectedAgentId(null);
      }
    } catch {
      // ignore
    }
  };

  const handleScheduleChange = async (agentId: string, schedule: ScheduleInterval) => {
    const enabled = schedule !== 'off';
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule, schedule_enabled: enabled }),
      });
      setSchedules((prev) => ({
        ...prev,
        [agentId]: {
          ...prev[agentId],
          schedule,
          schedule_enabled: enabled,
          next_run_at: enabled ? new Date(Date.now() + getIntervalMs(schedule)).toISOString() : null,
        },
      }));
    } catch {
      // ignore
    }
  };

  const loadReports = async (agentId: string) => {
    if (expandedReports === agentId) {
      setExpandedReports(null);
      return;
    }
    if (!reports[agentId]) {
      setLoadingReports((prev) => ({ ...prev, [agentId]: true }));
      try {
        const res = await fetch(`/api/agents/${agentId}/reports`);
        if (res.ok) {
          const data = await res.json();
          setReports((prev) => ({ ...prev, [agentId]: data }));
        }
      } catch {
        // ignore
      }
      setLoadingReports((prev) => ({ ...prev, [agentId]: false }));
    }
    setExpandedReports(agentId);
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

              {/* Schedule controls */}
              <ScheduleSection
                agentId={agent.id}
                schedule={schedules[agent.id]}
                onScheduleChange={handleScheduleChange}
                onToggleReports={() => loadReports(agent.id)}
                reportsExpanded={expandedReports === agent.id}
                reports={reports[agent.id]}
                loadingReports={loadingReports[agent.id] ?? false}
              />

              {/* Current run for this agent */}
              {isThisRunning || (hasCurrentRun && runningAgentId === agent.id) ? (
                <div className="rounded-lg border bg-muted/10 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium">Current Run</span>
                    {runStatus && (
                      <div className="flex items-center gap-2">
                        <StatusBadge status={runStatus} />
                        {healedInfo && (
                          <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10">
                            Auto-healed (attempt {healedInfo.totalAttempts})
                          </Badge>
                        )}
                        {runDuration != null && (
                          <span className="text-sm text-muted-foreground">
                            {(runDuration / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Detailed run report — shown after run completes */}
                  {!isRunning && healedInfo && healingAttempts.length > 0 && (
                    <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
                      <p className="mb-3 text-sm font-medium text-blue-700">
                        Run Report — Self-healed after {healingAttempts.length} failed {healingAttempts.length === 1 ? "attempt" : "attempts"}
                      </p>
                      <div className="space-y-3">
                        {healingAttempts.map((attempt, i) => (
                          <div key={i} className="rounded border border-destructive/20 bg-destructive/5 p-3">
                            <div className="mb-1.5 flex items-center gap-2">
                              <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                              <span className="text-xs font-medium text-destructive">Attempt {i + 1} — Failed</span>
                            </div>
                            {attempt.failedSteps && attempt.failedSteps.length > 0 ? (
                              <div className="ml-6 space-y-1">
                                {attempt.failedSteps.map((fs, j) => (
                                  <div key={j} className="text-xs">
                                    <span className="font-medium text-foreground">{fs.name}</span>
                                    <p className="mt-0.5 text-destructive/80">{fs.error}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="ml-6 text-xs text-muted-foreground">
                                {attempt.steps[0]?.error?.replace(/\u001b\[\d+m/g, "")?.slice(0, 150) ?? "Unknown error"}
                              </p>
                            )}
                          </div>
                        ))}
                        <div className="rounded border border-green-500/30 bg-green-500/5 p-3">
                          <div className="mb-1.5 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                            <span className="text-xs font-medium text-green-700">Attempt {healingAttempts.length + 1} — Passed</span>
                          </div>
                          {healedInfo.passedSteps && healedInfo.passedSteps.length > 0 ? (
                            <div className="ml-6 space-y-1">
                              {healedInfo.passedSteps.map((ps, j) => (
                                <div key={j} className="flex items-center justify-between text-xs">
                                  <span className="font-medium text-green-800">{ps.name}</span>
                                  <span className="text-green-600">{(ps.durationMs / 1000).toFixed(1)}s</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="ml-6 text-xs text-green-700">All steps passed</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Simple pass report (no healing needed) */}
                  {!isRunning && runStatus === "passed" && !healedInfo && steps.length > 0 && (
                    <div className="mb-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                      <p className="mb-2 text-sm font-medium text-green-700">Run Report — All Steps Passed</p>
                      <div className="space-y-1">
                        {steps.map((step) => (
                          <div key={step.index} className="ml-2 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                              <span className="font-medium text-green-800">{step.name}</span>
                            </div>
                            {step.durationMs != null && (
                              <span className="text-green-600">{(step.durationMs / 1000).toFixed(1)}s</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Run error (non-healed failures) */}
                  {!isRunning && runError && !healedInfo && (
                    <div className="mb-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
                      <p className="mb-1 font-medium text-destructive">Test Error</p>
                      <pre className="whitespace-pre-wrap text-xs text-destructive/80">
                        {runError.replace(/\u001b\[\d+m/g, "")}
                      </pre>
                    </div>
                  )}

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

                  {/* Final steps (from the passing or last attempt) */}
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

// ── Schedule helpers ──

const SCHEDULE_LABELS: Record<ScheduleInterval, string> = {
  off: 'Off',
  '1h': 'Every hour',
  '6h': 'Every 6 hours',
  '12h': 'Every 12 hours',
  '24h': 'Every 24 hours',
  '48h': 'Every 48 hours',
  '7d': 'Every 7 days',
};

function getIntervalMs(schedule: ScheduleInterval): number {
  const map: Record<string, number> = {
    '1h': 3600000,
    '6h': 21600000,
    '12h': 43200000,
    '24h': 86400000,
    '48h': 172800000,
    '7d': 604800000,
  };
  return map[schedule] ?? 86400000;
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = new Date(dateStr).getTime() - Date.now();
  const absDiff = Math.abs(diff);
  const isFuture = diff > 0;

  if (absDiff < 60000) return isFuture ? 'in less than a minute' : 'just now';
  if (absDiff < 3600000) {
    const mins = Math.round(absDiff / 60000);
    return isFuture ? `in ${mins}m` : `${mins}m ago`;
  }
  if (absDiff < 86400000) {
    const hrs = Math.round(absDiff / 3600000);
    return isFuture ? `in ${hrs}h` : `${hrs}h ago`;
  }
  const days = Math.round(absDiff / 86400000);
  return isFuture ? `in ${days}d` : `${days}d ago`;
}

function ScheduleSection({
  agentId,
  schedule,
  onScheduleChange,
  onToggleReports,
  reportsExpanded,
  reports,
  loadingReports,
}: {
  agentId: string;
  schedule?: { schedule: ScheduleInterval; schedule_enabled: boolean; next_run_at: string | null; last_scheduled_run_at: string | null };
  onScheduleChange: (agentId: string, schedule: ScheduleInterval) => void;
  onToggleReports: () => void;
  reportsExpanded: boolean;
  reports?: ScheduledReport[];
  loadingReports: boolean;
}) {
  const sched = schedule ?? { schedule: 'off' as ScheduleInterval, schedule_enabled: false, next_run_at: null, last_scheduled_run_at: null };

  return (
    <div className="rounded-lg border bg-muted/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Schedule</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sched.schedule}
            onChange={(e) => onScheduleChange(agentId, e.target.value as ScheduleInterval)}
            className="h-7 rounded border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {sched.schedule_enabled && sched.schedule !== 'off' && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {sched.next_run_at && (
            <span className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              Next run: {relativeTime(sched.next_run_at)}
            </span>
          )}
          {sched.last_scheduled_run_at && (
            <span>
              Last scheduled: {relativeTime(sched.last_scheduled_run_at)}
            </span>
          )}
        </div>
      )}

      {/* Reports toggle */}
      <button
        onClick={onToggleReports}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {reportsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <FileText className="h-3 w-3" />
        Scheduled Reports
        {reports && reports.length > 0 && (
          <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{reports.length}</Badge>
        )}
      </button>

      {/* Reports list */}
      {reportsExpanded && (
        <div className="space-y-2 pt-1">
          {loadingReports && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loadingReports && reports && reports.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">No scheduled reports yet.</p>
          )}
          {!loadingReports && reports && reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }: { report: ScheduledReport }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-lg border ${report.status === 'passed' ? 'border-green-500/20' : 'border-destructive/20'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          {report.status === 'passed' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          )}
          <span className="text-muted-foreground">
            {new Date(report.created_at).toLocaleString()}
          </span>
        </div>
        <Badge
          variant={report.status === 'passed' ? 'outline' : 'destructive'}
          className={`text-[10px] ${report.status === 'passed' ? 'border-green-500/30 text-green-600' : ''}`}
        >
          {report.status === 'passed' ? 'Passed' : report.status === 'failed' ? 'Failed' : 'Error'}
        </Badge>
      </button>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-1.5">
          <p className="text-xs text-muted-foreground">{report.summary}</p>

          {report.steps && report.steps.length > 0 && (
            <div className="space-y-1">
              {report.steps.map((step, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {step.status === 'passed' ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-destructive" />
                    )}
                    <span>{step.name}</span>
                  </div>
                  {step.durationMs != null && (
                    <span className="text-muted-foreground">{(step.durationMs / 1000).toFixed(1)}s</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {report.steps && report.steps.some(s => s.error) && (
            <div className="text-xs text-destructive/80">
              {report.steps.filter(s => s.error).map((s, i) => (
                <p key={i} className="mt-1">{s.name}: {s.error}</p>
              ))}
            </div>
          )}

          {report.healing_summary && (
            <div className="text-xs">
              <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 text-[10px]">
                Self-healed (attempt {report.healing_summary.totalAttempts})
              </Badge>
            </div>
          )}
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
  const [showConsoleLogs, setShowConsoleLogs] = useState(false);
  const [showNetworkErrors, setShowNetworkErrors] = useState(false);

  const consoleErrors = step.consoleLogs?.filter((l) => l.type === "error" || l.type === "warning") ?? [];
  const hasConsoleLogs = (step.consoleLogs?.length ?? 0) > 0;
  const hasNetworkErrors = (step.networkErrors?.length ?? 0) > 0;

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
          <p className="mt-1 text-xs text-destructive">{step.error.replace(/\u001b\[\d+m/g, "")}</p>
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

        {/* Context panels */}
        {(hasConsoleLogs || hasNetworkErrors) && (
          <div className="mt-2 flex gap-2">
            {hasConsoleLogs && (
              <button
                onClick={() => setShowConsoleLogs(!showConsoleLogs)}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors ${
                  consoleErrors.length > 0
                    ? "bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Terminal className="h-3 w-3" />
                Console ({step.consoleLogs!.length})
                {showConsoleLogs ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            )}
            {hasNetworkErrors && (
              <button
                onClick={() => setShowNetworkErrors(!showNetworkErrors)}
                className="flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-700 transition-colors hover:bg-red-500/20"
              >
                <Wifi className="h-3 w-3" />
                Network ({step.networkErrors!.length})
                {showNetworkErrors ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Console logs panel */}
        {showConsoleLogs && step.consoleLogs && (
          <div className="mt-2 max-h-40 overflow-auto rounded border bg-muted/30 p-2">
            {step.consoleLogs.map((log, i) => (
              <div
                key={i}
                className={`font-mono text-xs leading-relaxed ${
                  log.type === "error"
                    ? "text-red-600"
                    : log.type === "warning"
                      ? "text-yellow-600"
                      : "text-muted-foreground"
                }`}
              >
                <span className="mr-1.5 font-semibold uppercase">[{log.type}]</span>
                {log.text}
              </div>
            ))}
          </div>
        )}

        {/* Network errors panel */}
        {showNetworkErrors && step.networkErrors && (
          <div className="mt-2 max-h-40 overflow-auto rounded border bg-muted/30 p-2">
            {step.networkErrors.map((err, i) => (
              <div key={i} className="flex items-baseline gap-2 font-mono text-xs leading-relaxed text-red-600">
                <span className="shrink-0 font-semibold">
                  {err.method} {err.status === 0 ? "FAILED" : err.status}
                </span>
                <span className="truncate text-muted-foreground" title={err.url}>
                  {err.url}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />;
    case "skipped":
      return <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />;
    case "running":
      return <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />;
    default:
      // failed, timedOut, interrupted, or any other non-passing status
      return <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />;
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
  const hs = run.healing_summary;
  const wasHealed = hs && hs.totalAttempts > 1;

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
            {wasHealed && (
              <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 text-[10px]">
                Healed
              </Badge>
            )}
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
          {/* Healing report from DB */}
          {hs && hs.attempts.length > 0 && (
            <div className="space-y-2 px-4 py-3">
              {hs.attempts.map((att, i) => (
                <div
                  key={i}
                  className={`rounded border p-2 ${
                    att.status === "passed"
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-destructive/20 bg-destructive/5"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-2">
                    {att.status === "passed" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-destructive" />
                    )}
                    <span className={`text-xs font-medium ${att.status === "passed" ? "text-green-700" : "text-destructive"}`}>
                      Attempt {att.attempt}
                    </span>
                  </div>
                  <div className="ml-5 space-y-0.5">
                    {att.steps.map((s, j) => (
                      <div key={j} className="flex items-center justify-between text-xs">
                        <span className={att.status === "passed" ? "text-green-800" : "text-foreground"}>
                          {s.name}
                        </span>
                        {s.durationMs != null && att.status === "passed" && (
                          <span className="text-green-600">{(s.durationMs / 1000).toFixed(1)}s</span>
                        )}
                        {s.error && (
                          <span className="max-w-[60%] truncate text-destructive/80" title={s.error}>
                            {s.error}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Step details (screenshots etc.) — only if no healing report */}
          {!hs && steps && steps.length > 0 && (
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
          )}
          {!hs && steps && steps.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              No step details recorded for this run.
            </div>
          )}
          {!hs && !steps && (
            <div className="flex items-center justify-center px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {run.error_summary && (
            <div className="border-t px-4 py-2 text-xs text-destructive">
              <span className="font-medium">Error: </span>{run.error_summary.replace(/\u001b\[\d+m/g, "")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
