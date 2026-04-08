"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WorkflowTabs } from "@/components/project/workflow-tabs";
import { ScriptTab } from "@/components/project/script-tab";
import { SceneTab } from "@/components/project/scene-tab";

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
  const [activeTab, setActiveTab] = useState("script");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
          setTitle(data.title);
          setDescription(data.description || "");
          // Restore last active tab
          if (data.workflowState?.lastActiveTab) {
            setActiveTab(data.workflowState.lastActiveTab);
          }
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

  // Persist active tab to workflowState
  async function handleTabChange(tab: string) {
    setActiveTab(tab);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowState: {
            ...project?.workflowState,
            currentStep: project?.workflowState?.currentStep ?? 1,
            lastActiveTab: tab,
            completedSteps: project?.workflowState?.completedSteps ?? [],
            lastEditedAt: new Date().toISOString(),
            draftFlags: project?.workflowState?.draftFlags ?? {},
          },
        }),
      });
    } catch {
      // Silent
    }
  }

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
        setShowSettings(false);
      }
    } catch {
      // Silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) return;

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/projects");
      }
    } catch {
      // Silent
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            {showSettings ? "닫기" : "설정"}
          </Button>
        </div>
      </div>

      {/* Settings panel (collapsible) */}
      {showSettings && (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor="title">제목</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="프로젝트 설명"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? "저장 중..." : "저장"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
            >
              삭제
            </Button>
          </div>
        </div>
      )}

      {/* 4-Step Workflow Tabs (UX-01) */}
      <WorkflowTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        completedSteps={project.workflowState?.completedSteps ?? []}
      >
        {{
          script: <ScriptTab projectId={projectId} />,
          scene: <SceneTab projectId={projectId} />,
          voice: (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <p className="text-sm">음성 합성 (Phase 4에서 구현)</p>
            </div>
          ),
          video: (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              <p className="text-sm">최종 영상 (Phase 5에서 구현)</p>
            </div>
          ),
        }}
      </WorkflowTabs>
    </div>
  );
}
