"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useSSE } from "@/lib/hooks/useSSE";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Project } from "@/lib/types";
import type { SSEEvent, PageSelectors } from "@/lib/types";
import {
  Globe,
  CheckCircle2,
  Circle,
  Loader2,
  ArrowRight,
  RotateCcw,
  Search,
} from "lucide-react";

interface PageState {
  url: string;
  status: "queued" | "loading" | "done";
  screenshot?: string;
  summary?: string;
  selectors?: PageSelectors;
}

export default function ExplorationViewer({ project }: { project: Project }) {
  const router = useRouter();
  const [pages, setPages] = useState<Map<string, PageState>>(new Map());
  const [currentScreenshot, setCurrentScreenshot] = useState<string | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isDone, setIsDone] = useState(false);
  const [totalPages, setTotalPages] = useState<number>(0);

  const onEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case "status":
        setStatusMessage(event.message);
        break;

      case "screenshot":
        setCurrentScreenshot(event.image);
        setPages((prev) => {
          const next = new Map(prev);
          const existing = next.get(event.url);
          next.set(event.url, {
            url: event.url,
            status: "loading",
            screenshot: event.image,
            summary: existing?.summary,
            selectors: existing?.selectors,
          });
          return next;
        });
        break;

      case "page_discovered":
        setPages((prev) => {
          const next = new Map(prev);
          if (!next.has(event.url)) {
            next.set(event.url, { url: event.url, status: "queued" });
          }
          return next;
        });
        break;

      case "page_summary":
        setPages((prev) => {
          const next = new Map(prev);
          const existing = next.get(event.url);
          next.set(event.url, {
            url: event.url,
            status: "done",
            screenshot: existing?.screenshot,
            summary: event.summary,
            selectors: event.selectors,
          });
          return next;
        });
        break;

      case "done":
        setIsDone(true);
        setTotalPages(event.totalPages ?? 0);
        setStatusMessage(`Done — ${event.totalPages ?? 0} pages discovered`);
        break;

      case "error":
        setStatusMessage(`Error: ${event.message}`);
        break;
    }
  }, []);

  const { isStreaming, error, start, stop } = useSSE({
    url: "/api/explore",
    onEvent,
  });

  const handleStart = (fresh = false) => {
    setPages(new Map());
    setCurrentScreenshot(null);
    setStatusMessage("");
    setIsDone(false);
    setTotalPages(0);
    start({
      projectId: project.id,
      dappUrl: project.dapp_url,
      forceRefresh: fresh,
    });
  };

  const doneCount = Array.from(pages.values()).filter(
    (p) => p.status === "done",
  ).length;
  const hasStarted = isStreaming || isDone || pages.size > 0;

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">{project.name}</h1>
            <p className="text-sm text-muted-foreground">{project.dapp_url}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!hasStarted && (
            <>
              <Button onClick={() => handleStart(false)} disabled={isStreaming}>
                <Search className="mr-2 h-4 w-4" />
                Explore
              </Button>
              <Button
                variant="outline"
                onClick={() => handleStart(true)}
                disabled={isStreaming}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Fresh Explore
              </Button>
            </>
          )}
          {isStreaming && (
            <Button variant="outline" onClick={stop}>
              Stop
            </Button>
          )}
          {isDone && (
            <>
              <Button variant="outline" onClick={() => handleStart(false)}>
                <Search className="mr-2 h-4 w-4" />
                Continue
              </Button>
              <Button variant="outline" onClick={() => handleStart(true)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Fresh Explore
              </Button>
              <Button
                onClick={() => router.push(`/projects/${project.id}/chat`)}
              >
                Start Chat
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Status message */}
      {statusMessage && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-4 py-2 text-sm">
          {isStreaming && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {isDone && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          <span>{statusMessage}</span>
          {isStreaming && pages.size > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {doneCount} / ~{pages.size} pages
            </Badge>
          )}
          {isDone && (
            <Badge variant="secondary" className="ml-auto">
              {totalPages} pages
            </Badge>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Main content — two column layout */}
      {hasStarted && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Live screenshot — left column (2/3 width) */}
          <Card className="lg:col-span-2">
            <CardContent className="p-4">
              {currentScreenshot ? (
                <img
                  src={currentScreenshot}
                  alt="Live exploration screenshot"
                  className="w-full rounded-md border transition-opacity duration-300"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-md border bg-muted">
                  <div className="text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
                    <p className="text-sm">Waiting for first screenshot...</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Discovered pages sidebar — right column (1/3 width) */}
          <Card>
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Discovered Pages</h2>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3 pr-3">
                  {Array.from(pages.values()).map((page) => (
                    <div
                      key={page.url}
                      className="space-y-1 rounded-md border p-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <PageStatusIcon status={page.status} />
                        <span className="truncate font-mono text-xs">
                          {new URL(page.url).pathname}
                        </span>
                      </div>
                      {page.summary && (
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {page.summary}
                        </p>
                      )}
                    </div>
                  ))}
                  {pages.size === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Pages will appear here as they are discovered...
                    </p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function PageStatusIcon({ status }: { status: PageState["status"] }) {
  switch (status) {
    case "queued":
      return <Circle className="h-4 w-4 text-muted-foreground" />;
    case "loading":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  }
}
