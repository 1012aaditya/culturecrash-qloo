import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ProjectLibrary } from "@/components/projects/library";
import { PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { listProjects } from "@/lib/data/projects";
import { getCtx } from "@/lib/data/workspace";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const ctx = await getCtx();
  const projects = await listProjects(ctx, { includeArchived: true });
  const canCreate = can(ctx.workspace.role, "project.create");
  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-24 pt-8 sm:px-8">
      <PageHeader
        eyebrow={<>Project library · {ctx.workspace.name}</>}
        title="Campaigns"
        description="Every campaign, its workflow progress and research status — derived from what has actually been saved."
        actions={canCreate && <Button asChild size="lg"><Link href="/projects/new"><Plus /> New campaign</Link></Button>}
      />
      <div className="mt-10">
        <ProjectLibrary
          projects={projects}
          canCreate={canCreate}
          canEdit={can(ctx.workspace.role, "project.edit")}
          canDeleteAny={can(ctx.workspace.role, "project.delete")}
          userId={ctx.user.id}
        />
      </div>
    </div>
  );
}
