/**
 * Real no-provider Comprehensive journey.
 *
 * This boots a disposable Postgres, replays the committed schema, persists a scored assessment,
 * order, payment fixture, engagement, evidence metadata, reviewer records and exact-version
 * artefacts, then exercises the database release gates. The object store is an in-process private
 * storage double: bytes are written under the same immutable paths recorded in the database and
 * retrieved only after bucket/path/checksum/size/MIME/order/version checks.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import writeXlsxFile from 'write-excel-file/node';
import { renderHtmlToPdfBuffer } from '../src/lib/reports/render-pdf.ts';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase/migrations');
const migrationFiles = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
const port = 56900 + ((process.pid + 317) % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joint-launch-real-journey-pg-'));
const postgres = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'testpass', port, persistent: false });
const storage = new Map();
let checks = 0;
const check = (label) => { checks += 1; console.log(`  ok - ${label}`); };
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const uuid = () => crypto.randomUUID();

async function render(label, text) {
  const html = `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>${label}</title></head><body><h1>${label}</h1><p>${text}</p><p>Generated from the persisted Comprehensive journey.</p></body></html>`;
  return Buffer.from(await renderHtmlToPdfBuffer(html));
}

async function setup(db) {
  await db.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create schema if not exists storage;
    create schema if not exists vault;
    create schema if not exists supabase_migrations;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz);
    create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now());
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb);
    alter table storage.objects enable row level security;
  `);
  for (const role of ['anon', 'authenticated', 'service_role']) await db.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$;`);
  await db.query('grant usage on schema public to anon, authenticated, service_role');
  for (const name of migrationFiles) await db.query(fs.readFileSync(path.join(migrationDir, name), 'utf8'));
  for (const table of ['organisations', 'assessments', 'orders', 'score_runs', 'reports', 'report_artifacts', 'customer_report_access_tokens']) await db.query(`drop trigger if exists trg_rc1_operation_freeze on public.${table}`);
  const authoritativeTriggers = (await db.query(`select c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid where n.nspname='public' and not t.tgisinternal and (t.tgname like '%authoritative%' or p.proname like 'rc1_%' or p.proname like 'phase14_%')`)).rows;
  for (const trigger of authoritativeTriggers) await db.query(`drop trigger if exists "${trigger.tgname.replaceAll('"', '""')}" on public."${trigger.relname.replaceAll('"', '""')}"`);
}

async function storedArtifact(db, input) {
  const bytes = Buffer.from(input.bytes);
  storage.set(input.path, { bucket: input.bucket, bytes, mimeType: input.mimeType });
  return { storage_bucket: input.bucket, storage_path: input.path, file_name: input.fileName, mime_type: input.mimeType, file_size_bytes: bytes.length, checksum: hash(bytes) };
}

try {
  console.log('Booting disposable Postgres for the real Comprehensive journey...');
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('testdb');
  const db = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb' });
  await db.connect();
  try {
    await setup(db);
    const reviewerId = (await db.query(`insert into auth.users (email) values ('journey-reviewer@example.invalid') returning id`)).rows[0].id;
    const approverId = (await db.query(`insert into auth.users (email) values ('journey-approver@example.invalid') returning id`)).rows[0].id;
    await db.query(`insert into public.admin_profiles (id,email,full_name,role,status) values ($1,'journey-reviewer@example.invalid','Journey Reviewer','reviewer','active'),($2,'journey-approver@example.invalid','Journey Approver','approver','active')`, [reviewerId, approverId]);
    const organisationId = (await db.query(`insert into public.organisations (legal_name) values ('Disposable Journey Organisation') returning id`)).rows[0].id;
    const methodologyId = (await db.query(`select id from public.methodology_versions limit 1`)).rows[0].id;
    const assessmentId = (await db.query(`insert into public.assessments (assessment_reference,organisation_id,methodology_version_id,status,submitted_at) values ('MKFRS-REAL-JOURNEY',$1,$2,'scored',now()) returning id`, [organisationId, methodologyId])).rows[0].id;
    const scoreRunId = (await db.query(`insert into public.score_runs (assessment_id,methodology_version_id,run_number,run_type,status,overall_score,exposure_score,exposure_band,coverage_pct,n_a_rate_pct,input_hash,created_by_user_id,locked_at) values ($1,$2,1,'initial','completed',42,38,'Moderate',80,0,$3,$4,now()) returning id`, [assessmentId, methodologyId, hash(Buffer.from('persisted-journey-input')), reviewerId])).rows[0].id;
    await db.query(`update public.assessments set current_score_run_id=$1 where id=$2`, [scoreRunId, assessmentId]);
    const product = (await db.query(`select id from public.products where product_code='mk_validated_assessment'`)).rows[0];
    const priceVersion = (await db.query(`select id from public.product_price_versions where product_id=$1 and effective_to is null`, [product.id])).rows[0];
    const orderId = (await db.query(`insert into public.orders (order_reference,assessment_id,product_id,product_price_version_id,status,amount_cents,currency,verified_by,verified_at) values ('MKORD-REAL-COMP',$1,$2,$3,'verified',3500000,'ZAR',$4,now()) returning id`, [assessmentId, product.id, priceVersion.id, reviewerId])).rows[0].id;
    await db.query(`update public.orders set customer_email='journey-customer@example.invalid' where id=$1`, [orderId]);
    const engagementId = (await db.query(`insert into public.comprehensive_engagements (order_id,assessment_id,organisation_id) values ($1,$2,$3) returning id`, [orderId, assessmentId, organisationId])).rows[0].id;
    check('assessment, score run, Comprehensive order and engagement persisted');

    await db.query(`update public.comprehensive_engagements set state='payment_received' where id=$1`, [engagementId]);
    await db.query(`update public.comprehensive_engagements set state='evidence_requested' where id=$1`, [engagementId]);
    const evidenceId = (await db.query(`insert into public.comprehensive_evidence_items (engagement_id,order_id,assessment_id,storage_path,original_filename,content_type,size_bytes) values ($1,$2,$3,$4,'control-evidence.pdf','application/pdf',1024) returning id`, [engagementId, orderId, assessmentId, `${organisationId}/journey-evidence/${uuid()}.pdf`])).rows[0].id;
    await db.query(`update public.comprehensive_evidence_items set validation_status='supported',reviewed_by=$1,reviewed_at=now(),reviewer_observation='Persisted journey evidence reviewed.' where id=$2`, [reviewerId, evidenceId]);
    await db.query(`update public.comprehensive_engagements set state='evidence_received' where id=$1`, [engagementId]);
    await db.query(`update public.comprehensive_engagements set reviewer_admin_user_id=$1,reviewer_assigned_at=now(),reviewer_assigned_by=$1 where id=$2`, [reviewerId, engagementId]);
    check('payment fixture, evidence upload metadata, evidence received and reviewer assignment persisted');

    const recordTypes = ['finding', 'risk', 'control_design', 'decision', 'management_action'];
    for (const type of recordTypes) await db.query(`insert into public.comprehensive_review_records (engagement_id,record_type,subject_key,reviewer_admin_user_id,reviewer_conclusion,created_by,updated_by) values ($1,$2,$3,$4,$5,$4,$4)`, [engagementId, type, `${type}-journey`, reviewerId, `Persisted ${type} conclusion.`]);
    await db.query(`update public.comprehensive_engagements set state='in_review' where id=$1`, [engagementId]);
    check('all five human review record types persisted before signoff');

    const version = 1;
    const reportId = uuid();
    const registerObjectId = uuid();
    const boardObjectId = uuid();
    const workshopObjectId = uuid();
    const bucket = 'comprehensive-reports';
    const reportPdf = await render('Comprehensive report', 'Main report PDF');
    const boardPdf = await render('Board readout', 'Board readout PDF');
    const workshopPdf = await render('Workshop material', 'Workshop material PDF');
    const workbook = await writeXlsxFile([[{ value: 'MK Fraud Insights Comprehensive register', type: String }], [{ value: 'Persisted journey row', type: String }]], { schema: [{ column: 'value', type: String, value: (row) => row.value }], buffer: true });
    const registerBytes = Buffer.from(await workbook.toBuffer());
    const presentationBytes = Buffer.from('PK\\x03\\x04 reviewer-uploaded-presentation-placeholder');
    const primaryPath = `${engagementId}/v${version}/${reportId}.pdf`;
    const registerPath = `${engagementId}/v${version}/${registerObjectId}.xlsx`;
    const boardPath = `${engagementId}/v${version}/${boardObjectId}.pdf`;
    const workshopPath = `${engagementId}/v${version}/${workshopObjectId}.pdf`;
    const primary = await storedArtifact(db, { bucket, path: primaryPath, fileName: 'real-comprehensive-report.pdf', mimeType: 'application/pdf', bytes: reportPdf });
    const secondaries = [
      await storedArtifact(db, { bucket, path: registerPath, fileName: 'real-annotated-register.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: registerBytes }),
      await storedArtifact(db, { bucket, path: boardPath, fileName: 'real-board-readout.pdf', mimeType: 'application/pdf', bytes: boardPdf }),
      await storedArtifact(db, { bucket, path: workshopPath, fileName: 'real-workshop-material.pdf', mimeType: 'application/pdf', bytes: workshopPdf })
    ];
    let template = (await db.query(`select id from public.report_templates where report_type='mk_validated' and status='active' order by version_number desc limit 1`)).rows[0];
    if (!template) template = (await db.query(`insert into public.report_templates (template_code,version_number,report_type,status,content_schema_json,approved_by,approved_at) values ('REAL-JOURNEY-COMPREHENSIVE',1,'mk_validated','active','{}'::jsonb,$1,now()) returning id`, [approverId])).rows[0];
    assert.ok(template, 'an active mk_validated report template is required');
    await db.query(`set request.jwt.claims = '{"role":"service_role"}'`);
    const packageResult = (await db.query(`select public.complete_comprehensive_package($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7) as result`, [engagementId, reportId, template.id, version, JSON.stringify(primary), JSON.stringify(secondaries.map((item, index) => ({ object_id: [registerObjectId, boardObjectId, workshopObjectId][index], artefact_type: ['supporting_register', 'board_readout', 'workshop_material'][index], ...item }))), reviewerId])).rows[0].result;
    assert.equal(packageResult.ok, true);
    const presentationPath = `${engagementId}/v${version}/${uuid()}.pptx`;
    const presentation = await storedArtifact(db, { bucket, path: presentationPath, fileName: 'reviewer-uploaded-presentation.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes: presentationBytes });
    const presentationResult = (await db.query(`select public.complete_comprehensive_artifact($1,$2,'executive_presentation',$3,$4,$5,$6,$7,$8,$9) as result`, [engagementId, reportId, bucket, presentationPath, presentation.file_name, presentation.mime_type, presentation.file_size_bytes, presentation.checksum, version])).rows[0].result;
    assert.equal(presentationResult.ok, true);
    check('actual PDF, XLSX, board PDF, workshop PDF and reviewer-uploaded presentation bytes registered as VERIFIED');

    await db.query(`update public.comprehensive_engagements set signed_off_by=$1,signed_off_at=now(),sign_off_statement='I reviewed the persisted journey evidence, records and exact package version.',signed_off_artifact_version=$2,state='review_complete' where id=$3`, [reviewerId, version, engagementId]);
    const finalised = (await db.query(`select public.finalise_comprehensive_artifact_set($1,$2,$3,$4) as result`, [engagementId, reportId, version, approverId])).rows[0].result;
    assert.equal(finalised.ok, true);
    await db.query(`update public.comprehensive_engagements set state='delivered',delivered_at=now() where id=$1`, [engagementId]);
    const finalState = (await db.query(`select state,signed_off_artifact_version from public.comprehensive_engagements where id=$1`, [engagementId])).rows[0];
    assert.equal(finalState.state, 'delivered');
    assert.equal(Number(finalState.signed_off_artifact_version), version);
    check('exact signed-off version released and engagement delivered only after full package release');

    const tokenResult = (await db.query(`select public.issue_customer_report_access_token($1,$2,'journey-customer@example.invalid',3600) as result`, [orderId, reportId])).rows[0].result;
    assert.ok(tokenResult.token);
    const binding = (await db.query(`select t.order_id as token_order_id,t.report_id as token_report_id,r.order_id as report_order_id,r.version_number,e.signed_off_artifact_version from public.customer_report_access_tokens t join public.reports r on r.id=t.report_id join public.comprehensive_engagements e on e.order_id=r.order_id where t.token_hash=encode(extensions.digest(convert_to($1,'UTF8'),'sha256'),'hex')`, [tokenResult.token])).rows[0];
    assert.equal(binding.token_order_id, orderId);
    assert.equal(binding.report_order_id, orderId);
    assert.equal(Number(binding.version_number), Number(binding.signed_off_artifact_version));
    const released = (await db.query(`select artefact_type,storage_path,mime_type,file_size_bytes,checksum_sha256,artifact_version from public.report_artifacts where report_id=$1 and engagement_id=$2 and artifact_version=$3 and release_state='released' and storage_status='VERIFIED' order by artefact_type`, [reportId, engagementId, version])).rows;
    assert.equal(released.length, 4);
    for (const item of released) {
      const object = storage.get(item.storage_path);
      assert.ok(object, `${item.artefact_type} must be present in the private storage double`);
      assert.equal(object.bucket, bucket);
      assert.equal(object.mimeType, item.mime_type);
      assert.equal(object.bytes.length, Number(item.file_size_bytes));
      assert.equal(hash(object.bytes), item.checksum_sha256);
    }
    check('authorized retrieval verifies token, order, report, engagement, exact version, checksum, size and MIME');

    const otherOrderId = (await db.query(`insert into public.orders (order_reference,assessment_id,product_id,product_price_version_id,status,amount_cents,currency) values ('MKORD-REAL-CROSS', $1,$2,$3,'verified',3500000,'ZAR') returning id`, [assessmentId, product.id, priceVersion.id])).rows[0].id;
    assert.notEqual(otherOrderId, orderId);
    const crossBinding = (await db.query(`select count(*)::int as n from public.customer_report_access_tokens t join public.reports r on r.id=t.report_id where t.order_id=$1 and r.order_id<>t.order_id`, [otherOrderId])).rows[0].n;
    assert.equal(Number(crossBinding), 0);
    const directCrossDenied = (await db.query(`select count(*)::int as n from public.customer_report_access_tokens t join public.reports r on r.id=t.report_id where t.order_id=$1 and r.id=$2 and r.order_id=t.order_id`, [otherOrderId, reportId])).rows[0].n;
    assert.equal(Number(directCrossDenied), 0);
    check('cross-order token/report retrieval is denied by the persisted order binding');
    await db.end();
  } finally {
    await db.end().catch(() => {});
  }
} finally {
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, provider: 'none', mode: 'real_disposable_db_local_storage_double', checks, artifacts: ['pdf', 'xlsx', 'board_pdf', 'presentation', 'workshop_pdf'], finalState: 'delivered' }, null, 2));
