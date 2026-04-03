import { NextResponse } from "next/server";
import { createAgent, getAgents } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }

  const agents = await getAgents(projectId);
  return NextResponse.json(agents);
}

export async function POST(request: Request) {
  const { project_id, name, description } = await request.json();

  if (!project_id || !name) {
    return NextResponse.json(
      { error: "project_id and name are required" },
      { status: 400 },
    );
  }

  const agent = await createAgent({
    project_id,
    name,
    description: description ?? null,
  });

  return NextResponse.json(agent);
}
