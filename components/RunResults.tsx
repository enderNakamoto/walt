"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSSE } from "@/lib/hooks/useSSE";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Project, TestRun, SSEEvent } from "@/lib/types";
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
  ChevronRight,
  X,
  Code2,
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
  agentId,
  hasTestCode,
  initialRuns,
}: {
  project: Project;
  agentId: string | null;
  hasTestCode: boolean;
  initialRuns: TestRun[];
}) {
  const router = useRouter();
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runDuration, setRunDuration] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(
    null,
  );
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [historySteps, setHistorySteps] = useState<
    Record<string, StepResult[]>
  >({});

  const body = useMemo(() => ({ agentId }), [agentId]);

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
        setIsRunning(false);
        setStatusMessage("");
        break;
      case "error":
        setRunStatus("error");
        setIsRunning(false);
        setStatusMessage(event.message);
        break;
    }
  }, []);

  const { isStreaming, error, start } = useSSE({
    url: "/api/run",
    body,
    onEvent,
  });

  const handleRun = () => {
    setSteps([]);
    setRunStatus(null);
    setRunDuration(null);
    setStatusMessage("");
    setIsRunning(true);
    start();
  };

  const loadHistorySteps = async (runId: string) => {
    if (historySteps[runId]) {
      setExpandedHistory(expandedHistory === runId ? null : runId);
      return;
    }
    try {
      const res = await fetch(
        `/api/test-runs/${encodeURIComponent(runId)}/steps`,
      );
      if (res.ok) {
        const data = await res.json();
        setHistorySteps((prev) => ({ ...prev, [runId]: data }));
      }
    } catch {
      // ignore
    }
    setExpandedHistory(runId);
  };

  const canRun = agentId && hasTestCode && !isRunning && !isStreaming;
  const hasCurrentRun = steps.length > 0 || isRunning || runStatus;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Test Runs — {project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.dapp_url}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/projects/${project.id}/chat`)}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Edit Test
          </Button>
          {canRun && (
            <Button onClick={handleRun}>
              <Play className="mr-2 h-4 w-4" />
              Run Test
            </Button>
          )}
          {runStatus && !isRunning && (
            <Button variant="outline" onClick={handleRun} disabled={!canRun}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Re-run
            </Button>
          )}
        </div>
      </div>

      {!agentId && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No agent found. Go to Chat to create a test first.
          </CardContent>
        </Card>
      )}

      {agentId && !hasTestCode && !hasCurrentRun && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Code2 className="mx-auto mb-2 h-8 w-8" />
            No test code generated yet. Go to Chat to describe and generate a
            test.
          </CardContent>
        </Card>
      )}

      {/* Current run */}
      {hasCurrentRun && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Current Run</CardTitle>
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
          </CardHeader>
          <CardContent>
            {/* Status message */}
            {(isRunning || isStreaming) && statusMessage && (
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            )}

            {error && (
              <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Steps */}
            <div className="space-y-3">
              {steps.map((step) => (
                <StepCard
                  key={step.index}
                  step={step}
                  onScreenshotClick={setExpandedScreenshot}
                />
              ))}
              {isRunning && steps.length === 0 && (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Preparing test environment...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Run history */}
      {initialRuns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Previous Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {initialRuns.map((run) => (
                  <div key={run.id} className="rounded-lg border">
                    <button
                      onClick={() => loadHistorySteps(run.id)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        {expandedHistory === run.id ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <StatusBadge status={run.status} />
                        <span className="text-muted-foreground">
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
                    {expandedHistory === run.id && historySteps[run.id] && (
                      <div className="space-y-2 border-t px-4 py-3">
                        {historySteps[run.id].map((step: StepResult) => (
                          <StepCard
                            key={step.index}
                            step={step}
                            onScreenshotClick={setExpandedScreenshot}
                            compact
                          />
                        ))}
                      </div>
                    )}
                    {run.error_summary && expandedHistory === run.id && (
                      <div className="border-t px-4 py-2 text-xs text-destructive">
                        {run.error_summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

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
