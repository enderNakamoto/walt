"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSSE } from "@/lib/hooks/useSSE";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Highlight, themes } from "prism-react-renderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Project, Agent, SSEEvent } from "@/lib/types";
import {
  Send,
  Loader2,
  Play,
  Copy,
  Check,
  MessageSquare,
  Bot,
  User,
  Plus,
  ChevronDown,
} from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  testCode?: string;
}

export default function ChatWindow({
  project,
}: {
  project: Project;
}) {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [hasTestCode, setHasTestCode] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showAgentList, setShowAgentList] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string>("");
  const messageIdCounter = useRef(0);

  const nextId = () => `msg-${++messageIdCounter.current}`;

  const activeAgent = agents.find((a) => a.id === activeAgentId) ?? null;

  // Load agents client-side on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/agents?projectId=${encodeURIComponent(project.id)}`);
        if (res.ok) {
          const data: Agent[] = await res.json();
          setAgents(data);
          if (data.length > 0) {
            const withCode = data.find((a) => a.test_code);
            setActiveAgentId(withCode?.id ?? data[0].id);
          }
        }
      } catch {
        // ignore
      }
      setAgentsLoaded(true);
    })();
  }, [project.id]);

  // Load message history when active agent changes
  useEffect(() => {
    if (!activeAgentId) {
      setMessages([]);
      setHistoryLoaded(true);
      return;
    }
    setHistoryLoaded(false);
    const currentAgent = agents.find((a) => a.id === activeAgentId);
    setHasTestCode(!!currentAgent?.test_code);
    (async () => {
      try {
        const res = await fetch(
          `/api/messages?agentId=${encodeURIComponent(activeAgentId)}`,
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

          // Attach test_code to the last assistant message if the agent has one
          if (currentAgent?.test_code && loaded.length > 0) {
            for (let i = loaded.length - 1; i >= 0; i--) {
              if (loaded[i].role === "assistant") {
                loaded[i].testCode = currentAgent.test_code;
                break;
              }
            }
          }

          setMessages(loaded);
        }
      } catch {
        // Failed to load history — start fresh
      }
      setHistoryLoaded(true);
    })();
  }, [activeAgentId]);

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

  const deriveAgentName = (msg: string): string => {
    // Take first ~50 chars, cut at last word boundary
    const trimmed = msg.replace(/\s+/g, " ").trim();
    if (trimmed.length <= 50) return trimmed;
    const cut = trimmed.slice(0, 50);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
  };

  const createAgentAndSend = async (msg: string) => {
    setCreatingAgent(true);
    const name = deriveAgentName(msg);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          name,
          description: null,
        }),
      });
      if (res.ok) {
        const newAgent = await res.json();
        setAgents((prev) => [...prev, newAgent]);
        setActiveAgentId(newAgent.id);
        setCreatingAgent(false);
        // Send message with the new agent
        setMessages([{ id: nextId(), role: "user", content: msg }]);
        setIsWaiting(true);
        setStatusText("Thinking...");
        pendingMessageRef.current = "";
        start({ agentId: newAgent.id, message: msg });
        return;
      }
    } catch {
      // ignore
    }
    setCreatingAgent(false);
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || isWaiting || isStreaming || creatingAgent) return;

    // Auto-create agent if none active
    if (!activeAgentId) {
      setInput("");
      createAgentAndSend(msg);
      return;
    }

    // Rename agent from first message if it still has a generic name
    if (messages.length === 0 && activeAgentId) {
      const name = deriveAgentName(msg);
      fetch(`/api/agents/${activeAgentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).catch(() => {});
      setAgents((prev) =>
        prev.map((a) => (a.id === activeAgentId ? { ...a, name } : a)),
      );
    }

    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: msg },
    ]);
    setInput("");
    setIsWaiting(true);
    setStatusText("Thinking...");
    pendingMessageRef.current = "";

    start({ agentId: activeAgentId, message: msg });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = async () => {
    setCreatingAgent(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          name: "Untitled Test",
          description: null,
        }),
      });
      if (res.ok) {
        const newAgent = await res.json();
        setAgents((prev) => [...prev, newAgent]);
        setActiveAgentId(newAgent.id);
        setShowAgentList(false);
      }
    } catch {
      // ignore
    }
    setCreatingAgent(false);
  };

  const switchAgent = (agentId: string) => {
    if (isWaiting || isStreaming) return;
    setActiveAgentId(agentId);
    setShowAgentList(false);
  };

  const inputDisabled = isWaiting || isStreaming || creatingAgent;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <div className="relative">
            <button
              onClick={() => setShowAgentList(!showAgentList)}
              className="flex items-center gap-1 font-semibold hover:text-primary"
            >
              {activeAgent?.name ?? "New Conversation"} — {project.name}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
            {/* Agent dropdown */}
            {showAgentList && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[280px] rounded-lg border bg-popover p-1 shadow-lg">
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => switchAgent(agent.id)}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${
                      agent.id === activeAgentId ? "bg-muted" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{agent.name}</span>
                        {agent.test_code && (
                          <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-600">
                            has test
                          </span>
                        )}
                      </div>
                      {agent.description && (
                        <p className="truncate text-xs text-muted-foreground">
                          {agent.description}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(agent.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))}
                <div className="border-t pt-1 mt-1">
                  <button
                    onClick={handleNewChat}
                    disabled={creatingAgent}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {creatingAgent ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    New Chat
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {agents.length > 1 && (
            <span className="text-xs text-muted-foreground">
              {agents.length} conversations
            </span>
          )}
          {hasTestCode && activeAgentId && (
            <a href={`/projects/${project.id}/runs`}>
              <Button size="sm" variant="outline">
                <Play className="mr-2 h-4 w-4" />
                See Agents
              </Button>
            </a>
          )}
        </div>
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
                      <Button size="sm" variant="outline">
                        <Play className="mr-2 h-4 w-4" />
                        See Agents
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
              creatingAgent
                ? "Setting up..."
                : isWaiting || isStreaming
                  ? "Waiting for response..."
                  : "Describe a test you'd like to create..."
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
          {isUser ? (
            message.content
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-strong:text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
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
