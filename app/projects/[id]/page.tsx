import { getProject } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  MessageSquare,
  Play,
  Globe,
  Wallet,
  Layers,
} from "lucide-react";
import { DeleteProjectButton } from "./delete-project-button";

export default async function ProjectPage({
  params,
}: {
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  const explorationData = project.exploration_data;
  const pageCount = explorationData?.snapshots?.length ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Project info */}
      <div className="flex items-start justify-between">
        <div>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Globe className="h-4 w-4" />
            {project.dapp_url}
          </span>
          {project.wallet_public && (
            <span className="flex items-center gap-1">
              <Wallet className="h-4 w-4" />
              {project.wallet_public.slice(0, 8)}...
              {project.wallet_public.slice(-4)}
            </span>
          )}
        </div>
        </div>
        <DeleteProjectButton projectId={project.id} />
      </div>

      {/* Action cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href={`/projects/${project.id}/explore`}>
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-5 w-5" />
                Explore
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Crawl the dApp and discover pages
              </p>
              {pageCount > 0 && (
                <Badge variant="secondary" className="mt-2">
                  {pageCount} pages discovered
                </Badge>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href={`/projects/${project.id}/chat`}>
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-5 w-5" />
                Chat
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Describe a test in natural language
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href={`/projects/${project.id}/runs`}>
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="h-5 w-5" />
                Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Execute and view test results
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Exploration summary */}
      {explorationData && explorationData.snapshots.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-5 w-5" />
              Exploration Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {explorationData.snapshots.map((snap) => (
                <div
                  key={snap.url}
                  className="rounded border px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs">{snap.url}</span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {snap.dom_summary}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
