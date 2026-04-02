-- WALT MVP Schema
-- 6 tables: projects, exploration_snapshots, agents, messages, test_runs, test_run_steps

-- Projects — one per dApp
CREATE TABLE projects (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    dapp_url        text NOT NULL,
    wallet_secret   text,
    wallet_public   text,
    exploration_data jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Exploration snapshots — one per page discovered
CREATE TABLE exploration_snapshots (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url             text NOT NULL,
    screenshot_path text,
    dom_summary     text,
    selectors       jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Agents — a test suite created through conversation
CREATE TABLE agents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            text NOT NULL,
    description     text,
    test_code       text,
    status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'active')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Messages — conversation history for test creation
CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    content         text NOT NULL,
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Test runs — each manual execution
CREATE TABLE test_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'passed', 'failed', 'error')),
    started_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz,
    duration_ms     integer,
    error_summary   text
);

-- Test run steps — per-step results within a run
CREATE TABLE test_run_steps (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    test_run_id     uuid NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
    step_index      integer NOT NULL,
    name            text NOT NULL,
    status          text NOT NULL CHECK (status IN ('passed', 'failed', 'skipped')),
    screenshot_path text,
    error_message   text,
    duration_ms     integer
);

-- Indexes
CREATE INDEX idx_snapshots_project ON exploration_snapshots(project_id);
CREATE INDEX idx_agents_project ON agents(project_id);
CREATE INDEX idx_messages_agent ON messages(agent_id);
CREATE INDEX idx_runs_agent ON test_runs(agent_id);
CREATE INDEX idx_steps_run ON test_run_steps(test_run_id);
