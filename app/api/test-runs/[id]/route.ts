import { NextResponse } from "next/server";
import { deleteTestRun } from "@/lib/supabase";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  await deleteTestRun(params.id);
  return NextResponse.json({ success: true });
}
