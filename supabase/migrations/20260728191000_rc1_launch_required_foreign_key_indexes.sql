-- RC1 launch-required foreign-key indexes.
--
-- The allowlist is the controller-accepted HOT-PATH INDEX REQUIRED BEFORE
-- LAUNCH classification. Each entry is checked against its exact foreign-key
-- constraint and ordered columns before an ordinary transactional B-tree index
-- is created. A retry accepts only the exact expected index definition.

do $launch_fk_indexes$
declare
  target record;
  relation_oid oid;
  constraint_oid oid;
  actual_columns text[];
  expected_index_oid oid;
  expected_index_matches boolean;
  competing_covering_index text;
  column_list text;
begin
  for target in
    select *
    from (values
      ('phase14_private','worker_attestation_nonces','worker_attestation_nonces_capability_id_fkey','worker_attestation_nonces_capability_id_idx',array['capability_id']::text[]),
      ('phase14_private','worker_recovery_nonces','worker_recovery_nonces_capability_id_fkey','worker_recovery_nonces_capability_id_idx',array['capability_id']::text[]),
      ('public','backlog_reconciliation_records','backlog_reconciliation_records_report_id_fkey','backlog_reconciliation_records_report_id_idx',array['report_id']::text[]),
      ('public','customer_contact_verifications','customer_contact_verifications_assessment_id_fkey','customer_contact_verifications_assessment_id_idx',array['assessment_id']::text[]),
      ('public','email_events','email_events_assessment_id_fkey','email_events_assessment_id_idx',array['assessment_id']::text[]),
      ('public','email_events','email_events_order_id_fkey','email_events_order_id_idx',array['order_id']::text[]),
      ('public','manual_report_delivery_attempts','manual_report_delivery_attempts_email_event_id_fkey','manual_report_delivery_attempts_email_event_id_idx',array['email_event_id']::text[]),
      ('public','manual_report_generation_attempts','manual_report_generation_attempts_output_report_id_fkey','manual_report_generation_attempts_output_report_id_idx',array['output_report_id']::text[]),
      ('public','payment_proofs','payment_proofs_order_id_fkey','payment_proofs_order_id_idx',array['order_id']::text[]),
      ('public','phase14_operational_alerts','phase14_operational_alerts_email_event_id_fkey','phase14_operational_alerts_email_event_id_idx',array['email_event_id']::text[]),
      ('public','phase14_operational_alerts','phase14_operational_alerts_report_id_fkey','phase14_operational_alerts_report_id_idx',array['report_id']::text[]),
      ('public','phase14_provider_attestation_consumptions','phase14_provider_attestation_consumptions_authorization_id_fkey','phase14_provider_attestation_consumptions_authorization_id_idx',array['authorization_id']::text[]),
      ('public','phase14_provider_attestations','phase14_provider_attestations_authorization_id_fkey','phase14_provider_attestations_authorization_id_idx',array['authorization_id']::text[]),
      ('public','phase14_provider_attestations','phase14_provider_attestations_email_event_id_fkey','phase14_provider_attestations_email_event_id_idx',array['email_event_id']::text[]),
      ('public','phase14_storage_cleanup_queue','phase14_storage_cleanup_queue_lease_owner_capability_id_fkey','phase14_storage_cleanup_queue_lease_owner_capability_id_idx',array['lease_owner_capability_id']::text[]),
      ('public','phase14_storage_cleanup_queue','phase14_storage_cleanup_queue_owner_capability_id_fkey','phase14_storage_cleanup_queue_owner_capability_id_idx',array['owner_capability_id']::text[]),
      ('public','phase14_storage_cleanup_queue','phase14_storage_cleanup_queue_report_id_fkey','phase14_storage_cleanup_queue_report_id_idx',array['report_id']::text[]),
      ('public','phase14_worker_capabilities','phase14_worker_capabilities_assessment_id_fkey','phase14_worker_capabilities_assessment_id_idx',array['assessment_id']::text[]),
      ('public','phase14_worker_capabilities','phase14_worker_capabilities_fulfilment_id_fkey','phase14_worker_capabilities_fulfilment_id_idx',array['fulfilment_id']::text[]),
      ('public','phase14_worker_capabilities','phase14_worker_capabilities_order_id_fkey','phase14_worker_capabilities_order_id_idx',array['order_id']::text[]),
      ('public','phase14_worker_capabilities','phase14_worker_capabilities_report_id_fkey','phase14_worker_capabilities_report_id_idx',array['report_id']::text[]),
      ('public','phase14_worker_capabilities','phase14_worker_capabilities_score_run_id_fkey','phase14_worker_capabilities_score_run_id_idx',array['score_run_id']::text[]),
      ('public','phase14_workflow_start_outbox','phase14_workflow_start_outbox_fulfilment_id_fkey','phase14_workflow_start_outbox_fulfilment_id_idx',array['fulfilment_id']::text[]),
      ('public','report_ai_attempts','report_ai_attempts_manual_assessment_id_fkey','report_ai_attempts_manual_assessment_id_idx',array['manual_assessment_id']::text[]),
      ('public','report_ai_attempts','report_ai_attempts_manual_order_id_fkey','report_ai_attempts_manual_order_id_idx',array['manual_order_id']::text[]),
      ('public','report_ai_attempts','report_ai_attempts_manual_score_run_id_fkey','report_ai_attempts_manual_score_run_id_idx',array['manual_score_run_id']::text[]),
      ('public','report_delivery_authorizations','report_delivery_authorizations_assessment_id_fkey','report_delivery_authorizations_assessment_id_idx',array['assessment_id']::text[]),
      ('public','report_delivery_authorizations','report_delivery_authorizations_bounce_remediation_fk','report_delivery_authorizations_bounce_remediation_idx',array['bounce_remediation_id']::text[]),
      ('public','report_delivery_authorizations','report_delivery_authorizations_order_id_fkey','report_delivery_authorizations_order_id_idx',array['order_id']::text[]),
      ('public','report_delivery_authorizations','report_delivery_authorizations_score_run_id_fkey','report_delivery_authorizations_score_run_id_idx',array['score_run_id']::text[]),
      ('public','report_delivery_authorizations','report_delivery_authorizations_worker_capability_id_fkey','report_delivery_authorizations_worker_capability_id_idx',array['worker_capability_id']::text[]),
      ('public','report_delivery_finalizations','report_delivery_finalizations_fulfilment_id_fkey','report_delivery_finalizations_fulfilment_id_idx',array['fulfilment_id']::text[]),
      ('public','report_delivery_finalizations','report_delivery_finalizations_report_id_fkey','report_delivery_finalizations_report_id_idx',array['report_id']::text[]),
      ('public','report_delivery_remediations','report_delivery_remediations_prior_email_event_id_fkey','report_delivery_remediations_prior_email_event_id_idx',array['prior_email_event_id']::text[]),
      ('public','report_delivery_remediations','report_delivery_remediations_report_id_fkey','report_delivery_remediations_report_id_idx',array['report_id']::text[]),
      ('public','report_events','report_events_report_id_fkey','report_events_report_id_idx',array['report_id']::text[]),
      ('public','report_fulfilments','report_fulfilments_delivery_capability_id_fkey','report_fulfilments_delivery_capability_id_idx',array['delivery_capability_id']::text[]),
      ('public','report_fulfilments','report_fulfilments_generation_capability_id_fkey','report_fulfilments_generation_capability_id_idx',array['generation_capability_id']::text[]),
      ('public','report_generation_claims','report_generation_claims_fulfilment_id_fkey','report_generation_claims_fulfilment_id_idx',array['fulfilment_id']::text[]),
      ('public','report_generation_claims','report_generation_claims_order_id_fkey','report_generation_claims_order_id_idx',array['order_id']::text[]),
      ('public','report_generation_claims','report_generation_claims_report_id_fkey','report_generation_claims_report_id_idx',array['report_id']::text[]),
      ('public','report_generation_claims','report_generation_claims_score_run_id_fkey','report_generation_claims_score_run_id_idx',array['score_run_id']::text[]),
      ('public','reports','reports_score_run_id_fkey','reports_score_run_id_idx',array['score_run_id']::text[]),
      ('public','reports','reports_supersedes_report_id_fkey','reports_supersedes_report_id_idx',array['supersedes_report_id']::text[]),
      ('public','reports','reports_template_id_fkey','reports_template_id_idx',array['template_id']::text[])
    ) as approved(
      schema_name,
      table_name,
      constraint_name,
      index_name,
      columns
    )
  loop
    select c.oid
    into relation_oid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = target.schema_name
      and c.relname = target.table_name
      and c.relkind in ('r', 'p');

    if relation_oid is null then
      raise exception
        'rc1_launch_fk_indexes:table_missing:%.%',
        target.schema_name,
        target.table_name;
    end if;

    select con.oid,
      array(
        select a.attname
        from unnest(con.conkey) with ordinality key(attnum, position)
        join pg_attribute a
          on a.attrelid = con.conrelid
         and a.attnum = key.attnum
        order by key.position
      )
    into constraint_oid, actual_columns
    from pg_constraint con
    where con.conrelid = relation_oid
      and con.conname = target.constraint_name
      and con.contype = 'f';

    if constraint_oid is null then
      raise exception
        'rc1_launch_fk_indexes:constraint_missing:%.%:%',
        target.schema_name,
        target.table_name,
        target.constraint_name;
    end if;

    if actual_columns is distinct from target.columns then
      raise exception
        'rc1_launch_fk_indexes:constraint_columns_changed:%.%:%',
        target.schema_name,
        target.table_name,
        target.constraint_name;
    end if;

    select ci.oid
    into expected_index_oid
    from pg_class ci
    join pg_namespace ni on ni.oid = ci.relnamespace
    where ni.nspname = target.schema_name
      and ci.relname = target.index_name
      and ci.relkind = 'i';

    if expected_index_oid is not null then
      select
        ix.indrelid = relation_oid
        and am.amname = 'btree'
        and not ix.indisunique
        and not ix.indisprimary
        and ix.indisvalid
        and ix.indisready
        and ix.indpred is null
        and ix.indexprs is null
        and ix.indnkeyatts = cardinality(target.columns)
        and ix.indnatts = cardinality(target.columns)
        and array(
          select a.attname
          from generate_series(1, ix.indnkeyatts) position
          join pg_attribute a
            on a.attrelid = ix.indrelid
           and a.attnum = (
             string_to_array(ix.indkey::text, ' ')::smallint[]
           )[position]
          order by position
        )::text[] = target.columns
      into expected_index_matches
      from pg_index ix
      join pg_class ci on ci.oid = ix.indexrelid
      join pg_am am on am.oid = ci.relam
      where ix.indexrelid = expected_index_oid;

      if not coalesce(expected_index_matches, false) then
        raise exception
          'rc1_launch_fk_indexes:conflicting_named_index:%.%',
          target.schema_name,
          target.index_name;
      end if;

      continue;
    end if;

    select ci.relname
    into competing_covering_index
    from pg_index ix
    join pg_class ci on ci.oid = ix.indexrelid
    where ix.indrelid = relation_oid
      and ix.indisvalid
      and ix.indisready
      and ix.indpred is null
      and ix.indexprs is null
      and (
        string_to_array(ix.indkey::text, ' ')::smallint[]
      )[1:cardinality(target.columns)] = (
        select con.conkey
        from pg_constraint con
        where con.oid = constraint_oid
      )
    order by ci.relname
    limit 1;

    if competing_covering_index is not null then
      raise exception
        'rc1_launch_fk_indexes:unexpected_existing_coverage:%.%:%',
        target.schema_name,
        target.table_name,
        competing_covering_index;
    end if;

    select string_agg(format('%I', column_name), ', ' order by position)
    into column_list
    from unnest(target.columns) with ordinality cols(column_name, position);

    execute format(
      'create index %I on %I.%I using btree (%s)',
      target.index_name,
      target.schema_name,
      target.table_name,
      column_list
    );
  end loop;
end;
$launch_fk_indexes$;
