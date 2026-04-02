// ── Database models ──

export interface Project {
  id: string;
  name: string;
  dapp_url: string;
  wallet_secret: string | null;
  wallet_public: string | null;
  exploration_data: ExplorationData | null;
  created_at: string;
}

export interface ExplorationSnapshot {
  id: string;
  project_id: string;
  url: string;
  screenshot_path: string | null;
  dom_summary: string | null;
  selectors: PageSelectors | null;
  created_at: string;
}

export interface Agent {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  test_code: string | null;
  status: "draft" | "active";
  created_at: string;
}

export interface Message {
  id: string;
  agent_id: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface TestRun {
  id: string;
  agent_id: string;
  status: "running" | "passed" | "failed" | "error";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_summary: string | null;
}

export interface TestRunStep {
  id: string;
  test_run_id: string;
  step_index: number;
  name: string;
  status: "passed" | "failed" | "skipped";
  screenshot_path: string | null;
  error_message: string | null;
  duration_ms: number | null;
}

// ── Exploration data (cached on project) ──

export interface PageSelectors {
  buttons: {
    text: string | null;
    testId: string | null;
    selector: string | null;
  }[];
  inputs: {
    label: string | null;
    testId: string | null;
    type: string | null;
    selector: string | null;
  }[];
  links: {
    text: string | null;
    href: string;
  }[];
}

export interface ExplorationData {
  dappUrl: string;
  snapshots: {
    url: string;
    dom_summary: string;
    selectors: PageSelectors;
  }[];
}

// ── SSE events ──

export type SSEEvent =
  | { type: "status"; message: string }
  | { type: "screenshot"; url: string; image: string }
  | { type: "page_summary"; url: string; summary: string; selectors: PageSelectors }
  | { type: "page_discovered"; url: string }
  | { type: "question"; content: string }
  | { type: "test_code"; code: string }
  | { type: "text"; content: string }
  | { type: "tool"; name: string; result: unknown }
  | { type: "step"; index: number; name: string; status: string; durationMs?: number; error?: string; screenshot?: string | null }
  | { type: "done"; totalPages?: number; status?: string; durationMs?: number; error?: string }
  | { type: "waiting_for_user" }
  | { type: "error"; message: string };

// ── SSE writer interface ──

export interface SSEWriter {
  send: (data: SSEEvent) => void;
  close: () => void;
}
