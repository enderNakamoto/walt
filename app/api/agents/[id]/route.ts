import { NextResponse } from "next/server";
import { deleteAgent, updateAgent } from "@/lib/supabase";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const body = await request.json();
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
