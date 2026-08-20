-- RC1 operational freeze bootstrap.
--
-- This migration is deliberately ordered after the current Production boundary
-- (20260721150808) and before the seven accepted behaviour migrations. It is additive,
-- transactional, and starts fail-closed. No canary bypass is implemented here.

begin;

create table public.rc1_operation_freeze_state (
  singleton boolean primary key default true check (singleton),
  state text not null check (state in ('FROZEN', 'RELEASED')),
  freeze_epoch bigint not null check (freeze_epoch > 0),
  activated_at timestamptz not null,
  activated_by_fingerprint text,
  activation_reason_fingerprint text not null
    check (activation_reason_fingerprint ~ '^[0-9a-f]{64}$'),
  released_at timestamptz,
  released_by_fingerprint text,
  release_reason_fingerprint text,
  release_evidence_fingerprint text,
  active_canary_authorization_hash text,
  active_canary_expires_at timestamptz,
  updated_at timestamptz not null,
  constraint rc1_operation_freeze_state_release_shape check (
    (state = 'FROZEN'
      and released_at is null
      and released_by_fingerprint is null
      and release_reason_fingerprint is null
      and release_evidence_fingerprint is null)
    or
    (state = 'RELEASED'
      and released_at is not null
      and released_by_fingerprint is not null
      and released_by_fingerprint ~ '^[0-9a-f]{64}$'
      and release_reason_fingerprint is not null
      and release_reason_fingerprint ~ '^[0-9a-f]{64}$'
      and release_evidence_fingerprint is not null
      and release_evidence_fingerprint ~ '^[0-9a-f]{64}$'
      and release_evidence_fingerprint <> pg_catalog.repeat('0', 64)
      and active_canary_authorization_hash is null
      and active_canary_expires_at is null)
  ),
  constraint rc1_operation_freeze_state_canary_shape check (
    (active_canary_authorization_hash is null and active_canary_expires_at is null)
    or
    (active_canary_authorization_hash is not null
      and active_canary_authorization_hash ~ '^[0-9a-f]{64}$'
      and active_canary_expires_at is not null)
  )
);

alter table public.rc1_operation_freeze_state enable row level security;
alter table public.rc1_operation_freeze_state force row level security;
revoke all on table public.rc1_operation_freeze_state
  from public, anon, authenticated, service_role;

create table public.rc1_operation_freeze_audit (
  id bigint generated always as identity primary key,
  event_type text not null check (
    event_type in (
      'BOOTSTRAP_FROZEN',
      'FREEZE_ACTIVATED',
      'FREEZE_RELEASED',
      'CERTIFICATION_SECRET_PROVISIONED'
    )
  ),
  freeze_epoch bigint not null check (freeze_epoch > 0),
  actor_fingerprint text,
  reason_fingerprint text not null check (reason_fingerprint ~ '^[0-9a-f]{64}$'),
  evidence_fingerprint text,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint rc1_operation_freeze_audit_actor_shape check (
    actor_fingerprint is null or actor_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint rc1_operation_freeze_audit_evidence_shape check (
    evidence_fingerprint is null or evidence_fingerprint ~ '^[0-9a-f]{64}$'
  )
);

alter table public.rc1_operation_freeze_audit enable row level security;
alter table public.rc1_operation_freeze_audit force row level security;
revoke all on table public.rc1_operation_freeze_audit
  from public, anon, authenticated, service_role;

-- A one-use, transaction-bound capability consumed by the authoritative relation trigger.
-- No API role can read or write this table. A session GUC alone is therefore never authority.
create table public.rc1_certification_secret_write_tokens (
  transaction_id xid8 primary key,
  marker_fingerprint text not null check (marker_fingerprint ~ '^[0-9a-f]{64}$'),
  secret_key text not null check (
    secret_key in ('provider_webhook_db_hmac', 'provider_lookup_db_hmac')
  ),
  secret_fingerprint text not null check (secret_fingerprint ~ '^[0-9a-f]{64}$'),
  expected_freeze_epoch bigint not null check (expected_freeze_epoch > 0),
  actor_fingerprint text not null check (actor_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.rc1_certification_secret_write_tokens enable row level security;
alter table public.rc1_certification_secret_write_tokens force row level security;
revoke all on table public.rc1_certification_secret_write_tokens
  from public, anon, authenticated, service_role;

insert into public.rc1_operation_freeze_state (
  singleton,
  state,
  freeze_epoch,
  activated_at,
  activated_by_fingerprint,
  activation_reason_fingerprint,
  updated_at
) values (
  true,
  'FROZEN',
  1,
  pg_catalog.clock_timestamp(),
  null,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to('rc1-bootstrap-initial-frozen', 'UTF8'),
      'sha256'
    ),
    'hex'
  ),
  pg_catalog.clock_timestamp()
);

insert into public.rc1_operation_freeze_audit (
  event_type,
  freeze_epoch,
  actor_fingerprint,
  reason_fingerprint
) values (
  'BOOTSTRAP_FROZEN',
  1,
  null,
  pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to('rc1-bootstrap-initial-frozen', 'UTF8'),
      'sha256'
    ),
    'hex'
  )
);

