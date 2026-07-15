import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const outputPath = path.join(root, 'scripts/phase14-production-canonical-reconciliation.sql');
const sources = [
  'docs/v1/phase14/migration-audit-archive/uat-applied/0020_phase14_privileged_function_grants.sql',
  'docs/v1/phase14/migration-audit-archive/uat-applied/0021_phase14_adversarial_remediation.sql',
  'docs/v1/phase14/migration-audit-archive/uat-applied/0022_phase14_adversarial_remediation_grants.sql',
  'docs/v1/phase14/migration-audit-archive/uat-applied/20260714194317_phase14_security_state_machine_closure.sql',
  'docs/v1/phase14/migration-audit-archive/uat-applied/20260714201550_phase14_webhook_state_machine.sql',
  'docs/v1/phase14/migration-audit-archive/uat-applied/20260714214023_phase14_fourth_adversarial_remediation.sql',
  'docs/v1/phase14/migration-audit-archive/unpublished-remediation/20260715022146_phase14_fifth_adversarial_remediation.sql',
  'docs/v1/phase14/migration-audit-archive/unpublished-remediation/20260715073613_phase14_sixth_adversarial_remediation.sql',
  'docs/v1/phase14/migration-audit-archive/unpublished-remediation/20260715073614_phase14_sixth_handoff_corrections.sql'
];

function bodyFor(relativePath) {
  const sql = fs.readFileSync(path.join(root, relativePath), 'utf8');
  return sql.split(/\r?\n/)
    .filter((line) => !/^\s*(begin|commit);\s*$/i.test(line))
    .join('\n')
    .trim();
}

const sourceHashes = sources.map((relativePath) => ({
  relativePath,
  hash: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex')
}));
const sourceBlocks = sourceHashes.map(({ relativePath, hash }) => [
  `-- BEGIN PRODUCTION DELTA SOURCE: ${relativePath} (sha256:${hash})`,
  bodyFor(relativePath),
  `-- END PRODUCTION DELTA SOURCE: ${relativePath}`
].join('\n')).join('\n\n');
const statementEvidence = sourceHashes.map(({ hash }) => hash).join(' + ');

const expectedProductionLedger = [
  '0001|0001_phase2_v1_1_schema_rls',
  '0002|0002_phase4_dev_seed',
  '0003|0003_phase5_methodology_seed',
  '0004|0004_phase4_v1_2_rate_limiting',
  '0005|0005_phase5_v1_1_guards',
  '0006|0006_phase6_scoring_guards',
  '0007|0007_phase6_v1_1_atomic_scoring',
  '0009|0009_methodology_copy_polish',
  '20260708181207|0010_phase9_manual_eft_order_flow',
  '20260708193238|phase10_report_engine_additions',
  '20260708193318|phase9_phase10_private_storage_buckets',
  '20260708194834|phase10_v2_report_engine_content',
  '20260709033522|phase10_v2_report_template_seed',
  '20260710220504|0012_phase13_commercial_event_foundation',
  '20260710220746|0013_phase13_event_index_cleanup',
  '20260711211557|0014_phase13_customer_commercial_conversion',
  '20260711211654|0015_phase13_data_request_policy_cleanup',
  '20260712153438|platform_database_hardening',
  '20260712180303|phase14_report_fulfilment_core',
  '20260712180317|phase14_report_generation_runs',
  '20260712180329|phase14_report_links',
  '20260712180346|phase14_report_security_and_flags',
  '20260712182003|phase14_pdf_email_delivery',
  '20260712184501|phase14_email_delivery_state_hardening'
];
const ledgerArray = expectedProductionLedger.map((entry) => `'${entry}'`).join(',\n    ');

