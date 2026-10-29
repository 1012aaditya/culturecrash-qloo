import "server-only";
import { withUser } from "@/lib/db";
import { llmConfigured } from "./index";

/**
 * True when an LLM key is configured AND the workspace has not switched the LLM off
 * in Settings → Integrations (no row means the default: on). Read under RLS.
 */
export async function llmEnabled(userId: string, workspaceId: string): Promise<boolean> {
  if (!llmConfigured()) return false;
  const [row] = await withUser(userId, (tx) => tx`select enabled from integration_settings where workspace_id = ${workspaceId} and provider = 'llm'`);
  return row ? Boolean(row.enabled) : true;
}

export const LLM_UNAVAILABLE =
  "AI drafting is unavailable for this workspace: no LLM provider is configured, or it is turned off in Settings → Integrations.";
