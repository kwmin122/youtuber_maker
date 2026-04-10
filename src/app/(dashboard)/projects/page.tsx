import Link from "next/link";
import { ProjectList } from "@/components/project-list";
import { Button } from "@/components/ui/button";

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button asChild variant="outline">
          <Link href="/longform/new">새 롱폼 → 쇼츠</Link>
        </Button>
      </div>
      <ProjectList />
    </div>
  );
}
