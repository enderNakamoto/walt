import { NextResponse } from "next/server";
import { deleteAgent } from "@/lib/supabase";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  await deleteAgent(params.id);
  return NextResponse.json({ success: true });
}
