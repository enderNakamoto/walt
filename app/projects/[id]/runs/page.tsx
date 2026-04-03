import { Suspense } from "react";
import { getProject } from "@/lib/supabase";
import { notFound } from "next/navigation";
import RunResults from "@/components/RunResults";
import { Loader2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RunsPage({
  params,
}: {
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  return (
    <div className="min-h-screen bg-background p-6">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <RunResults project={project} />
      </Suspense>
    </div>
  );
}
