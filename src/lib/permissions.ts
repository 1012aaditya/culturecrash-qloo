export type Role = "owner" | "admin" | "member" | "viewer";

const rank: Record<Role, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

/**
 * Application-level permission matrix. RLS enforces the same boundaries in the
 * database; these checks give clear errors and hide controls users cannot use.
 */
export const permissions = {
  "project.create": "member",
  "project.edit": "member",
  "project.archive": "member",
  "project.delete": "admin",
  "brief.edit": "member",
  "research.run": "member",
  "strategy.edit": "member",
  "experiment.edit": "member",
  "report.create": "member",
  "report.export": "viewer",
  "report.share": "member",
  "client.edit": "member",
  "brand.approve": "admin",
  "team.manage": "admin",
  "integrations.manage": "admin",
  "workspace.manage": "admin",
  "workspace.delete": "owner",
  "data.delete": "admin",
  "comment.create": "member",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof permissions;

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return rank[role] >= rank[permissions[permission]];
}

export class ForbiddenError extends Error {
  readonly kind = "forbidden";
  constructor(permission: Permission) {
    super(`Your workspace role does not allow: ${permission}`);
  }
}

export function assertCan(role: Role | null | undefined, permission: Permission) {
  if (!can(role, permission)) throw new ForbiddenError(permission);
}
