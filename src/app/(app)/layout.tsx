import { CommandBar } from "@/components/nav/command-bar";
import { getShellData } from "@/lib/data/shell";
import { getCtx } from "@/lib/data/workspace";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getCtx();
  const shell = await getShellData(ctx);
  return (
    <div className="cc-atmosphere min-h-dvh">
      <CommandBar data={shell} />
      <main id="main" className="relative">{children}</main>
    </div>
  );
}
