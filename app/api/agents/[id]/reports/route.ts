import { NextResponse } from "next/server";
import { getScheduledReports } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const reports = await getScheduledReports(params.id);
  return NextResponse.json(reports);
}
