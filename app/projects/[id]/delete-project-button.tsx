"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const handleDelete = async () => {
    if (!confirm("Delete this project and all its data?")) return;
    try {
      await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      window.location.href = "/";
    } catch {
      // ignore
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDelete}
      className="text-destructive hover:bg-destructive/10"
    >
      <Trash2 className="mr-2 h-4 w-4" />
      Delete Project
    </Button>
  );
}
