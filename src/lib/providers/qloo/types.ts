import { z } from "zod";

/**
 * Qloo Insights API — application-facing types.
 *
 * Verification status (see docs/QLOO_INTEGRATION.md): request shapes follow Qloo's
 * hackathon developer guide (GET + X-Api-Key, /search, /v2/insights with required
 * filter.type, signal.interests.entities, feature.explainability). The response
 * schemas below are deliberately permissive (passthrough + optional fields) because
 * the live API could not be reached from the build environment; everything not
 * validated here is preserved verbatim in the raw response for provenance.
 */

export const ENTITY_TYPES = [
  "urn:entity:brand",
  "urn:entity:artist",
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:book",
  "urn:entity:podcast",
  "urn:entity:videogame",
  "urn:entity:place",
  "urn:entity:destination",
  "urn:entity:person",
] as const;
export type EntityTypeUrn = (typeof ENTITY_TYPES)[number];

export const rawEntitySchema = z
  .object({
    entity_id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    type: z.string().optional(),
    subtype: z.string().optional(),
    types: z.array(z.string()).optional(),
    popularity: z.number().optional().nullable(),
    disambiguation: z.string().optional().nullable(),
    properties: z.record(z.string(), z.unknown()).optional().nullable(),
    tags: z.array(z.union([z.string(), z.object({ name: z.string().optional(), tag_id: z.string().optional(), id: z.string().optional(), type: z.string().optional() }).passthrough()])).optional().nullable(),
    query: z
      .object({
        affinity: z.number().optional().nullable(),
        explainability: z.unknown().optional(),
      })
      .passthrough()
      .optional()
      .nullable(),
  })
  .passthrough()
  .refine((e) => Boolean(e.entity_id ?? e.id), { message: "entity without identifier" });

export type RawEntity = z.infer<typeof rawEntitySchema>;

export const rawTagSchema = z
  .object({
    tag_id: z.string().optional(),
    id: z.string().optional(),
    name: z.string(),
    type: z.string().optional(),
    subtype: z.string().optional(),
    popularity: z.number().optional().nullable(),
    query: z.object({ affinity: z.number().optional().nullable() }).passthrough().optional().nullable(),
  })
  .passthrough();

export type NormalizedEntity = {
  providerId: string;
  name: string;
  type: string; // short type, e.g. "brand", "artist"
  affinity: number | null;
  popularity: number | null;
  tags: string[];
  description: string | null;
  disambiguation: string | null;
  explainability: { entityId: string; score: number }[];
};

export type NormalizedTag = { providerId: string; name: string; type: string | null; affinity: number | null; popularity: number | null };

export type QlooCall<T> = {
  endpoint: string;
  params: Record<string, string>;
  status: "ok" | "empty" | "error";
  httpStatus: number | null;
  durationMs: number;
  raw: unknown;
  data: T;
  error: string | null;
  retrievedAt: string;
};

export class QlooError extends Error {
  constructor(
    message: string,
    readonly code: "missing_key" | "network" | "timeout" | "http" | "rate_limited" | "invalid_response",
    readonly httpStatus: number | null = null,
  ) {
    super(message);
  }
}
