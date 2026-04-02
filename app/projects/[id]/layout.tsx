import { getProject } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProjectNav } from "./project-nav";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      {/* Project header */}
      <div className="border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="font-semibold">{project.name}</span>
          <span className="text-sm text-muted-foreground">
            {project.dapp_url}
          </span>
        </div>
        <ProjectNav projectId={params.id} />
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
