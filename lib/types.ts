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

export type ScheduleInterval = 'off' | '1h' | '6h' | '12h' | '24h' | '48h' | '7d';

export interface Agent {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  test_code: string | null;
  status: "draft" | "active";
  schedule: ScheduleInterval;
  schedule_enabled: boolean;
  next_run_at: string | null;
  last_scheduled_run_at: string | null;
  created_at: string;
}

export interface ScheduledReport {
  id: string;
  agent_id: string;
  test_run_id: string | null;
  status: 'passed' | 'failed' | 'error';
  summary: string;
  steps: Array<{ name: string; status: string; durationMs?: number; error?: string }> | null;
  healing_summary: HealingSummary | null;
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

export interface HealingSummary {
  totalAttempts: number;
  attempts: Array<{
    attempt: number;
    status: "failed" | "passed";
    steps: Array<{ name: string; error?: string; durationMs?: number }>;
  }>;
}

export interface TestRun {
  id: string;
  agent_id: string;
  status: "running" | "passed" | "failed" | "error";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_summary: string | null;
  healing_summary: HealingSummary | null;
}

export interface TestRunStep {
  id: string;
  test_run_id: string;
  step_index: number;
  name: string;
  status: string;
  screenshot_path: string | null;
  error_message: string | null;
  duration_ms: number | null;
}

// ── Exploration data (cached on project) ──

/** @deprecated Use PageData for new exploration data. Kept for backward compat with old snapshots. */
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

// ── Enhanced exploration types (Phase 12) ──

export interface PageData {
  url: string;
  title: string;
  visibleText: {
    headings: string[];
    labels: string[];
    values: string[];
  };
  elements: {
    buttons: ElementInfo[];
    inputs: InputInfo[];
    links: LinkInfo[];
  };
  accessibilitySnapshot: AccessibilityNode[];
  pageState: {
    hasLoadingIndicators: boolean;
    isNetworkIdle: boolean;
  };
}

export interface ElementInfo {
  text: string;
  testId: string | null;
  ariaLabel: string | null;
  cssSelector: string;
  nearbyText: string[];
  isDisabled: boolean;
  isVisible: boolean;
}

export interface InputInfo {
  label: string | null;
  placeholder: string | null;
  type: string | null;
  testId: string | null;
  cssSelector: string;
  currentValue: string;
  parentSection: string | null;
}

export interface LinkInfo {
  text: string;
  href: string;
  isExternal: boolean;
}

export interface AccessibilityNode {
  role: string;
  name: string;
  value?: string;
  disabled?: boolean;
  level?: number;
}

export interface ExplorationData {
  dappUrl: string;
  snapshots: {
    url: string;
    dom_summary: string;
    selectors: PageSelectors;
    pageData?: PageData;
  }[];
}

// ── Rich test context types ──

export interface ConsoleLogEntry {
  type: string;
  text: string;
  timestamp: number;
}

export interface NetworkErrorEntry {
  url: string;
  status: number;
  method: string;
  timestamp: number;
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
  | { type: "inspection"; url: string; screenshot: string }
  | { type: "step"; index: number; name: string; status: string; durationMs?: number; error?: string; screenshot?: string | null; consoleLogs?: ConsoleLogEntry[]; networkErrors?: NetworkErrorEntry[] }
  | { type: "done"; totalPages?: number; status?: string; durationMs?: number; error?: string }
  | { type: "healing"; attempt: number; message: string; failedSteps?: Array<{ name: string; error: string }> }
  | { type: "healed"; attempt: number; totalAttempts: number; passedSteps?: Array<{ name: string; durationMs: number }> }
  | { type: "healing_error"; message: string }
  | { type: "clear_steps" }
  | { type: "waiting_for_user" }
  | { type: "error"; message: string };

// ── SSE writer interface ──

export interface SSEWriter {
  send: (data: SSEEvent) => void;
  close: () => void;
}
