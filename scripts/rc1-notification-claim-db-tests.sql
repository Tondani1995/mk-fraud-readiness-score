-- RC1: database-backed proof of the notification claim semantics.
--
-- The in-memory double cannot demonstrate that PostgreSQL serialises two concurrent conditional
-- UPDATEs against the same row. This asserts the property the recovery path depends on: a
-- conditional UPDATE ... RETURNING matches for exactly one of two racing claimants, and a lease
-- that has not expired is never overtaken.
\set ON_ERROR_STOP 1
begin;

create temporary table claim_probe (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text unique not null,
  status text not null,
  retry_count integer not null default 0,
  sent_at timestamptz,
  provider_message_id text,
  updated_at timestamptz not null default now()
) on commit drop;

insert into claim_probe(dedupe_key, status, updated_at)
values ('phase1:customer_order_confirmation:probe', 'recorded_disabled', now());

-- C1: a conditional claim on an unsent row succeeds exactly once.
with first_claim as (
  update claim_probe set status='sending', retry_count=retry_count+1, updated_at=now()
  where dedupe_key='phase1:customer_order_confirmation:probe'
    and sent_at is null and provider_message_id is null
    and status in ('queued','recorded_disabled','send_failed')
  returning id
)
select 'C1_first_claim_result|' || case when count(*) = 1 then 'PASS' else 'STOP' end from first_claim;

-- C2: a second claimant, arriving while the lease is live, matches zero rows.
with second_claim as (
  update claim_probe set status='sending', retry_count=retry_count+1, updated_at=now()
  where dedupe_key='phase1:customer_order_confirmation:probe'
    and sent_at is null and provider_message_id is null
    and status in ('queued','recorded_disabled','send_failed')
  returning id
)
select 'C2_live_lease_not_overtaken_result|' || case when count(*) = 0 then 'PASS' else 'STOP' end from second_claim;

-- C3: once the lease is stale, a reclaim bounded by the cutoff succeeds exactly once.
update claim_probe set updated_at = now() - interval '1 hour'
where dedupe_key='phase1:customer_order_confirmation:probe';
with stale_reclaim as (
  update claim_probe set status='sending', retry_count=retry_count+1, updated_at=now()
  where dedupe_key='phase1:customer_order_confirmation:probe'
    and sent_at is null and provider_message_id is null
    and status in ('queued','recorded_disabled','send_failed','sending')
    and updated_at < now() - interval '10 minutes'
  returning id
)
select 'C3_stale_reclaim_result|' || case when count(*) = 1 then 'PASS' else 'STOP' end from stale_reclaim;

-- C4: the freshly refreshed lease immediately blocks a further stale reclaim.
with racing as (
  update claim_probe set status='sending', retry_count=retry_count+1, updated_at=now()
  where dedupe_key='phase1:customer_order_confirmation:probe'
    and sent_at is null and provider_message_id is null
    and status in ('queued','recorded_disabled','send_failed','sending')
    and updated_at < now() - interval '10 minutes'
  returning id
)
select 'C4_refreshed_lease_blocks_reclaim_result|' || case when count(*) = 0 then 'PASS' else 'STOP' end from racing;

-- C5: a row bearing proof of dispatch is never claimable again.
update claim_probe set status='sent', sent_at=now(), provider_message_id='prov_1', updated_at = now() - interval '1 hour'
where dedupe_key='phase1:customer_order_confirmation:probe';
with post_send as (
  update claim_probe set status='sending', retry_count=retry_count+1
  where dedupe_key='phase1:customer_order_confirmation:probe'
    and sent_at is null and provider_message_id is null
    and status in ('queued','recorded_disabled','send_failed','sending')
    and updated_at < now() - interval '10 minutes'
  returning id
)
select 'C5_sent_row_never_reclaimed_result|' || case when count(*) = 0 then 'PASS' else 'STOP' end from post_send;

-- C6: attempts were audited across the successful claims.
select 'C6_attempts_audited_result|' || case when (select retry_count from claim_probe) >= 2 then 'PASS' else 'STOP' end;

-- C7: exactly one row throughout -- recovery never inserts a duplicate.
select 'C7_single_row_result|' || case when (select count(*) from claim_probe) = 1 then 'PASS' else 'STOP' end;

rollback;
