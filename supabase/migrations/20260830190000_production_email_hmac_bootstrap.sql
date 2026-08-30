-- One-time Production bootstrap for the two Phase 14 provider HMAC secrets.
--
-- This is deliberately separate from set_phase14_runtime_secret(). The ordinary
-- rotation RPC remains authenticated-admin-only. The bootstrap route is a
-- temporary Production-only server seam whose deployment secret is removed after
-- these two rows are provisioned.
--
-- The existing runtime-secret table is intentionally retained as the storage
-- target. A null rotated_by is permitted only for this system bootstrap; the
-- paired audit_logs rows are the immutable provenance record. Ordinary rotations
-- continue to write their authenticated admin profile ID through the existing RPC.

begin;

alter table phase14_private.runtime_secrets
  alter column rotated_by drop not null;

comment on column phase14_private.runtime_secrets.rotated_by is
  'Authenticated admin profile for ordinary rotation; NULL is reserved for the one-time Production email HMAC bootstrap and is paired with a phase14_runtime_secret_bootstrapped audit row.';

create or replace function public.bootstrap_phase14_email_hmac_secrets(
  p_webhook_secret text,
  p_lookup_secret text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_webhook_fingerprint text;
  v_lookup_fingerprint text;
begin
  if p_webhook_secret is null
     or pg_catalog.char_length(p_webhook_secret) < 48
     or p_lookup_secret is null
     or pg_catalog.char_length(p_lookup_secret) < 48 then
    raise exception 'phase14_email_hmac_bootstrap_value_too_short';
  end if;

  if p_webhook_secret = p_lookup_secret then
    raise exception 'phase14_email_hmac_bootstrap_values_must_be_distinct';
  end if;

  -- Serialize the first-write decision. There is no separate marker table to
  -- clear: the two protected rows are the durable consumed/audit marker.
  lock table phase14_private.runtime_secrets in share row exclusive mode;

  select count(*)
    into v_existing_count
    from phase14_private.runtime_secrets
   where secret_key in ('provider_webhook_db_hmac', 'provider_lookup_db_hmac');

  if v_existing_count = 2 then
    raise exception 'phase14_email_hmac_bootstrap_already_complete';
  elsif v_existing_count <> 0 then
    raise exception 'phase14_email_hmac_bootstrap_partial_state';
  end if;

  v_webhook_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_webhook_secret, 'UTF8'), 'sha256'),
    'hex'
  );
  v_lookup_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_lookup_secret, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Reuse the existing authoritative audit context. No public table grant is
  -- added, and no raw secret is written to an audit payload.
  perform pg_catalog.set_config('phase14.authoritative_transition', 'runtime_secret_rotation', true);

  insert into phase14_private.runtime_secrets(
    secret_key, secret_value, rotated_at, rotated_by
  ) values
    ('provider_webhook_db_hmac', p_webhook_secret, v_now, null),
    ('provider_lookup_db_hmac', p_lookup_secret, v_now, null);

  insert into public.audit_logs(actor_type, entity_table, action, after_json)
  values
    ('system', 'phase14_private.runtime_secrets', 'phase14_runtime_secret_bootstrapped',
      pg_catalog.jsonb_build_object(
        'secret_key', 'provider_webhook_db_hmac',
        'fingerprint', v_webhook_fingerprint,
        'provisioning', 'one_time_production_bootstrap',
        'reason', 'Production email HMAC trust-chain bootstrap'
      )),
    ('system', 'phase14_private.runtime_secrets', 'phase14_runtime_secret_bootstrapped',
      pg_catalog.jsonb_build_object(
        'secret_key', 'provider_lookup_db_hmac',
        'fingerprint', v_lookup_fingerprint,
        'provisioning', 'one_time_production_bootstrap',
        'reason', 'Production email HMAC trust-chain bootstrap'
      ));

  return pg_catalog.jsonb_build_object(
    'provisioned_at', v_now,
    'fingerprints', pg_catalog.jsonb_build_object(
      'provider_webhook_db_hmac', v_webhook_fingerprint,
      'provider_lookup_db_hmac', v_lookup_fingerprint
    )
  );
end;
$$;

revoke all on function public.bootstrap_phase14_email_hmac_secrets(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.bootstrap_phase14_email_hmac_secrets(text, text)
  to service_role;

comment on function public.bootstrap_phase14_email_hmac_secrets(text, text) is
  'One-time Production-only deployment bootstrap for the two provider HMAC runtime secrets. Service-role execution only; rejects any existing or partial state; returns fingerprints only.';

commit;
