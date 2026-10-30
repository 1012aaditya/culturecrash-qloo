import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StageNav } from "@/components/nav/stage-nav";
import { ProjectPresence } from "@/components/projects/project-presence";
import { DemoBadge } from "@/components/states";
import { getProjectContext } from "@/lib/data/project-context";

// Strategy, creative-brief, opportunity and copilot generation run as server actions on these pages and
// can take minutes with a model: allow the same 300 s as research instead of the platform default.
export const maxDuration = 300;

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const { project, stages } = await getProjectContext(projectId);
  return (
    <div className="mx-auto max-w-[1680px] px-3 pb-24 pt-5 sm:px-6">
      <div className="cc-no-print mb-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5">
          <Link href="/projects" className="hover:text-ink">Projects</Link>
          {project.clientName && (<><ChevronRight className="size-3" /><Link href={`/workspace/clients/${project.clientId}`} className="hover:text-ink">{project.clientName}</Link></>)}
          <ChevronRight className="size-3" />
          <Link href={`/projects/${project.id}`} className="font-medium text-ink">{project.name}</Link>
        </nav>
        {project.isDemo && <DemoBadge className="ml-2" />}
        {project.status === "archived" && <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5">Archived</span>}
        <ProjectPresence projectId={project.id} />
      </div>
      <StageNav projectId={project.id} stages={stages} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
