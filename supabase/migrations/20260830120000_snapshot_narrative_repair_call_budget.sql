begin;

-- The bounded Snapshot recovery model permits one initial interpretation and at most one
-- targeted semantic repair. Historical cache rows remain valid; this is a forward constraint
-- correction only.
alter table public.free_snapshot_narratives
  drop constraint if exists free_snapshot_narratives_ai_call_count_check;

alter table public.free_snapshot_narratives
  add constraint free_snapshot_narratives_ai_call_count_check
  check (ai_call_count >= 0 and ai_call_count <= 2);

commit;
