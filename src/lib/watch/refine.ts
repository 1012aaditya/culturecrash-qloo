import "server-only";
import { withUser } from "@/lib/db";
import { classify, EVENT_WINDOW_DAYS, groupStories } from "./relevance";

/** Stories regrouped on each run: wide enough to catch late coverage of an event, small enough to stay fast. */
const REGROUP_DAYS = 14;

/**
 * After collection: gives every new story a relevance verdict, then regroups recent relevant stories
 * into events. Runs as the user the watch runs as, like the rest of the job.
 */
export async function refineWatch(ctx: { userId: string; watchId: string; context: string[] }) {
  await withUser(ctx.userId, async (tx) => {
    const names = (await tx`select name from watch_targets where watch_id = ${ctx.watchId}`).map((t) => t.name as string);
    const unrated = await tx`select id, title, excerpt, provider, source_type from research_documents where watch_id = ${ctx.watchId} and watch_relevance is null`;
    for (const d of unrated) {
      const c = classify({ title: d.title, excerpt: d.excerpt, provider: d.provider, sourceType: d.source_type }, { targetNames: names, context: ctx.context });
      await tx`update research_documents set watch_relevance = ${c.relevance}, watch_relevance_reason = ${c.reason} where id = ${d.id}`;
    }
    // Copies of one headline are already linked by duplicate_of; events group the different headlines.
    const stories = await tx`select id, watch_target_id, title, excerpt, coalesce(published_at, retrieved_at) as at, watch_event_lead
      from research_documents
      where watch_id = ${ctx.watchId} and duplicate_of is null and watch_relevance = 'relevant' and provider not in ('page')
        and coalesce(published_at, retrieved_at) > now() - make_interval(days => ${REGROUP_DAYS + EVENT_WINDOW_DAYS})`;
    const events = groupStories(stories.map((s) => ({ id: s.id, targetId: s.watch_target_id, title: s.title, excerpt: s.excerpt, at: new Date(s.at).getTime() })), names);
    for (const s of stories) {
      const lead = events.get(s.id as string)!;
      const value = lead === s.id ? null : lead; // an event's first story has no lead of its own
      if ((s.watch_event_lead ?? null) !== value) await tx`update research_documents set watch_event_lead = ${value} where id = ${s.id}`;
    }
  });
}
