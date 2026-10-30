-- Comments on inspiration-board cards. target_id is the card's id inside the board document.
alter table public.comments drop constraint comments_target_type_check;
alter table public.comments add constraint comments_target_type_check
  check (target_type in ('evidence', 'direction', 'opportunity', 'experiment', 'board_card'));
