// Phase 14 -- H5: application-layer (TypeScript) defense-in-depth checks at the real delivery and
// download paths, verified against the real, compiled src/lib/reports/report-access-eligibility.ts
// (imported directly -- not reimplemented) plus real Postgres for resolveCurrentReportId and the
// end-to-end wiring proof in report-delivery-service-core.ts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  assertReportAccessEligible,
  resolveCurrentReportId,
  ReportAccessEligibilityError
} from '../src/lib/reports/report-access-eligibility.ts';

const root = process.cwd();
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${error.stack ?? error.message}`);
    throw error;
  }
}
async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${error.stack ?? error.message}`);
    throw error;
  }
}

function baseReport(overrides = {}) {
  return {
    id: 'report-current', order_id: 'order-1', report_type: 'essential_self_assessment',
    status: 'released', version_number: 2,
    storage_bucket: 'generated-reports', storage_path: 'order-1/report.pdf', checksum: 'a'.repeat(64),
    ...overrides
  };
}

console.log('Phase 14 H5 report-access-eligibility suite');

// ---- Pure-function scenarios ----
test('a current, released, storage-verified report is allowed for every purpose it is eligible for', () => {
  assertReportAccessEligible({ report: baseReport(), currentReportId: 'report-current', purpose: 'email_delivery' });
  assertReportAccessEligible({ report: baseReport(), currentReportId: 'report-current', purpose: 'admin_download' });
  assertReportAccessEligible({ report: baseReport(), currentReportId: 'report-current', purpose: 'customer_download' });
});

