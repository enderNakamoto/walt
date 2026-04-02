import { NextResponse } from "next/server";
import { getProjects, createProject } from "@/lib/supabase";

export async function GET() {
  const projects = await getProjects();
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { name, dapp_url, wallet_secret } = body;

  if (!name?.trim() || !dapp_url?.trim()) {
    return NextResponse.json(
      { error: "name and dapp_url are required" },
      { status: 400 },
    );
  }

  try {
    new URL(dapp_url);
  } catch {
    return NextResponse.json(
      { error: "dapp_url must be a valid URL" },
      { status: 400 },
    );
  }

  const project = await createProject({
    name: name.trim(),
    dapp_url: dapp_url.trim(),
    wallet_secret: wallet_secret?.trim() || null,
  });

  return NextResponse.json(project, { status: 201 });
}