create function public.rc1_is_known_operation_surface(p_surface text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select pg_catalog.btrim(coalesce(p_surface, '')) = any (array[
    'assessment_start',
    'assessment_write',
    'assessment_submit',
    'assessment_score',
    'order_create',
    'payment_status',
    'payment_webhook',
    'generation',
    'backlog',
    'worker',
    'quality_review',
    'delivery',
    'customer_token',
    'recipient_correction',
    'resend_webhook',
    'operational_alert',
    'activation_control',
    'storage_cleanup'
  ]::text[]);
$$;

create function public.rc1_surface_for_relation(p_schema text, p_table text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case coalesce(p_schema, '') || '.' || coalesce(p_table, '')
    when 'public.organisations' then 'assessment_start'
    when 'public.respondents' then 'assessment_start'
    when 'public.assessments' then 'assessment_write'
    when 'public.assessment_tokens' then 'assessment_write'
    when 'public.assessment_answers' then 'assessment_write'
    when 'public.exposure_answers' then 'assessment_write'
    when 'public.assessment_events' then 'assessment_write'
    when 'public.score_runs' then 'assessment_score'
    when 'public.score_domain_results' then 'assessment_score'
    when 'public.score_question_traces' then 'assessment_score'
    when 'public.maturity_cap_events' then 'assessment_score'
    when 'public.data_requests' then 'order_create'
    when 'public.orders' then 'order_create'
    when 'public.payment_sessions' then 'payment_status'
    when 'public.payment_automation_records' then 'payment_status'
    when 'public.payment_transition_events' then 'payment_status'
    when 'public.order_events' then 'payment_status'
    when 'public.manual_report_generation_attempts' then 'generation'
    when 'public.report_fulfilments' then 'generation'
    when 'public.report_generation_runs' then 'generation'
    when 'public.report_ai_attempts' then 'generation'
    when 'public.reports' then 'generation'
    when 'public.report_events' then 'generation'
    when 'public.backlog_reconciliation_records' then 'backlog'
    when 'public.manual_report_delivery_attempts' then 'delivery'
    when 'public.report_delivery_authorizations' then 'delivery'
    when 'public.report_delivery_finalizations' then 'delivery'
    when 'public.report_delivery_remediations' then 'delivery'
    when 'public.email_events' then 'delivery'
    when 'public.email_provider_events' then 'resend_webhook'
    when 'public.customer_report_access_tokens' then 'customer_token'
    when 'public.phase14_operational_alerts' then 'operational_alert'
    when 'public.app_settings' then 'activation_control'
    when 'public.phase14_security_gates' then 'activation_control'
    when 'public.phase14_feature_policies' then 'activation_control'
    when 'public.phase14_ai_route_policies' then 'activation_control'
    when 'public.phase14_provider_attestations' then 'activation_control'
    when 'public.phase14_worker_capabilities' then 'worker'
    when 'public.phase14_worker_operations' then 'worker'
    when 'storage.objects' then 'storage_cleanup'
    when 'phase14_private.runtime_secrets' then 'activation_control'
    else null
  end;
$$;

create function public.rc1_freeze_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_state public.rc1_operation_freeze_state%rowtype;
  v_count bigint;
begin
  select pg_catalog.count(*) into v_count
  from public.rc1_operation_freeze_state;

  if v_count <> 1 then
    raise exception 'rc1_operation_frozen:freeze_row_cardinality';
  end if;

  select * into v_state
  from public.rc1_operation_freeze_state
  where singleton = true;

  if not found
     or v_state.state is null
     or v_state.state not in ('FROZEN', 'RELEASED')
     or v_state.freeze_epoch is null
     or v_state.freeze_epoch < 1
     or v_state.activated_at is null
     or v_state.activation_reason_fingerprint is null
     or v_state.activation_reason_fingerprint !~ '^[0-9a-f]{64}$'
     or (
       v_state.activated_by_fingerprint is not null
       and v_state.activated_by_fingerprint !~ '^[0-9a-f]{64}$'
     )
     or (v_state.active_canary_authorization_hash is null)
        <> (v_state.active_canary_expires_at is null)
     or (
       v_state.active_canary_authorization_hash is not null
       and v_state.active_canary_authorization_hash !~ '^[0-9a-f]{64}$'
     )
     or (
       v_state.state = 'FROZEN'
       and (
         v_state.released_at is not null
         or v_state.released_by_fingerprint is not null
         or v_state.release_reason_fingerprint is not null
         or v_state.release_evidence_fingerprint is not null
       )
     )
     or (
       v_state.state = 'RELEASED'
       and (
         v_state.released_at is null
         or v_state.released_by_fingerprint is null
         or v_state.released_by_fingerprint !~ '^[0-9a-f]{64}$'
         or v_state.release_reason_fingerprint is null
         or v_state.release_reason_fingerprint !~ '^[0-9a-f]{64}$'
         or v_state.release_evidence_fingerprint is null
         or v_state.release_evidence_fingerprint !~ '^[0-9a-f]{64}$'
         or v_state.release_evidence_fingerprint = pg_catalog.repeat('0', 64)
         or v_state.active_canary_authorization_hash is not null
         or v_state.active_canary_expires_at is not null
       )
     ) then
    raise exception 'rc1_operation_frozen:freeze_row_malformed';
  end if;

  return pg_catalog.jsonb_build_object(
    'state', pg_catalog.lower(v_state.state),
    'freeze_epoch', v_state.freeze_epoch,
    'activated_at', v_state.activated_at,
    'released_at', v_state.released_at,
    'activation_reason_fingerprint', v_state.activation_reason_fingerprint,
    'release_evidence_fingerprint', v_state.release_evidence_fingerprint,
    'canary_authorization_active', v_state.active_canary_authorization_hash is not null
  );
end;
$$;

create function public.rc1_require_operation_open(surface text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_surface text := pg_catalog.btrim(coalesce(surface, ''));
  v_status jsonb;
  v_epoch bigint;
  v_evidence text;
begin
  if not public.rc1_is_known_operation_surface(v_surface) then
    raise exception 'rc1_operation_frozen:unknown_surface';
  end if;

  v_status := public.rc1_freeze_status();
  begin
    if v_status is null
       or pg_catalog.jsonb_typeof(v_status) <> 'object'
       or pg_catalog.jsonb_typeof(v_status->'freeze_epoch') <> 'number'
       or pg_catalog.jsonb_typeof(v_status->'canary_authorization_active') <> 'boolean'
       or coalesce(v_status->>'state', '') <> 'released' then
      raise exception 'rc1_operation_frozen:%', v_surface;
    end if;
    v_epoch := (v_status->>'freeze_epoch')::bigint;
    v_evidence := v_status->>'release_evidence_fingerprint';
  exception when others then
    raise exception 'rc1_operation_frozen:%', v_surface;
  end;

  if v_epoch < 1
     or v_evidence is null
     or v_evidence !~ '^[0-9a-f]{64}$'
     or v_evidence = pg_catalog.repeat('0', 64)
     or (v_status->>'canary_authorization_active')::boolean is distinct from false then
    raise exception 'rc1_operation_frozen:%', v_surface;
  end if;
end;
$$;

create function public.rc1_require_platform_admin(p_require_aal2 boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_exp bigint;
  v_profile public.admin_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'rc1_freeze_control:no_session';
  end if;

  begin
    v_exp := nullif(v_claims->>'exp', '')::bigint;
    v_session_id := nullif(v_claims->>'session_id', '')::uuid;
  exception when others then
    raise exception 'rc1_freeze_control:malformed_session';
  end;

  if v_exp is null or pg_catalog.to_timestamp(v_exp) <= pg_catalog.clock_timestamp() then
    raise exception 'rc1_freeze_control:expired_session';
  end if;
  if v_session_id is null or not exists (
    select 1
    from auth.sessions s
    where s.id = v_session_id
      and s.user_id = v_user_id
      and (s.not_after is null or s.not_after > pg_catalog.clock_timestamp())
  ) then
    raise exception 'rc1_freeze_control:inactive_session';
  end if;

  select * into v_profile
  from public.admin_profiles
  where id = v_user_id;

  if not found or v_profile.status <> 'active' or v_profile.role <> 'platform_admin' then
    raise exception 'rc1_freeze_control:platform_admin_required';
  end if;
  if p_require_aal2 and coalesce(v_claims->>'aal', '') <> 'aal2' then
    raise exception 'rc1_freeze_control:aal2_required';
  end if;

  return pg_catalog.jsonb_build_object(
    'user_id', v_user_id,
    'actor_fingerprint', pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(v_user_id::text, 'UTF8'), 'sha256'),
      'hex'
    )
  );
end;
$$;

create function public.rc1_guard_freeze_state_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE'
     or coalesce(
       pg_catalog.current_setting('rc1.freeze_control_transition', true),
       ''
     ) not in ('activate', 'release') then
    raise exception 'rc1_freeze_control:direct_state_write_forbidden';
  end if;
  if old.singleton is distinct from true or new.singleton is distinct from true then
    raise exception 'rc1_freeze_control:singleton_immutable';
  end if;
  return new;
end;
$$;

create trigger trg_rc1_guard_freeze_state_write
before insert or update or delete on public.rc1_operation_freeze_state
for each row execute function public.rc1_guard_freeze_state_write();

create function public.rc1_activate_freeze(reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := pg_catalog.btrim(coalesce(reason, ''));
  v_reason_fingerprint text;
  v_actor jsonb;
  v_state public.rc1_operation_freeze_state%rowtype;
begin
  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_freeze_control:meaningful_reason_required';
  end if;
  v_actor := public.rc1_require_platform_admin(true);
  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into v_state
  from public.rc1_operation_freeze_state
  where singleton = true
  for update;
  if not found or v_state.state not in ('FROZEN', 'RELEASED') then
    raise exception 'rc1_operation_frozen:freeze_row_malformed';
  end if;

  perform pg_catalog.set_config('rc1.freeze_control_transition', 'activate', true);
  update public.rc1_operation_freeze_state
  set state = 'FROZEN',
      freeze_epoch = freeze_epoch + 1,
      activated_at = pg_catalog.clock_timestamp(),
      activated_by_fingerprint = v_actor->>'actor_fingerprint',
      activation_reason_fingerprint = v_reason_fingerprint,
      released_at = null,
      released_by_fingerprint = null,
      release_reason_fingerprint = null,
      release_evidence_fingerprint = null,
      active_canary_authorization_hash = null,
      active_canary_expires_at = null,
      updated_at = pg_catalog.clock_timestamp()
  where singleton = true
  returning * into v_state;

  insert into public.rc1_operation_freeze_audit (
    event_type,
    freeze_epoch,
    actor_fingerprint,
    reason_fingerprint
  ) values (
    'FREEZE_ACTIVATED',
    v_state.freeze_epoch,
    v_actor->>'actor_fingerprint',
    v_reason_fingerprint
  );

  return public.rc1_freeze_status();
end;
$$;

create function public.rc1_release_freeze(
  reason text,
  evidence_fingerprint text,
  expected_freeze_epoch bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := pg_catalog.btrim(coalesce(reason, ''));
  v_evidence text := pg_catalog.lower(
    pg_catalog.btrim(coalesce(evidence_fingerprint, ''))
  );
  v_reason_fingerprint text;
  v_actor jsonb;
  v_state public.rc1_operation_freeze_state%rowtype;
begin
  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_freeze_control:meaningful_reason_required';
  end if;
  if v_evidence !~ '^[0-9a-f]{64}$' or v_evidence = pg_catalog.repeat('0', 64) then
    raise exception 'rc1_freeze_control:non_reversible_evidence_fingerprint_required';
  end if;
  if expected_freeze_epoch is null or expected_freeze_epoch < 1 then
    raise exception 'rc1_freeze_control:expected_epoch_required';
  end if;

  v_actor := public.rc1_require_platform_admin(true);
  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'),
    'hex'
  );

  select * into v_state
  from public.rc1_operation_freeze_state
  where singleton = true
  for update;
  if not found or v_state.state <> 'FROZEN' then
    raise exception 'rc1_freeze_control:not_frozen';
  end if;
  if v_state.freeze_epoch <> expected_freeze_epoch then
    raise exception 'rc1_freeze_control:freeze_epoch_mismatch';
  end if;
  if v_state.active_canary_authorization_hash is not null
     or v_state.active_canary_expires_at is not null then
    raise exception 'rc1_freeze_control:active_canary_authorization';
  end if;

  perform pg_catalog.set_config('rc1.freeze_control_transition', 'release', true);
  update public.rc1_operation_freeze_state
  set state = 'RELEASED',
      released_at = pg_catalog.clock_timestamp(),
      released_by_fingerprint = v_actor->>'actor_fingerprint',
      release_reason_fingerprint = v_reason_fingerprint,
      release_evidence_fingerprint = v_evidence,
      updated_at = pg_catalog.clock_timestamp()
  where singleton = true
    and state = 'FROZEN'
    and freeze_epoch = expected_freeze_epoch
  returning * into v_state;
  if not found then
    raise exception 'rc1_freeze_control:release_compare_and_swap_failed';
  end if;

  insert into public.rc1_operation_freeze_audit (
    event_type,
    freeze_epoch,
    actor_fingerprint,
    reason_fingerprint,
    evidence_fingerprint
  ) values (
    'FREEZE_RELEASED',
    v_state.freeze_epoch,
    v_actor->>'actor_fingerprint',
    v_reason_fingerprint,
    v_evidence
  );

  return public.rc1_freeze_status();
end;
$$;

create function public.rc1_provision_certification_runtime_secret(
  p_secret_key text,
  p_secret_value text,
  p_reason text,
  p_expected_freeze_epoch bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_key text := pg_catalog.btrim(coalesce(p_secret_key, ''));
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_other_secret_value text;
  v_reason_fingerprint text;
  v_secret_fingerprint text;
  v_marker text;
  v_marker_fingerprint text;
  v_rotated_at timestamptz := pg_catalog.clock_timestamp();
  v_actor jsonb;
  v_state public.rc1_operation_freeze_state%rowtype;
begin
  if v_secret_key not in (
    'provider_webhook_db_hmac',
    'provider_lookup_db_hmac'
  ) then
    raise exception 'rc1_certification_secret:key_not_allowed';
  end if;
  if p_secret_value is null or pg_catalog.char_length(p_secret_value) < 32 then
    raise exception 'rc1_certification_secret:value_too_short';
  end if;
  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_certification_secret:meaningful_reason_required';
  end if;
  if p_expected_freeze_epoch is null or p_expected_freeze_epoch < 1 then
    raise exception 'rc1_certification_secret:expected_epoch_required';
  end if;

  v_actor := public.rc1_require_platform_admin(true);

  select * into v_state
  from public.rc1_operation_freeze_state
  where singleton = true
  for update;
  if not found or v_state.state <> 'FROZEN' then
    raise exception 'rc1_certification_secret:not_frozen';
  end if;
  if v_state.freeze_epoch <> p_expected_freeze_epoch then
    raise exception 'rc1_certification_secret:freeze_epoch_mismatch';
  end if;
  if v_state.active_canary_authorization_hash is not null
     or v_state.active_canary_expires_at is not null then
    raise exception 'rc1_certification_secret:active_canary_authorization';
  end if;
  perform public.rc1_freeze_status();

  select secret_value into v_other_secret_value
  from phase14_private.runtime_secrets
  where secret_key = case v_secret_key
    when 'provider_webhook_db_hmac' then 'provider_lookup_db_hmac'
    else 'provider_webhook_db_hmac'
  end;
  if found and v_other_secret_value = p_secret_value then
    raise exception 'rc1_certification_secret:values_must_be_distinct';
  end if;

  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'),
    'hex'
  );
  v_secret_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_secret_value, 'UTF8'), 'sha256'),
    'hex'
  );
  v_marker := extensions.gen_random_uuid()::text;
  v_marker_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_marker, 'UTF8'), 'sha256'),
    'hex'
  );

  insert into public.rc1_certification_secret_write_tokens (
    transaction_id,
    marker_fingerprint,
    secret_key,
    secret_fingerprint,
    expected_freeze_epoch,
    actor_fingerprint
  ) values (
    pg_catalog.pg_current_xact_id(),
    v_marker_fingerprint,
    v_secret_key,
    v_secret_fingerprint,
    p_expected_freeze_epoch,
    v_actor->>'actor_fingerprint'
  );
  perform pg_catalog.set_config('rc1.certification_secret_write_marker', v_marker, true);

  if exists (
    select 1 from phase14_private.runtime_secrets where secret_key = v_secret_key
  ) then
    update phase14_private.runtime_secrets
    set secret_value = p_secret_value,
        rotated_at = v_rotated_at,
        rotated_by = (v_actor->>'user_id')::uuid
    where secret_key = v_secret_key;
  else
    insert into phase14_private.runtime_secrets (
      secret_key,
      secret_value,
      rotated_at,
      rotated_by
    ) values (
      v_secret_key,
      p_secret_value,
      v_rotated_at,
      (v_actor->>'user_id')::uuid
    );
  end if;

  if exists (
    select 1
    from public.rc1_certification_secret_write_tokens
    where transaction_id = pg_catalog.pg_current_xact_id()
  ) then
    raise exception 'rc1_certification_secret:write_token_not_consumed';
  end if;
  perform pg_catalog.set_config('rc1.certification_secret_write_marker', '', true);

  insert into public.rc1_operation_freeze_audit (
    event_type,
    freeze_epoch,
    actor_fingerprint,
    reason_fingerprint,
    evidence_fingerprint
  ) values (
    'CERTIFICATION_SECRET_PROVISIONED',
    p_expected_freeze_epoch,
    v_actor->>'actor_fingerprint',
    v_reason_fingerprint,
    v_secret_fingerprint
  );

  return pg_catalog.jsonb_build_object(
    'secret_key', v_secret_key,
    'rotated_at', v_rotated_at,
    'fingerprint', v_secret_fingerprint
  );
