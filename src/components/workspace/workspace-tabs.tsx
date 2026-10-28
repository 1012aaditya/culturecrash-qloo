import { TabRow } from "@/components/settings/tab-row";

export function WorkspaceTabs({ clientCount }: { clientCount?: number }) {
  return (
    <TabRow
      label="Workspace sections"
      tabs={[
        { href: "/workspace", label: "Overview", exact: true },
        { href: "/workspace/clients", label: "Clients", badge: clientCount !== undefined ? String(clientCount) : undefined },
        { href: "/workspace/activity", label: "Activity" },
        { href: "/settings/team", label: "Team" },
      ]}
    />
  );
}
