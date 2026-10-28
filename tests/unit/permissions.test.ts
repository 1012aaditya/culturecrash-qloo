import { describe, expect, it } from "vitest";
import { assertCan, can, ForbiddenError } from "@/lib/permissions";

describe("role permissions", () => {
  it("viewers are read-only", () => {
    expect(can("viewer", "report.export")).toBe(true);
    for (const p of ["project.create", "brief.edit", "research.run", "strategy.edit", "report.share", "team.manage"] as const) expect(can("viewer", p)).toBe(false);
  });
  it("members create work but cannot manage the team or delete data", () => {
    expect(can("member", "research.run")).toBe(true);
    expect(can("member", "team.manage")).toBe(false);
    expect(can("member", "data.delete")).toBe(false);
  });
  it("admins manage integrations; only owners delete workspaces", () => {
    expect(can("admin", "integrations.manage")).toBe(true);
    expect(can("admin", "workspace.delete")).toBe(false);
    expect(can("owner", "workspace.delete")).toBe(true);
  });
  it("assertCan throws a typed error", () => {
    expect(() => assertCan("viewer", "brief.edit")).toThrow(ForbiddenError);
    expect(() => assertCan(null, "report.export")).toThrow(ForbiddenError);
  });
});