end;
$$;

create function public.rc1_guard_authoritative_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_surface text;
  v_old jsonb;
  v_new jsonb;
  v_expected_backfill timestamptz;
  v_marker text;
  v_marker_fingerprint text;
  v_secret_fingerprint text;
  v_actor jsonb;
  v_token public.rc1_certification_secret_write_tokens%rowtype;
  v_freeze public.rc1_operation_freeze_state%rowtype;
begin
  v_surface := public.rc1_surface_for_relation(tg_table_schema, tg_table_name);
  if v_surface is null then
    raise exception 'rc1_operation_frozen:unknown_surface';
  end if;

  -- Consume one exact, unforgeable certification capability. The marker by itself is
  -- deliberately insufficient: the matching token row is writable only by the dedicated
  -- SECURITY DEFINER RPC and is deleted before this trigger permits the target row.
  if tg_table_schema = 'phase14_private'
     and tg_table_name = 'runtime_secrets'
     and tg_op in ('INSERT', 'UPDATE') then
    v_new := pg_catalog.to_jsonb(new);
    if v_new->>'secret_key' not in (
      'provider_webhook_db_hmac',
      'provider_lookup_db_hmac'
    ) then
      perform public.rc1_require_operation_open(v_surface);
    end if;
    v_marker := coalesce(
      pg_catalog.current_setting('rc1.certification_secret_write_marker', true),
      ''
    );
    if v_marker <> '' then
      v_marker_fingerprint := pg_catalog.encode(
        extensions.digest(pg_catalog.convert_to(v_marker, 'UTF8'), 'sha256'),
        'hex'
      );
      v_secret_fingerprint := pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(v_new->>'secret_value', 'UTF8'),
          'sha256'
        ),
        'hex'
      );
      v_actor := public.rc1_require_platform_admin(true);

      select * into v_freeze
      from public.rc1_operation_freeze_state
      where singleton = true
      for share;
      if found
         and v_freeze.state = 'FROZEN'
         and v_freeze.freeze_epoch > 0
         and v_freeze.active_canary_authorization_hash is null
         and v_freeze.active_canary_expires_at is null then
        delete from public.rc1_certification_secret_write_tokens
        where transaction_id = pg_catalog.pg_current_xact_id()
          and marker_fingerprint = v_marker_fingerprint
          and secret_key = v_new->>'secret_key'
          and secret_fingerprint = v_secret_fingerprint
          and expected_freeze_epoch = v_freeze.freeze_epoch
          and actor_fingerprint = v_actor->>'actor_fingerprint'
        returning * into v_token;
        if found then
          if tg_op = 'UPDATE' then
            v_old := pg_catalog.to_jsonb(old);
            if v_old->>'secret_key' is distinct from v_new->>'secret_key' then
              raise exception 'rc1_certification_secret:key_immutable';
            end if;
          end if;
          return new;
        end if;
      end if;
    end if;
  end if;

  -- Release D contains one accepted, data-preserving lifecycle timestamp backfill before
  -- transition_phase14_operational_alert() is created. Permit only that exact column-only
  -- normalization while the function is still absent; all other alert DML remains frozen.
  if tg_table_schema = 'public'
     and tg_table_name = 'phase14_operational_alerts'
     and tg_op = 'UPDATE'
     and pg_catalog.to_regprocedure(
       'public.transition_phase14_operational_alert(uuid,text,text)'
     ) is null then
    v_old := pg_catalog.to_jsonb(old);
    v_new := pg_catalog.to_jsonb(new);
    begin
      v_expected_backfill := coalesce(
        nullif(v_old->>'resolved_at', '')::timestamptz,
        nullif(v_old->>'created_at', '')::timestamptz
      );
    exception when others then
      v_expected_backfill := null;
    end;
    if (v_new - 'last_status_changed_at') = (v_old - 'last_status_changed_at')
       and nullif(v_new->>'last_status_changed_at', '')::timestamptz
         is not distinct from v_expected_backfill then
      return new;
    end if;
  end if;

  perform public.rc1_require_operation_open(v_surface);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function public.rc1_install_relation_guard(
  p_schema text,
  p_table text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_relation regclass;
  v_surface text;
begin
  v_surface := public.rc1_surface_for_relation(p_schema, p_table);
  if v_surface is null then
    raise exception 'rc1_operation_frozen:unknown_surface';
  end if;

  v_relation := pg_catalog.to_regclass(
    pg_catalog.format('%I.%I', p_schema, p_table)
  );
  if v_relation is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = v_relation
      and t.tgname = 'trg_rc1_operation_freeze'
      and not t.tgisinternal
  ) then
    execute pg_catalog.format(
      'create trigger trg_rc1_operation_freeze before insert or update or delete on %I.%I for each row execute function public.rc1_guard_authoritative_mutation()',
      p_schema,
      p_table
    );
  end if;
