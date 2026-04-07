"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
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

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
          setTitle(data.title);
          setDescription(data.description || "");
        } else {
          router.push("/projects");
        }
      } catch {
        router.push("/projects");
      } finally {
        setLoading(false);
      }
    }
    fetchProject();
  }, [projectId, router]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
      }
    } catch {
      // Silently handle save errors
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Are you sure you want to delete this project?")) return;

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/projects");
      }
    } catch {
      // Silently handle delete errors
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading project...</p>;
  }

  if (!project) {
    return <p className="text-sm text-destructive">Project not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Project Details</h1>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Delete
          </Button>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          Current Step: {project.workflowState?.currentStep ?? 1} |
          Tab: {project.workflowState?.lastActiveTab ?? "script"}
        </p>
        <div className="mt-2 h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{
              width: `${((project.workflowState?.currentStep ?? 1) / 7) * 100}%`,
            }}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Project description"
          />
        </div>
      </div>
    </div>
  );
}
