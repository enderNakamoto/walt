import { NextResponse } from "next/server";
import { getTestRuns } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");

  if (!agentId) {
    return NextResponse.json(
      { error: "agentId is required" },
      { status: 400 },
    );
  }

  const runs = await getTestRuns(agentId);
  return NextResponse.json(runs);
}