end;
$$;

do $$
declare
  v_target record;
begin
  for v_target in
    select *
    from (values
      ('public','organisations'),
      ('public','respondents'),
      ('public','assessments'),
      ('public','assessment_tokens'),
      ('public','assessment_answers'),
      ('public','exposure_answers'),
      ('public','assessment_events'),
      ('public','score_runs'),
      ('public','score_domain_results'),
      ('public','score_question_traces'),
      ('public','maturity_cap_events'),
      ('public','data_requests'),
      ('public','orders'),
      ('public','payment_sessions'),
      ('public','payment_automation_records'),
      ('public','payment_transition_events'),
      ('public','order_events'),
      ('public','manual_report_generation_attempts'),
      ('public','report_fulfilments'),
      ('public','report_generation_runs'),
      ('public','report_ai_attempts'),
      ('public','reports'),
      ('public','report_events'),
      ('public','backlog_reconciliation_records'),
      ('public','manual_report_delivery_attempts'),
      ('public','report_delivery_authorizations'),
      ('public','report_delivery_finalizations'),
      ('public','report_delivery_remediations'),
      ('public','email_events'),
      ('public','email_provider_events'),
      ('public','customer_report_access_tokens'),
      ('public','phase14_operational_alerts'),
      ('public','app_settings'),
      ('public','phase14_security_gates'),
      ('public','phase14_feature_policies'),
      ('public','phase14_ai_route_policies'),
      ('public','phase14_provider_attestations'),
      ('public','phase14_worker_capabilities'),
      ('public','phase14_worker_operations'),
      ('storage','objects'),
      ('phase14_private','runtime_secrets')
    ) as targets(schema_name, table_name)
  loop
    perform public.rc1_install_relation_guard(
      v_target.schema_name,
      v_target.table_name
    );
  end loop;
