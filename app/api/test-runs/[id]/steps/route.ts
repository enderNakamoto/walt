import { NextResponse } from "next/server";
import { getTestRunSteps } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const steps = await getTestRunSteps(params.id);
  return NextResponse.json(
    steps.map((s) => ({
      index: s.step_index,
      name: s.name,
      status: s.status,
      durationMs: s.duration_ms,
      error: s.error_message,
      screenshot: s.screenshot_path,
    })),
  );
}
