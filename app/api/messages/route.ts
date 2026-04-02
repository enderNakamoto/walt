import { NextResponse } from "next/server";
import { getMessages } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");

  if (!agentId) {
    return NextResponse.json(
      { error: "agentId query parameter is required" },
      { status: 400 },
    );
  }

  const messages = await getMessages(agentId);
  return NextResponse.json(
    messages.map((m) => ({ role: m.role, content: m.content })),
  );
}
