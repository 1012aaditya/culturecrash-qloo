-- A board can be linked to a strategy direction. The app matches on the direction's (version, slot), so
-- revisions of the same direction keep the link; a new strategy version needs boards relinked.
alter table public.inspiration_boards
  add column direction_id uuid references public.strategy_directions(id) on delete set null;
create index inspiration_boards_direction_idx on public.inspiration_boards (direction_id) where direction_id is not null;
