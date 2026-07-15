\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;
insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
values('25000000-0000-0000-0000-000000000001','webhook-route-db@example.invalid',
  'Webhook Route DB Fixture','platform_admin','active',true);
update public.phase14_security_gates
set status='satisfied',satisfied_version=required_version,
  satisfied_by='25000000-0000-0000-0000-000000000001',satisfied_at=now(),
  reason='isolated route-to-database test',updated_at=now()
where gate_key='phase14-premium-report';
update public.phase14_feature_policies
set enabled=true,approved_gate_version=(select required_version from public.phase14_security_gates
    where gate_key='phase14-premium-report'),approved_at=now(),
  updated_by='25000000-0000-0000-0000-000000000001',
  reason='isolated route-to-database test',updated_at=now()
where policy_key='provider_webhook_ingestion';
insert into phase14_private.runtime_secrets(secret_key,secret_value,rotated_by)
values('provider_webhook_db_hmac','phase14-route-db-hmac-secret-00000000000000000001',
  '25000000-0000-0000-0000-000000000001');
set local session_replication_role=origin;
commit;