end;
$$;

create function public.rc1_install_new_relation_guards()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_command record;
  v_schema text;
  v_table text;
begin
  for v_command in
    select *
    from pg_catalog.pg_event_trigger_ddl_commands()
    where object_type in ('table', 'partitioned table')
  loop
    v_schema := v_command.schema_name;
    v_table := pg_catalog.split_part(v_command.object_identity, '.', 2);
    v_table := pg_catalog.replace(v_table, '"', '');
    if public.rc1_surface_for_relation(v_schema, v_table) is not null then
      perform public.rc1_install_relation_guard(v_schema, v_table);
    end if;
  end loop;
end;
$$;

create event trigger trg_rc1_install_new_relation_guards
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function public.rc1_install_new_relation_guards();

revoke all on function public.rc1_is_known_operation_surface(text)
  from public, anon, authenticated, service_role;
revoke all on function public.rc1_surface_for_relation(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.rc1_require_platform_admin(boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.rc1_guard_freeze_state_write()
  from public, anon, authenticated, service_role;
revoke all on function public.rc1_guard_authoritative_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.rc1_install_relation_guard(text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.rc1_install_new_relation_guards()
  from public, anon, authenticated, service_role;

revoke all on function public.rc1_require_operation_open(text)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_require_operation_open(text)
  to service_role;

revoke all on function public.rc1_freeze_status()
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_freeze_status()
  to authenticated, service_role;

revoke all on function public.rc1_activate_freeze(text)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_activate_freeze(text)
  to authenticated;

revoke all on function public.rc1_release_freeze(text,text,bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_release_freeze(text,text,bigint)
  to authenticated;

revoke all on function public.rc1_provision_certification_runtime_secret(text,text,text,bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_provision_certification_runtime_secret(text,text,text,bigint)
  to authenticated;

comment on table public.rc1_operation_freeze_state is
  'RC1 single authoritative operational-freeze row. Initial and fail-closed state is FROZEN.';
comment on table public.rc1_certification_secret_write_tokens is
  'Internal one-use transaction capabilities for the exact frozen RC1 certification-secret write; no API role has access.';
comment on function public.rc1_require_operation_open(text) is
  'Fails closed for unknown surfaces or unless the authoritative RC1 state is valid and RELEASED.';
comment on function public.rc1_release_freeze(text,text,bigint) is
  'AAL2 platform-admin compare-and-swap release requiring reason, evidence fingerprint, exact epoch, and no active canary authorization.';
comment on function public.rc1_provision_certification_runtime_secret(text,text,text,bigint) is
  'AAL2 platform-admin control plane for one approved certification HMAC write while RC1 remains exactly FROZEN.';

commit;
