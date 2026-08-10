/**
 * Joint-launch evidence storage compensation proofs.
 *
 * Runs the real submitComprehensiveEvidence() against an in-memory recording double of the Supabase
 * client, so each of the four outcomes is exercised as behaviour rather than asserted from source:
 *
 *   1. upload succeeds + insert succeeds            -> object retained, no delete, no alert
 *   2. upload fails                                  -> no database write at all
 *   3. upload succeeds + insert fails + cleanup ok   -> object removed, no orphan, no alert
 *   4. upload succeeds + insert fails + cleanup fails -> reconciliation alert raised
 *
 * Credential-free: no database, no network, no storage provider.
 */

import assert from 'node:assert/strict';

import {
  submitComprehensiveEvidence
} from '../src/lib/comprehensive/evidence-service.ts';
import { COMPREHENSIVE_EVIDENCE_BUCKET } from '../src/lib/commercial/evidence-policy.ts';

let checks = 0;
function check(label) {
  checks += 1;
  console.log(`  ok - ${label}`);
}

const ENGAGEMENT = {
  id: '11111111-1111-4111-8111-111111111111',
  order_id: '22222222-2222-4222-8222-222222222222',
  assessment_id: '33333333-3333-4333-8333-333333333333',
  organisation_id: '44444444-4444-4444-8444-444444444444',
  state: 'evidence_requested',
  orders: { order_reference: 'MKORD-2026-TESTREF' }
};

const ASSESSMENT = {
  id: ENGAGEMENT.assessment_id,
  assessment_reference: 'MKFRS-2026-TESTREF',
  organisation_id: ENGAGEMENT.organisation_id,
  primary_respondent_id: '55555555-5555-4555-8555-555555555555'
};

/**
 * Minimal recording double. It models only what the evidence path touches, and records every
 * storage and database call so the test can assert on what did and did not happen.
 */
function makeDouble({ uploadError = null, insertError = null, removeError = null } = {}) {
  const calls = { uploads: [], removes: [], inserts: [], rpcs: [], selects: [], events: [] };

  const storage = {
    from(bucket) {
      return {
        async upload(storagePath, body, options) {
          calls.uploads.push({ bucket, storagePath, byteLength: body?.byteLength ?? body?.length ?? 0, options });
          return uploadError ? { data: null, error: uploadError } : { data: { path: storagePath }, error: null };
        },
        async remove(paths) {
          calls.removes.push({ bucket, paths });
          return removeError ? { data: null, error: removeError } : { data: paths.map((p) => ({ name: p })), error: null };
        }
      };
    }
  };

  function from(table) {
    const builder = {
      _table: table,
      _payload: null,
      select() { return builder; },
      eq() { return builder; },
      neq() { return builder; },
      order() { return builder; },
      insert(payload) { builder._payload = payload; calls.inserts.push({ table, payload }); return builder; },
      async maybeSingle() {
        calls.selects.push(table);
        if (table === 'comprehensive_engagements') return { data: ENGAGEMENT, error: null };
        return { data: null, error: null };
      },
      async single() {
        if (table === 'comprehensive_evidence_items') {
          if (insertError) return { data: null, error: insertError };
          return {
            data: {
              id: builder._payload.id,
              engagement_id: builder._payload.engagement_id,
              order_id: builder._payload.order_id,
              original_filename: builder._payload.original_filename,
              evidence_label: builder._payload.evidence_label,
              content_type: builder._payload.content_type,
              size_bytes: builder._payload.size_bytes,
              uploaded_at: new Date().toISOString(),
              submitted_by_email: builder._payload.submitted_by_email,
              validation_status: builder._payload.validation_status,
              reviewer_observation: null,
              reviewed_by: null,
              reviewed_at: null,
              retention_policy_key: builder._payload.retention_policy_key,
              orders: { order_reference: ENGAGEMENT.orders.order_reference }
            },
            error: null
          };
        }
        return { data: null, error: null };
      },
      then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); }
    };
    return builder;
  }

  async function rpc(name, params) {
    calls.rpcs.push({ name, params });
    return { data: 'alert-id', error: null };
  }

  return { double: { storage, from, rpc }, calls };
}

async function runWith(options) {
  const { double, calls } = makeDouble(options);
  const result = await submitComprehensiveEvidence({
    assessment: ASSESSMENT,
    respondent: { id: ASSESSMENT.primary_respondent_id, email: 'client@example.invalid' },
    filename: 'control-register.pdf',
    contentType: 'application/pdf',
    sizeBytes: 2048,
    evidenceLabel: 'Control register',
    fileBody: new Uint8Array(2048)
  }, {
    client: () => double,
    // Post-commit analytics is recorded, not performed: the suite must not construct a real client.
    trackEvent: async (event) => { calls.events.push(event); return { ok: true, status: 'created' }; }
  });
  return { result, calls };
}

console.log('joint-launch evidence storage compensation');

