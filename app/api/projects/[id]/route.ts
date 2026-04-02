import { NextResponse } from "next/server";
import { getProject, deleteProject } from "@/lib/supabase";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const project = await getProject(params.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  await deleteProject(params.id);
  return NextResponse.json({ success: true });
}
