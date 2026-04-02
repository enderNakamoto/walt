import { createClient } from "@supabase/supabase-js";
import type {
  Project,
  ExplorationSnapshot,
  Agent,
  Message,
  TestRun,
  TestRunStep,
} from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ── Projects ──

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data as Project | null;
}

export async function createProject(
  project: Pick<Project, "name" | "dapp_url" | "wallet_secret" | "wallet_public">,
): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert(project)
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function updateProjectExplorationData(
  id: string,
  explorationData: unknown,
): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ exploration_data: explorationData })
    .eq("id", id);
  if (error) throw error;
}

// ── Exploration Snapshots ──

export async function getSnapshots(projectId: string): Promise<ExplorationSnapshot[]> {
  const { data, error } = await supabase
    .from("exploration_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as ExplorationSnapshot[];
}

export async function upsertSnapshot(
  snapshot: Omit<ExplorationSnapshot, "id" | "created_at">,
): Promise<ExplorationSnapshot> {
  const { data: existing } = await supabase
    .from("exploration_snapshots")
    .select("id")
    .eq("project_id", snapshot.project_id)
    .eq("url", snapshot.url)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from("exploration_snapshots")
      .update(snapshot)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as ExplorationSnapshot;
  }

  const { data, error } = await supabase
    .from("exploration_snapshots")
    .insert(snapshot)
    .select()
    .single();
  if (error) throw error;
  return data as ExplorationSnapshot;
}

// ── Agents ──

export async function getAgents(projectId: string): Promise<Agent[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Agent[];
}

export async function getAgent(id: string): Promise<Agent | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data as Agent | null;
}

export async function createAgent(
  agent: Pick<Agent, "project_id" | "name" | "description">,
): Promise<Agent> {
  const { data, error } = await supabase
    .from("agents")
    .insert(agent)
    .select()
    .single();
  if (error) throw error;
  return data as Agent;
}

export async function updateAgentTestCode(
  id: string,
  testCode: string,
): Promise<void> {
  const { error } = await supabase
    .from("agents")
    .update({ test_code: testCode })
    .eq("id", id);
  if (error) throw error;
}

// ── Messages ──

export async function getMessages(agentId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Message[];
}

export async function createMessage(
  message: Pick<Message, "agent_id" | "role" | "content" | "metadata">,
): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert(message)
    .select()
    .single();
  if (error) throw error;
  return data as Message;
}

// ── Test Runs ──

export async function getTestRuns(agentId: string): Promise<TestRun[]> {
  const { data, error } = await supabase
    .from("test_runs")
    .select("*")
    .eq("agent_id", agentId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data as TestRun[];
}

export async function createTestRun(agentId: string): Promise<TestRun> {
  const { data, error } = await supabase
    .from("test_runs")
    .insert({ agent_id: agentId })
    .select()
    .single();
  if (error) throw error;
  return data as TestRun;
}

export async function updateTestRun(
  id: string,
  updates: Partial<Pick<TestRun, "status" | "completed_at" | "duration_ms" | "error_summary">>,
): Promise<void> {
  const { error } = await supabase.from("test_runs").update(updates).eq("id", id);
  if (error) throw error;
}

// ── Test Run Steps ──

export async function getTestRunSteps(testRunId: string): Promise<TestRunStep[]> {
  const { data, error } = await supabase
    .from("test_run_steps")
    .select("*")
    .eq("test_run_id", testRunId)
    .order("step_index", { ascending: true });
  if (error) throw error;
  return data as TestRunStep[];
}

export async function createTestRunStep(
  step: Omit<TestRunStep, "id">,
): Promise<TestRunStep> {
  const { data, error } = await supabase
    .from("test_run_steps")
    .insert(step)
    .select()
    .single();
  if (error) throw error;
  return data as TestRunStep;
}

// ── Storage ──

export async function uploadScreenshot(
  buffer: Buffer,
  path: string,
): Promise<string> {
  const { error } = await supabase.storage
    .from("screenshots")
    .upload(path, buffer, {
      contentType: "image/png",
      upsert: true,
    });
  if (error) throw error;

  const { data } = supabase.storage.from("screenshots").getPublicUrl(path);
  return data.publicUrl;
}
