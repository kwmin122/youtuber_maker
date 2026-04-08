"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Image, Mic, Video } from "lucide-react";
import { SceneTab } from "./scene-tab";

interface WorkflowTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  completedSteps: number[];
  children: {
    script: React.ReactNode;
    scene: React.ReactNode;
    voice: React.ReactNode;
    video: React.ReactNode;
  };
}

const TABS = [
  { value: "script", label: "1. 대본", icon: FileText, step: 1 },
  { value: "scene", label: "2. 장면/이미지", icon: Image, step: 2 },
  { value: "voice", label: "3. 음성", icon: Mic, step: 3 },
  { value: "video", label: "4. 최종 영상", icon: Video, step: 4 },
] as const;

export function WorkflowTabs({
  activeTab,
  onTabChange,
  completedSteps,
  children,
}: WorkflowTabsProps) {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isCompleted = completedSteps.includes(tab.step);
          const isDisabled = tab.step > 2; // Tabs 1-2 active in Phase 4

          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              disabled={isDisabled}
              className="flex items-center gap-1.5"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.step}</span>
              {isCompleted && (
                <span className="ml-1 text-green-500">&#10003;</span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="script">{children.script}</TabsContent>
      <TabsContent value="scene">{children.scene}</TabsContent>
      <TabsContent value="voice">{children.voice}</TabsContent>
      <TabsContent value="video">{children.video}</TabsContent>
    </Tabs>
  );
}
