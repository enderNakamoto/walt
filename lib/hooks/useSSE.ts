"use client";

import { useCallback, useRef, useState } from "react";
import type { SSEEvent } from "../types";

interface UseSSEOptions {
  url: string;
  body: Record<string, unknown>;
  onEvent?: (event: SSEEvent) => void;
}

interface UseSSEReturn {
  events: SSEEvent[];
  isStreaming: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useSSE({ url, body, onEvent }: UseSSEOptions): UseSSEReturn {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const start = useCallback(() => {
    // Abort any existing stream
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;

    setEvents([]);
    setError(null);
    setIsStreaming(true);

    (async () => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop()!;

          for (const chunk of chunks) {
            const line = chunk.trim();
            if (!line.startsWith("data: ")) continue;

            try {
              const parsed: SSEEvent = JSON.parse(line.slice(6));
              setEvents((prev) => [...prev, parsed]);
              onEvent?.(parsed);
            } catch {
              // Skip malformed JSON
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        const message =
          err instanceof Error ? err.message : "Stream connection failed";
        setError(message);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    })();
  }, [url, body, onEvent]);

  return { events, isStreaming, error, start, stop };
}
