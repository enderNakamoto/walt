import { NextResponse } from "next/server";
import { deleteAgent, updateAgent } from "@/lib/supabase";

const SCHEDULE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '48h': 48 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const body = await request.json();

  // When enabling a schedule, compute next_run_at
  if (body.schedule_enabled === true && body.schedule && body.schedule !== 'off') {
    const intervalMs = SCHEDULE_MS[body.schedule] ?? SCHEDULE_MS['24h'];
    body.next_run_at = new Date(Date.now() + intervalMs).toISOString();
  }

  // When disabling schedule, clear next_run_at
  if (body.schedule_enabled === false || body.schedule === 'off') {
    body.schedule_enabled = false;
    body.next_run_at = null;
  }

  await updateAgent(params.id, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  await deleteAgent(params.id);
  return NextResponse.json({ success: true });
}
