"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSSE } from "@/lib/hooks/useSSE";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Highlight, themes } from "prism-react-renderer";
import type { Project, SSEEvent } from "@/lib/types";
import {
  Send,
  Loader2,
  Play,
  Copy,
  Check,
  MessageSquare,
  Bot,
  User,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  testCode?: string;
}

export default function ChatWindow({
  project,
  agentId,
}: {
  project: Project;
  agentId: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [hasTestCode, setHasTestCode] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string>("");
  const messageIdCounter = useRef(0);

  const nextId = () => `msg-${++messageIdCounter.current}`;

  // Load message history on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/messages?agentId=${encodeURIComponent(agentId)}`,
        );
        if (res.ok) {
          const data = await res.json();
          const loaded: ChatMessage[] = data.map(
            (m: { role: string; content: string }) => ({
              id: nextId(),
              role: m.role as "user" | "assistant",
              content: m.content,
            }),
          );
          setMessages(loaded);
        }
      } catch {
        // Failed to load history — start fresh
      }
      setHistoryLoaded(true);
    })();
  }, [agentId]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  const onEvent = useCallback((event: SSEEvent) => {
    switch (event.type) {
      case "status":
        setStatusText(event.message);
        break;

      case "text":
        pendingMessageRef.current += event.content;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && !last.testCode) {
            return [
              ...prev.slice(0, -1),
              { ...last, content: pendingMessageRef.current },
            ];
          }
          return [
            ...prev,
            {
              id: `msg-${Date.now()}`,
              role: "assistant",
              content: pendingMessageRef.current,
            },
          ];
        });
        break;

      case "question":
        setMessages((prev) => [
          ...prev,
          { id: `msg-${Date.now()}`, role: "assistant", content: event.content },
        ]);
        setIsWaiting(false);
        setStatusText("");
        break;

      case "test_code":
        setHasTestCode(true);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: "Here's your generated test:",
            testCode: event.code,
          },
        ]);
        break;

      case "waiting_for_user":
        setIsWaiting(false);
        setStatusText("");
        break;

      case "done":
        setIsWaiting(false);
        setStatusText("");
        pendingMessageRef.current = "";
        break;

      case "error":
        setIsWaiting(false);
        setStatusText("");
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content: `Error: ${event.message}`,
          },
        ]);
        break;
    }
  }, []);

  const { isStreaming, error, start } = useSSE({
    url: "/api/chat",
    onEvent,
  });

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || isWaiting || isStreaming) return;

    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: msg },
    ]);
    setInput("");
    setIsWaiting(true);
    setStatusText("Thinking...");
    pendingMessageRef.current = "";

    start({ agentId, message: msg });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const inputDisabled = isWaiting || isStreaming;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h1 className="font-semibold">Test Agent — {project.name}</h1>
        </div>
        {hasTestCode && (
          <a href={`/projects/${project.id}/runs`}>
            <Button size="sm">
              <Play className="mr-2 h-4 w-4" />
              Run Test
            </Button>
          </a>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-6">
        <div className="mx-auto max-w-3xl space-y-4 py-4">
          {!historyLoaded && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {historyLoaded && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <MessageSquare className="mb-4 h-12 w-12" />
              <p className="text-lg font-medium">
                Describe a test you&apos;d like to create...
              </p>
              <p className="mt-1 text-sm">
                e.g. &quot;Test that a user can deposit 100 XLM into the
                vault&quot;
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              <MessageBubble message={msg} />
              {msg.testCode && (
                <>
                  <CodeBlock code={msg.testCode} />
                  <div className="ml-9 mt-2">
                    <a href={`/projects/${project.id}/runs`}>
                      <Button size="sm">
                        <Play className="mr-2 h-4 w-4" />
                        Run Test
                      </Button>
                    </a>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {(isWaiting || isStreaming) && statusText && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{statusText}</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input bar */}
      <div className="border-t px-6 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              inputDisabled
                ? "Waiting for agent..."
                : "Type a message..."
            }
            disabled={inputDisabled}
            rows={1}
            className="flex-1 resize-none rounded-lg border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          />
          <Button
            onClick={handleSend}
            disabled={inputDisabled || !input.trim()}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[80%] items-start gap-2 ${isUser ? "flex-row-reverse" : ""}`}
      >
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isUser ? (
            <User className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </div>
        <div
          className={`rounded-lg px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 ml-9 overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between bg-muted/50 px-4 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          test.spec.ts
        </span>
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
      </div>
      <Highlight theme={themes.nightOwl} code={code} language="typescript">
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className="overflow-x-auto p-4 text-xs leading-5"
            style={style}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
