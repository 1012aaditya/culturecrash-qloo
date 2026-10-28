import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArtPlate } from "@/components/art/plate";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { withUser } from "@/lib/db";
import { getCtx } from "@/lib/data/workspace";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "New campaign" };

export default async function NewProjectPage() {
  const ctx = await getCtx();
  if (!can(ctx.workspace.role, "project.create")) redirect("/projects");
  const clients = await withUser(ctx.user.id, (tx) => tx`select id, name from clients where workspace_id = ${ctx.workspace.workspaceId} order by name`);
  return (
    <div className="mx-auto grid max-w-[1400px] gap-8 px-4 pb-24 pt-8 sm:px-8 lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden min-h-[640px] overflow-hidden rounded-[36px] bg-charcoal text-white lg:block">
        <ArtPlate theme="fashion" seed="new-campaign" rounded={false} className="absolute inset-0" />
        <div className="absolute inset-x-10 bottom-10">
          <p className="cc-eyebrow text-white/60">01 · Explore</p>
          <p className="cc-display mt-3 text-6xl">Every campaign starts with a brief.</p>
          <p className="mt-4 max-w-sm text-sm text-white/70">Name it and set the basics now. You’ll complete the full brief — audience, objective, competitors, documents — in the next step.</p>
        </div>
      </div>
      <div className="py-4 lg:py-10">
        <p className="cc-eyebrow text-muted">New campaign</p>
        <h1 className="cc-display mt-3 text-5xl md:text-6xl">What are we working on?</h1>
        <NewProjectForm clients={clients.map((c) => ({ id: c.id as string, name: c.name as string }))} />
      </div>
    </div>
  );
}
