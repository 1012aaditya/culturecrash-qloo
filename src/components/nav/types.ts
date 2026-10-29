export type ShellProject = { id: string; name: string; category: string | null; isDemo: boolean };
export type ShellTask = { id: string; label: string; status: string; href: string | null; updatedAt: string };
export type ShellData = {
  user: { name: string; email: string };
  workspace: { id: string; name: string; role: string; isDemo: boolean };
  memberships: { workspaceId: string; name: string; role: string }[];
  projects: ShellProject[];
  tasks: ShellTask[];
  notifications: { unread: number; items: ShellNotification[] };
  collaborators: { id: string; name: string }[];
  can: { createProject: boolean; manageTeam: boolean; runResearch: boolean; createReport: boolean; editExperiments: boolean };
};
export type ShellNotification = {
  id: string; kind: string; title: string; body: string | null; href: string | null; actor: string | null; read: boolean; workspace: string | null; createdAt: string;
};
