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
import {
  Plus,
  ArrowRight,
  Loader2,
  Trash2,
  Zap,
  Search,
  Shield,
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
    <main className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Animated dot grid background */}
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
      {/* Radial fade overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />

      <div className="relative mx-auto max-w-4xl p-6">
        {/* Hero Section */}
        <div className="mb-14 pt-12 text-center animate-fade-in-up">
          <h1 className="text-gradient font-mono text-6xl font-bold tracking-tight">
            WALT
          </h1>
          <p className="mt-4 text-xl text-muted-foreground">
            AI-powered test agent for Stellar dApps
          </p>
          <p className="mx-auto mt-3 max-w-lg text-base text-muted-foreground/70">
            Give it a URL. It explores, generates tests, and self-heals failures.
          </p>

          {/* Feature pills */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {[
              { icon: Search, label: "Auto-explore" },
              { icon: Zap, label: "Self-healing" },
              { icon: Shield, label: "Wallet-aware" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
              >
                <Icon className="h-3 w-3" />
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Create project */}
        {!showForm ? (
          <div
            className="mb-12 flex justify-center animate-fade-in-up"
            style={{ animationDelay: "0.1s" }}
          >
            <Button
              onClick={() => setShowForm(true)}
              size="lg"
              className="glow-sm border border-primary/30 bg-primary/10 px-8 font-mono text-base text-primary hover:bg-primary/20 hover:glow-md transition-all"
            >
              <Plus className="mr-2 h-5 w-5" />
              Create Project
            </Button>
          </div>
        ) : (
          <Card className="mb-12 animate-scale-in border-border/60">
            <CardHeader>
              <CardTitle className="font-mono text-lg">New Project</CardTitle>
              <CardDescription className="text-sm">
                Enter a dApp URL to start exploring and generating tests
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-5">
                <div>
                  <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Project Name
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Stellar Vault"
                    required
                    className="bg-background/50 text-base focus-visible:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    dApp URL
                  </label>
                  <Input
                    value={dappUrl}
                    onChange={(e) => setDappUrl(e.target.value)}
                    placeholder="https://stellar-vault.app"
                    type="url"
                    required
                    className="bg-background/50 font-mono text-sm focus-visible:ring-primary"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Wallet Secret Key{" "}
                    <span className="normal-case tracking-normal text-muted-foreground/60">
                      (optional)
                    </span>
                  </label>
                  <Input
                    value={walletSecret}
                    onChange={(e) => setWalletSecret(e.target.value)}
                    placeholder="S... (leave blank to auto-generate testnet wallet)"
                    type="password"
                    className="bg-background/50 font-mono text-sm focus-visible:ring-primary"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground/60">
                    If blank, a testnet wallet will be created and funded via
                    Friendbot
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={creating}
                    className="font-mono text-sm"
                  >
                    {creating && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Project
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                    className="font-mono text-sm"
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
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
          </div>
        ) : projects.length === 0 ? (
          <div className="py-16 text-center animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-primary/30"></span>
              </span>
            </div>
            <p className="text-base text-muted-foreground">
              No projects yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map((project, i) => (
              <Card
                key={project.id}
                className="hover-lift group cursor-pointer border-border/40 transition-all duration-200 hover:border-l-primary hover:border-l-2 hover:glow-sm animate-fade-in-up"
                style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="font-mono text-base font-semibold tracking-tight">
                      {project.name}
                    </CardTitle>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(project.id);
                      }}
                      className="rounded p-1 text-muted-foreground/0 transition-all group-hover:text-muted-foreground hover:!bg-destructive/10 hover:!text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <CardDescription className="truncate font-mono text-sm text-muted-foreground/60">
                    {project.dapp_url}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-2 w-2 rounded-full ${
                          project.exploration_data
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/30"
                        }`}
                      />
                      <span className="text-sm text-muted-foreground">
                        {project.exploration_data ? "Explored" : "Not explored"}
                      </span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/0 transition-all group-hover:text-primary group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
