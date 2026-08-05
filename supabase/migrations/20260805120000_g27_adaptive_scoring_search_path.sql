-- Harden the adaptive scoring SECURITY DEFINER RPC against search_path shadowing.
alter function public.complete_adaptive_score_run_atomic(
  uuid, uuid, uuid, text, text, public.score_run_type, text, uuid, text,
  jsonb, jsonb, jsonb, jsonb, jsonb
) set search_path = '';
