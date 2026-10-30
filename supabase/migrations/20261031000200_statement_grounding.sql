-- Statement-level citations (review of 2026-10-30, Phase 1).
-- Directions keep their claims inside strategy_directions.content; opportunities and creative
-- briefs store them alongside their prose, so client-facing text stays free of evidence ids.
-- Each claim: { statement, evidenceIds[], support: verified | weak | uncited }.
alter table public.opportunities add column if not exists claims jsonb not null default '[]'::jsonb;
alter table public.creative_briefs add column if not exists grounding jsonb not null default '[]'::jsonb;
