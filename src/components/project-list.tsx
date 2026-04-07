"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Project {
  id: string;
  title: string;
  description: string | null;
  workflowState: {
    currentStep: number;
    lastActiveTab: string;
    completedSteps: number[];
    lastEditedAt: string;
    draftFlags: Record<string, boolean>;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export function ProjectList() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      // Silently handle fetch errors
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription || undefined,
        }),
      });

      if (res.ok) {
        setNewTitle("");
        setNewDescription("");
        setShowCreate(false);
        fetchProjects();
      }
    } catch {
      // Silently handle create errors
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading projects...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "New Project"}
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="space-y-4 rounded-lg border p-4"
        >
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Project title"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Brief description"
            />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create Project"}
          </Button>
        </form>
      )}

      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No projects yet. Create your first project to get started.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}`)}
              className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              <h3 className="font-semibold">{project.title}</h3>
              {project.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  {project.description}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Step {project.workflowState?.currentStep ?? 1}
                </span>
                <span>
                  {new Date(project.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
