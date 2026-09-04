begin;

alter table public.free_snapshot_narratives
  drop constraint if exists free_snapshot_narratives_ai_call_count_check;

alter table public.free_snapshot_narratives
  add constraint free_snapshot_narratives_ai_call_count_check
  check (ai_call_count >= 0 and ai_call_count <= 3);

commit;
