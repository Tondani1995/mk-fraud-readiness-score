begin;

-- The semantic safety cascade has three distinct provider roles: generation,
-- one batch adjudication and one batch repair. No fourth provider call is valid.
-- Existing v6 rows remain addressable only by their old prompt/cache version.
alter table public.free_snapshot_narratives
  drop constraint if exists free_snapshot_narratives_ai_call_count_check;

alter table public.free_snapshot_narratives
  add constraint free_snapshot_narratives_ai_call_count_check
  check (ai_call_count >= 0 and ai_call_count <= 3);

commit;