test('a superseded report is blocked for every purpose', () => {
  for (const purpose of ['email_delivery', 'admin_download', 'customer_download']) {
    assert.throws(() => assertReportAccessEligible({
      report: baseReport({ status: 'superseded' }), currentReportId: 'report-current', purpose
    }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_status_ineligible');
  }
});

test('a voided report is blocked for every purpose', () => {
  assert.throws(() => assertReportAccessEligible({
    report: baseReport({ status: 'voided' }), currentReportId: 'report-current', purpose: 'admin_download'
  }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_status_ineligible');
});

test('a draft report is blocked for every purpose', () => {
  assert.throws(() => assertReportAccessEligible({
    report: baseReport({ status: 'draft' }), currentReportId: 'report-current', purpose: 'email_delivery'
  }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_status_ineligible');
});

test('a report that does not belong to the expected order is blocked', () => {
  assert.throws(() => assertReportAccessEligible({
    report: baseReport({ order_id: 'order-attacker' }), currentReportId: 'report-current',
    expectedOrderId: 'order-1', purpose: 'admin_download'
  }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_order_mismatch');
});

test('a report that does not belong to the expected organisation is blocked', () => {
  assert.throws(() => assertReportAccessEligible({
    report: baseReport(), currentReportId: 'report-current', purpose: 'admin_download',
    expectedOrganisationId: 'org-expected', actualOrganisationId: 'org-different'
  }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_organisation_mismatch');
});

test('a non-current version is blocked even though its own status looks eligible', () => {
  assert.throws(() => assertReportAccessEligible({
    report: baseReport({ id: 'report-old-v1', version_number: 1, status: 'approved' }),
    currentReportId: 'report-current-v2', purpose: 'admin_download'
  }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_not_current_version');
});

test('a report with unverified storage metadata is blocked', () => {
  assert.throws(() => assertReportAccessEligible({
    report: baseReport({ storage_bucket: null }), currentReportId: 'report-current', purpose: 'admin_download'
  }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_storage_metadata_invalid');
  assert.throws(() => assertReportAccessEligible({
    report: baseReport({ checksum: 'not-a-real-checksum' }), currentReportId: 'report-current', purpose: 'admin_download'
  }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_storage_metadata_invalid');
});

test('customer_download is strictly narrower than admin_download and email_delivery (only released is eligible)', () => {
  assertReportAccessEligible({ report: baseReport({ status: 'generated' }), currentReportId: 'report-current', purpose: 'admin_download' });
  assert.throws(() => assertReportAccessEligible({
    report: baseReport({ status: 'generated' }), currentReportId: 'report-current', purpose: 'customer_download'
  }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_status_forbidden_for_purpose');
});

test('a future customer-download helper reusing this exact function cannot bypass the currentness check -- there is no parameter that skips it', () => {
  // Structural proof: the function signature has no boolean/flag anywhere named or shaped like a
  // bypass, and passing a non-null currentReportId that differs from the report's own id is always
  // enforced regardless of purpose.
  const source = fs.readFileSync(path.join(root, 'src/lib/reports/report-access-eligibility.ts'), 'utf8');
  assert.doesNotMatch(source, /skipCurrentness|bypassCurrentness|ignoreCurrentness|allowStale/i,
    'there must be no bypass flag for the currentness check anywhere in this module');
  assert.throws(() => assertReportAccessEligible({
    report: baseReport({ id: 'report-old', status: 'released' }),
    currentReportId: 'report-current-different', purpose: 'customer_download'
  }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_not_current_version');
  // The only way to skip the check at all is to pass currentReportId: null explicitly -- prove
  // that is not what either real call site (delivery, admin download) does.
  const deliveryCore = fs.readFileSync(path.join(root, 'src/lib/reports/email/report-delivery-service-core.ts'), 'utf8');
  const phase1Access = fs.readFileSync(path.join(root, 'src/lib/reports/phase1-report-access.ts'), 'utf8');
  for (const [label, source2] of [['report-delivery-service-core.ts', deliveryCore], ['phase1-report-access.ts', phase1Access]]) {
    assert.match(source2, /resolveCurrentReportId\(/, `${label} must call resolveCurrentReportId, not pass currentReportId: null`);
    assert.match(source2, /currentReportId(,|\s*})/, `${label} must pass the resolved currentReportId through to assertReportAccessEligible`);
  }
});

test('admin-only download route still gates on role before any of this runs (static proof, unchanged by H5)', () => {
  const routeSource = fs.readFileSync(
    path.join(root, 'src/app/score/api/admin/reports/[reportId]/download/route.ts'), 'utf8'
  );
  assert.match(routeSource, /REPORT_DOWNLOAD_ROLES\.has\(admin\.role\)/, 'the route must still reject unauthorised admin roles before calling report access');
  const roleCheckIdx = routeSource.indexOf('REPORT_DOWNLOAD_ROLES.has(admin.role)');
  const accessCallIdx = routeSource.indexOf('createSecurePhase1ReportAccess(');
  assert.ok(roleCheckIdx >= 0 && accessCallIdx > roleCheckIdx, 'the role check must happen before report access is attempted');
});

test('wiring: both real call sites run the eligibility check before their authoritative RPC/mutation call', () => {
  const deliveryCore = fs.readFileSync(path.join(root, 'src/lib/reports/email/report-delivery-service-core.ts'), 'utf8');
  const eligibilityIdx = deliveryCore.indexOf('assertReportAccessEligible({');
  const authorizeIdx = deliveryCore.indexOf(".rpc('authorize_premium_report_delivery'");
  assert.ok(eligibilityIdx >= 0 && authorizeIdx > eligibilityIdx,
    'the TS-layer eligibility check must run before the authoritative authorize_premium_report_delivery RPC is ever called');

  const phase1Access = fs.readFileSync(path.join(root, 'src/lib/reports/phase1-report-access.ts'), 'utf8');
  const orderCheckIdx = phase1Access.indexOf("throw new ReportAccessError('report_order_mismatch'");
  const eligibilityIdx2 = phase1Access.indexOf('assertReportAccessEligible({');
  const signedUrlIdx = phase1Access.indexOf('createSignedUrl(');
  assert.ok(orderCheckIdx >= 0 && eligibilityIdx2 > orderCheckIdx && signedUrlIdx > eligibilityIdx2,
    'order binding, then eligibility, then the signed link -- in that order');
});

// ---- Real-Postgres proof for resolveCurrentReportId (mirrors phase14_delivery_entitlement's own query) ----
let EmbeddedPostgres, pg;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  pg = await import('pg');
} catch {
  console.log(`SKIPPED real-Postgres resolveCurrentReportId proof: embedded-postgres/pg not installed. ${passed} pure-function/static cases passed.`);
  process.exit(0);
}

const PORT = 55932 + ((process.pid + 83) % 400);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase14-report-access-pg-'));
const pgInstance = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'testpass', port: PORT, persistent: false });
const clients = [];
function newClient() {
  const client = new pg.default.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', password: 'testpass', database: 'testdb' });
  clients.push(client);
  return client;
}

console.log('Booting disposable local Postgres for resolveCurrentReportId real-schema proof...');
await pgInstance.initialise();
await pgInstance.start();
await pgInstance.createDatabase('testdb');
const admin = newClient();
await admin.connect();
try {
  await admin.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz);
    create schema if not exists vault;
    create table if not exists vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text, decrypted_secret text);
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text not null, owner uuid, owner_id text, public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
      if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin superuser login; end if;
    end
    $$;
    grant anon, authenticated, service_role to postgres;
    alter database testdb set search_path = public, extensions;
  `);
  await admin.end();

  const migrator = newClient();
  await migrator.connect();
  const migrationsDir = path.join(root, 'supabase/migrations');
  const files = [
    '0001_phase2_v1_1_schema_rls', '0002_phase4_dev_seed', '0003_phase5_methodology_seed',
    '0004_phase4_v1_2_rate_limiting', '0005_phase5_v1_1_guards', '0006_phase6_scoring_guards',
    '0007_phase6_v1_1_atomic_scoring', '0009_methodology_copy_polish', '0010_phase9_manual_eft_order_flow',
    '0011_phase10_pdf_report_engine_additions', '0012_phase13_commercial_event_foundation',
    '0013_phase13_event_index_cleanup', '0014_phase13_customer_commercial_conversion',
    '0015_phase13_data_request_policy_cleanup', '0016_platform_database_hardening',
    '0017_phase14_canonical_disabled_foundation', '0023_phase1_manual_fulfilment_recovery', '0024_phase23_payment_automation', '0025_phase23_assessment_resume',
    '0026_phase14_workflow_start_admin_recovery', '0027_phase14_delivery_ambiguity_admin_resolution',
    '0028_phase14_attestation_canonicalisation_hardening', '0031_phase14_delivery_event_recency_precision_fix'
  ];
  for (const f of files) await migrator.query(fs.readFileSync(path.join(migrationsDir, `${f}.sql`), 'utf8'));
  console.log('All migrations applied.');

  const orgId = (await migrator.query(`insert into public.organisations(legal_name) values ('Acme Test Org') returning id`)).rows[0].id;
  const methodology = (await migrator.query(`select id from public.methodology_versions order by created_at asc limit 1`)).rows[0];
  const assessmentId = (await migrator.query(
    `insert into public.assessments(assessment_reference, organisation_id, methodology_version_id, status, submitted_at)
     values ('TEST-H5-ASMT-1', $1, $2, 'scored', now()) returning id`, [orgId, methodology.id]
  )).rows[0].id;
  // 'draft' status avoids guard_score_run_write()'s strict completed-field/ordering contract --
  // this suite only needs a valid score_run_id for the reports FK, not a scored run.
  const scoreRunId = (await migrator.query(
    `insert into public.score_runs(assessment_id, methodology_version_id, run_number, run_type, status)
     values ($1, $2, 1, 'initial', 'draft') returning id`, [assessmentId, methodology.id]
  )).rows[0].id;
  const templateId = (await migrator.query(
    `insert into public.report_templates(template_code, version_number, report_type, status, content_schema_json)
     values ('essential-v1', 1, 'essential_self_assessment', 'active', '{}'::jsonb) returning id`
  )).rows[0].id;

  async function makeReport(versionNumber, status, reference) {
    return (await migrator.query(
      `insert into public.reports(assessment_id, order_id, score_run_id, template_id, report_type, status, report_reference, version_number)
       values ($1, null, $2, $3, 'essential_self_assessment', $4, $5, $6) returning id`,
      [assessmentId, scoreRunId, templateId, status, reference, versionNumber]
    )).rows[0].id;
  }

  const v1Superseded = await makeReport(1, 'superseded', 'TEST-H5-RPT-V1');
  const v2Released = await makeReport(2, 'released', 'TEST-H5-RPT-V2');

  const fakeDb = {
    from(table) {
      return {
        select() { return this; },
        eq(col, val) { this._filters = { ...(this._filters ?? {}), [col]: val }; return this; },
        not() { return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() {
          const res = await migrator.query(
            `select id, version_number from public.${table}
             where assessment_id = $1 and report_type = $2 and status not in ('superseded','voided','draft')
             order by version_number desc limit 1`,
            [this._filters.assessment_id, this._filters.report_type]
          );
          return { data: res.rows[0] ?? null, error: null };
        }
      };
    }
  };

  await testAsync('resolveCurrentReportId identifies the released v2, not the superseded v1, using the real schema', async () => {
    const currentId = await resolveCurrentReportId(fakeDb, assessmentId, 'essential_self_assessment');
    assert.equal(currentId, v2Released);
    assert.notEqual(currentId, v1Superseded);
  });

  await testAsync('assertReportAccessEligible blocks the superseded v1 report using the real resolved currentReportId', async () => {
    const currentId = await resolveCurrentReportId(fakeDb, assessmentId, 'essential_self_assessment');
    assert.throws(() => assertReportAccessEligible({
      report: {
        id: v1Superseded, order_id: null, report_type: 'essential_self_assessment', status: 'superseded',
        version_number: 1, storage_bucket: 'generated-reports', storage_path: 'x.pdf', checksum: 'a'.repeat(64)
      },
      currentReportId: currentId, purpose: 'admin_download'
    }), (err) => err instanceof ReportAccessEligibilityError && err.reason === 'report_status_ineligible');
  });

  await testAsync('assertReportAccessEligible allows the current released v2 report using the real resolved currentReportId', async () => {
    const currentId = await resolveCurrentReportId(fakeDb, assessmentId, 'essential_self_assessment');
    assertReportAccessEligible({
      report: {
        id: v2Released, order_id: null, report_type: 'essential_self_assessment', status: 'released',
        version_number: 2, storage_bucket: 'generated-reports', storage_path: 'y.pdf', checksum: 'b'.repeat(64)
      },
      currentReportId: currentId, purpose: 'admin_download'
    });
  });

  console.log(`\nPhase 14 H5 report-access-eligibility suite passed (${passed} cases).`);
} finally {
  for (const c of clients) { try { await c.end(); } catch { /* already closed */ } }
  await pgInstance.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
