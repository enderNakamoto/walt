"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Globe,
  ArrowRight,
  Loader2,
  Trash2,
} from "lucide-react";
import type { Project } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [dappUrl, setDappUrl] = useState("");
  const [walletSecret, setWalletSecret] = useState("");

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) setProjects(await res.json());
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dappUrl.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          dapp_url: dappUrl.trim(),
          wallet_secret: walletSecret.trim() || undefined,
        }),
      });
      if (res.ok) {
        const project = await res.json();
        router.push(`/projects/${project.id}`);
      }
    } catch {
      // ignore
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // ignore
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">WALT</h1>
        <p className="mt-2 text-muted-foreground">
          AI agent that explores Stellar dApps and generates Playwright tests
          from natural language
        </p>
      </div>

      {/* Create project */}
      {!showForm ? (
        <div className="mb-8 flex justify-center">
          <Button onClick={() => setShowForm(true)} size="lg">
            <Plus className="mr-2 h-5 w-5" />
            Create Project
          </Button>
        </div>
      ) : (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>New Project</CardTitle>
            <CardDescription>
              Enter a dApp URL to start exploring and generating tests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Project Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Stellar Vault"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  dApp URL
                </label>
                <Input
                  value={dappUrl}
                  onChange={(e) => setDappUrl(e.target.value)}
                  placeholder="https://stellar-vault.app"
                  type="url"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Wallet Secret Key{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  value={walletSecret}
                  onChange={(e) => setWalletSecret(e.target.value)}
                  placeholder="S... (leave blank to auto-generate testnet wallet)"
                  type="password"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  If blank, a testnet wallet will be created and funded via
                  Friendbot
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Project
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Project list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Globe className="mx-auto mb-3 h-12 w-12" />
          <p>No projects yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => router.push(`/projects/${project.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{project.name}</CardTitle>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <CardDescription className="truncate font-mono text-xs">
                  {project.dapp_url}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      project.exploration_data ? "default" : "secondary"
                    }
                  >
                    {project.exploration_data ? "Explored" : "Not explored"}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