// 1. Happy path -------------------------------------------------------------------------------
{
  const { result, calls } = await runWith({});
  assert.equal(result.ok, true);
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.uploads[0].bucket, COMPREHENSIVE_EVIDENCE_BUCKET);
  assert.equal(calls.uploads[0].options.upsert, false, 'evidence objects are never overwritten');
  assert.equal(calls.removes.length, 0, 'a successful insert must never delete the object');
  assert.equal(calls.rpcs.length, 0, 'a successful insert must not raise an alert');
  assert.equal(result.evidence.privateStorage, true);
  check('upload succeeds + insert succeeds -> object retained, no delete, no alert');
}

// 2. Upload fails -----------------------------------------------------------------------------
{
  const { result, calls } = await runWith({ uploadError: { message: 'storage unavailable' } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'storage_upload_failed');
  assert.equal(calls.inserts.length, 0, 'a failed upload must not write an evidence row');
  assert.equal(calls.removes.length, 0, 'nothing was stored, so nothing may be deleted');
  assert.equal(calls.rpcs.length, 0);
  // The customer-facing message must not leak the provider's internal error.
  assert.doesNotMatch(result.message, /storage unavailable/);
  check('upload fails -> no database write, no delete, no alert');
}

// 3. Insert fails, cleanup succeeds ------------------------------------------------------------
{
  const { result, calls } = await runWith({ insertError: { message: 'evidence row rejected' } });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'write_failed');
  assert.equal(result.message, 'evidence row rejected', 'the caller sees the ORIGINAL database failure');
  assert.equal(calls.removes.length, 1, 'the uploaded object must be deleted');

  const removed = calls.removes[0];
  assert.equal(removed.bucket, COMPREHENSIVE_EVIDENCE_BUCKET);
  assert.equal(removed.paths.length, 1, 'exactly one object may be deleted, never a list or a prefix');
  assert.equal(removed.paths[0], calls.uploads[0].storagePath, 'the deleted path must be the path just uploaded');
  assert.equal(calls.rpcs.length, 0, 'successful cleanup leaves nothing to reconcile, so no alert');
  check('insert fails + cleanup succeeds -> exactly the uploaded object is deleted, no orphan, no alert');
}

// 4. Insert fails, cleanup fails ---------------------------------------------------------------
{
  const { result, calls } = await runWith({
    insertError: { message: 'evidence row rejected' },
    removeError: { message: 'storage delete refused' }
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'write_failed');
  assert.equal(result.message, 'evidence row rejected', 'the caller still sees the ORIGINAL database failure');
  assert.equal(calls.removes.length, 1);
  assert.equal(calls.rpcs.length, 1, 'a failed cleanup must raise exactly one reconciliation alert');

  const alert = calls.rpcs[0];
  assert.equal(alert.name, 'record_phase14_operational_alert');
  assert.equal(alert.params.p_category, 'comprehensive_evidence_orphan_object');
  assert.equal(alert.params.p_severity, 'warning');
  assert.ok(alert.params.p_alert_key.includes(calls.uploads[0].storagePath), 'the alert key identifies the exact object');

  const detail = alert.params.p_detail_json;
  assert.equal(detail.bucket, COMPREHENSIVE_EVIDENCE_BUCKET);
  assert.equal(detail.storage_path, calls.uploads[0].storagePath);
  assert.equal(detail.engagement_id, ENGAGEMENT.id);
  assert.equal(detail.order_id, ENGAGEMENT.order_id);
  assert.equal(detail.cleanup_error, 'storage delete refused');

  // Only safe identifiers may reach an alert payload.
  const serialised = JSON.stringify(alert.params);
  for (const unsafe of ['client@example.invalid', 'control-register.pdf', 'http://', 'https://', 'token']) {
    assert.equal(serialised.includes(unsafe), false, `${unsafe} must never appear in an orphan alert`);
  }
  assert.deepEqual(
    Object.keys(detail).sort(),
    ['bucket', 'cleanup_error', 'engagement_id', 'order_id', 'reason', 'storage_path']
  );
  check('insert fails + cleanup fails -> reconciliation alert with safe identifiers only, no URL, no PII');
}

// 5. The compensation never widens its blast radius --------------------------------------------
{
  const source = (await import('node:fs')).readFileSync('src/lib/comprehensive/evidence-service.ts', 'utf8');
  assert.match(source, /\.remove\(\[input\.storagePath\]\)/, 'the delete must name exactly one server-derived path');
  assert.doesNotMatch(source, /\.list\(/, 'compensation must never list the bucket');
  assert.doesNotMatch(source, /getPublicUrl|createSignedUrl/, 'no URL is ever produced');
  // Evidence rows are never deleted by the application; the compensating action is storage-only.
  assert.doesNotMatch(source, /from\('comprehensive_evidence_items'\)[\s\S]{0,120}\.delete\(/, 'no DELETE on evidence tables');
  check('compensation deletes one named storage object and never touches an evidence database row');
}

console.log(`\njoint-launch evidence compensation: ${checks} checks passed.`);
