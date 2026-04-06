import type { SSEEvent, SSEWriter } from "./types";

export function createSSEStream(): SSEWriter & {
  readable: ReadableStream;
  response: () => Response;
} {
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  return {
    readable: stream.readable,

    send: (data: SSEEvent) => {
      writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)).catch(() => {
        // Client disconnected — swallow the error
      });
    },

    close: () => {
      writer.close().catch(() => {
        // Already closed
      });
    },

    response: () =>
      new Response(stream.readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      }),
  };
}
