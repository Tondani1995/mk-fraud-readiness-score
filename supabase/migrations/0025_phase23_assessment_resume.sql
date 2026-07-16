-- MK Fraud Readiness Platform V2 - Phases 2-3 assessment resume cursor.
-- Answers already autosave in the base schema. This adds non-sensitive navigation state only.

alter table public.assessments
  add column if not exists active_domain_key text,
  add column if not exists active_question_id uuid references public.questions(id) on delete set null,
  add column if not exists completion_percentage integer not null default 0,
  add column if not exists last_answer_saved_at timestamptz;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='assessments_completion_percentage_check') then
    alter table public.assessments add constraint assessments_completion_percentage_check
      check(completion_percentage between 0 and 100);
  end if;
end $$;

create table public.assessment_resume_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  event_type text not null check(event_type in ('assessment_resumed','answer_saved','save_failed','domain_completed','assessment_completed')),
  active_domain_key text,
  active_question_id uuid references public.questions(id) on delete set null,
  completion_percentage integer check(completion_percentage between 0 and 100),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index assessment_resume_events_assessment_created_idx on public.assessment_resume_events(assessment_id,created_at desc);
alter table public.assessment_resume_events enable row level security;
revoke all on public.assessment_resume_events from public,anon,authenticated;
grant select,insert on public.assessment_resume_events to service_role;
create policy assessment_resume_admin_select on public.assessment_resume_events
  for select to authenticated using(public.current_admin_role() in ('platform_admin','reviewer','approver','read_only_admin'));

create or replace function public.save_assessment_resume_state(
  p_assessment_reference text,
  p_active_domain_key text,
  p_active_question_id uuid,
  p_completion_percentage integer,
  p_event_type text default 'answer_saved'
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_assessment public.assessments%rowtype;
begin
  if p_completion_percentage not between 0 and 100
     or p_event_type not in ('assessment_resumed','answer_saved','save_failed','domain_completed','assessment_completed') then
    raise exception 'assessment_resume_state_invalid';
  end if;
  select * into v_assessment from public.assessments where assessment_reference=p_assessment_reference for update;
  if not found then raise exception 'assessment_resume_not_found'; end if;
  if v_assessment.status='draft' and p_active_question_id is not null and not exists(
    select 1 from public.questions q where q.id=p_active_question_id and q.methodology_version_id=v_assessment.methodology_version_id
  ) then raise exception 'assessment_resume_question_invalid'; end if;
  update public.assessments set
    active_domain_key=left(p_active_domain_key,120),active_question_id=p_active_question_id,
    completion_percentage=p_completion_percentage,
    last_answer_saved_at=case when p_event_type='assessment_resumed' then last_answer_saved_at else now() end,
    updated_at=now()
  where id=v_assessment.id;
  insert into public.assessment_resume_events(assessment_id,event_type,active_domain_key,active_question_id,completion_percentage,safe_metadata)
  values(v_assessment.id,p_event_type,left(p_active_domain_key,120),p_active_question_id,p_completion_percentage,
    jsonb_build_object('assessment_reference',p_assessment_reference));
  return jsonb_build_object('saved',true,'active_domain_key',p_active_domain_key,'active_question_id',p_active_question_id,
    'completion_percentage',p_completion_percentage,'saved_at',now());
end $$;

create or replace function public.assessment_resume_capability() returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_missing text[]:=array[]::text[]; v_permissions text[]:=array[]::text[];
begin
  if to_regclass('public.assessment_resume_events') is null then v_missing:=array_append(v_missing,'assessment_resume_events'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='assessments' and column_name='active_domain_key') then v_missing:=array_append(v_missing,'assessments.active_domain_key'); end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='assessments' and column_name='active_question_id') then v_missing:=array_append(v_missing,'assessments.active_question_id'); end if;
  if to_regprocedure('public.save_assessment_resume_state(text,text,uuid,integer,text)') is null then v_missing:=array_append(v_missing,'save_assessment_resume_state'); end if;
  if not has_table_privilege('service_role','public.assessment_resume_events','SELECT,INSERT') then v_permissions:=array_append(v_permissions,'assessment_resume_events'); end if;
  return jsonb_build_object('status',case when cardinality(v_permissions)>0 then 'error' when cardinality(v_missing)=0 then 'available' else 'unavailable' end,
    'available',cardinality(v_missing)=0 and cardinality(v_permissions)=0,'schema_version','0025','missing_objects',v_missing,'missing_permissions',v_permissions);
end $$;

revoke all on function public.save_assessment_resume_state(text,text,uuid,integer,text),
  public.assessment_resume_capability() from public,anon,authenticated;
grant execute on function public.save_assessment_resume_state(text,text,uuid,integer,text),
  public.assessment_resume_capability() to service_role;

insert into public.app_settings(setting_key,value_json) values(
  'v2_phase23_assessment_resume','{"schema_version":"0025","stores_tokens":false}'::jsonb
) on conflict(setting_key) do update set value_json=excluded.value_json,updated_at=now();