const generated = `\\set ON_ERROR_STOP on
-- CONTROLLER-ONLY, PRODUCTION-SPECIFIC reconciliation artefact.
-- Never use this file for UAT. Never execute without a separate controller approval.
-- It applies only the closure/fourth/fifth/sixth delta and keeps every gate,
-- feature policy and AI route disabled.

select pg_advisory_lock(hashtextextended('phase14-production-canonical-reconciliation',0));
select exists(
  select 1 from supabase_migrations.schema_migrations
  where version='0017' and name='phase14_canonical_disabled_foundation'
) as phase14_production_already_reconciled \\gset

\\if :phase14_production_already_reconciled
do $safe_restart$
begin
  if to_regprocedure('public.admin_terminal_phase14_generation_publication(jsonb)') is null
     or to_regprocedure('public.recover_phase14_worker_capability_lease(jsonb,text)') is null
     or exists(select 1 from public.phase14_feature_policies where enabled)
     or exists(select 1 from public.phase14_ai_route_policies where enabled)
     or exists(select 1 from public.phase14_security_gates where status<>'unsatisfied' or satisfied_version<>0) then
    raise exception 'phase14_production_safe_restart_posture_invalid';
  end if;
end;
$safe_restart$;
\\echo 'Production canonical acknowledgement already exists; safe restart verified and no delta executed.'
\\else
do $preflight$
declare
  v_actual text[]; v_expected constant text[]:=array[
    ${ledgerArray}
  ];
  v_final_schema boolean;
begin
  select array_agg(version||'|'||name order by version,name) into v_actual
  from supabase_migrations.schema_migrations;
  if v_actual is distinct from v_expected then
    raise exception 'phase14_production_ledger_mismatch: expected %, received %',v_expected,v_actual;
  end if;
  v_final_schema:=to_regprocedure('public.admin_terminal_phase14_generation_publication(jsonb)') is not null
    and to_regprocedure('public.recover_phase14_worker_capability_lease(jsonb,text)') is not null;
  if not v_final_schema and (
    to_regclass('public.report_fulfilments') is null
    or to_regclass('public.report_generation_runs') is null
    or to_regclass('public.email_provider_events') is null
    or to_regclass('public.phase14_security_gates') is not null
  ) then
    raise exception 'phase14_production_schema_boundary_mismatch';
  end if;
  if exists(select 1 from public.app_settings where setting_key='phase14_autonomous_report_engine'
      and coalesce((value_json->>'premium_report_auto_fulfilment_enabled')::boolean,false)) then
    raise exception 'phase14_production_automation_flag_unexpectedly_enabled';
  end if;
end;
$preflight$;

select (
  to_regprocedure('public.admin_terminal_phase14_generation_publication(jsonb)') is null
  or to_regprocedure('public.recover_phase14_worker_capability_lease(jsonb,text)') is null
) as phase14_production_delta_required \\gset

begin;
select set_config('lock_timeout','10s',true);
\\if :phase14_production_delta_required
${sourceBlocks}
\\else
\\echo 'Final schema is present without canonical ledger acknowledgement; performing ledger-only recovery.'
\\endif

delete from supabase_migrations.schema_migrations where version in (
  '20260712180303','20260712180317','20260712180329','20260712180346',
  '20260712182003','20260712184501'
);
insert into supabase_migrations.schema_migrations(version,name,statements)
values ('0017','phase14_canonical_disabled_foundation',array[
  'Controlled production reconciliation; source SHA-256: ${statementEvidence}'
])
on conflict (version) do update set name=excluded.name,statements=excluded.statements;

do $postflight$
begin
  if to_regprocedure('public.admin_terminal_phase14_generation_publication(jsonb)') is null
     or to_regprocedure('public.terminal_phase14_generation_publication(jsonb,text,text)') is null
     or to_regprocedure('public.recover_phase14_worker_capability_lease(jsonb,text)') is null
     or to_regprocedure('phase14_private.terminal_generation_core(jsonb,jsonb)') is null then
    raise exception 'phase14_production_reconciliation_postflight_function_missing';
  end if;
  if exists(select 1 from public.phase14_feature_policies where enabled)
     or exists(select 1 from public.phase14_ai_route_policies where enabled)
     or exists(select 1 from public.phase14_security_gates
       where status<>'unsatisfied' or satisfied_version<>0) then
    raise exception 'phase14_production_reconciliation_enabled_runtime_control';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
      where version='0017' and name='phase14_canonical_disabled_foundation')<>1
     or exists(select 1 from supabase_migrations.schema_migrations where version in (
       '20260712180303','20260712180317','20260712180329','20260712180346',
       '20260712182003','20260712184501')) then
    raise exception 'phase14_production_canonical_ledger_reconciliation_failed';
  end if;
end;
$postflight$;
commit;
\\endif
select pg_advisory_unlock(hashtextextended('phase14-production-canonical-reconciliation',0));
`;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== generated) {
    console.error('Production reconciliation artefact is stale. Regenerate it before committing.');
    process.exit(1);
  }
  console.log('Production reconciliation artefact matches its reviewed source files.');
} else {
  fs.writeFileSync(outputPath, generated);
  console.log(`Wrote ${path.relative(root, outputPath)} from ${sources.length} reviewed sources.`);
}
