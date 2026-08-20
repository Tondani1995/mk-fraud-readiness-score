/**
 * RC1 synthetic-certification marking contract.
 *
 * Every RC1 cleanup control is scoped by organisations.synthetic_certification_ref, and until this
 * control existed nothing could write it -- so a certification journey could be run and then never
 * cleaned up. The marker is also what makes an organisation deletable, which is why this control is
 * deliberately harder to satisfy than the cleanup it enables.
 *
 * This suite pins the authority model, the refusal paths that keep a real customer organisation out
 * of reach, the fact that the organisation is resolved from the journey's own reference rather than
 * from anything the browser names, and that no identity, address or row id enters the audit.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { createRc1SyntheticMarkingPost } = await import('../src/lib/rc1/control-plane.ts');

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260801220000_rc1_synthetic_certification_marking.sql'),
  'utf8');
const priorSurface = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260801160000_rc1_orphan_remediation.sql'), 'utf8');
const controlPlane = fs.readFileSync(path.join(root, 'src', 'lib', 'rc1', 'control-plane.ts'), 'utf8');
const routeFile = fs.readFileSync(
  path.join(root, 'src', 'app', 'score', 'api', 'admin', 'rc1-synthetic-marking', 'route.ts'), 'utf8');

let total = 0;
let failures = 0;
async function test(name, fn) {
  total += 1;
  try {
    await fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}`);
    console.log(`    ${error && error.message ? error.message : error}`);
  }
}

const REASON = 'Marking the RC1 certification organisation synthetic for the final journey.';
const ASSESSMENT_REF = 'MKFRS-2026-ABCDEF0123';
const SYNTHETIC_REF = 'MKTEST-RC1-20260801-01';

const OPERATOR = { id: 'admin-1', role: 'platform_admin', aal: 'aal2' };

function dependencies({ identity = OPERATOR, response, error = null, frozen = false } = {}) {
  const calls = [];
  return {
    calls,
    value: {
      freezeResponse: async () => (frozen
        ? { status: 423, json: async () => ({ ok: false, error: 'RC1_OPERATION_FROZEN' }) }
        : null),
      resolveOperator: async () => identity,
      rpc: async (token, name, args = {}) => {
        calls.push({ token, name, args });
        return {
          data: error ? null : (response ?? {
            synthetic_reference: SYNTHETIC_REF, marked: 1, freeze_epoch: 10,
          }),
          error,
        };
      },
    },
  };
}

function request(body) {
  return new Request('https://example.invalid/score/api/admin/rc1-synthetic-marking', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

console.log('rc1-synthetic-marking');

// ---------------------------------------------------------------------------
// Authority and environment
// ---------------------------------------------------------------------------
await test('M1. the control requires platform_admin at AAL2', () => {
  assert.match(migration, /v_actor := public\.rc1_require_platform_admin\(true\);/);
  assert.doesNotMatch(migration, /rc1_require_platform_admin\(false\)/);
});

await test('M2. it shares the synthetic-cleanup enablement rather than adding a third key', () => {
  assert.match(migration, /s\.setting_key = 'rc1_synthetic_certification_cleanup'/);
  assert.match(migration, /raise exception 'rc1_synthetic_marking:not_enabled_in_this_environment'/);
  // No enablement row is inserted, so the control is inert on arrival everywhere.
  assert.doesNotMatch(migration, /insert into public\.app_settings/);
});

await test('M3. it refuses unless the database is RELEASED', () => {
  assert.match(migration, /if coalesce\(v_state, ''\) <> 'RELEASED' then\s*\n\s*raise exception 'rc1_synthetic_marking:database_not_released'/);
});

await test('M4. the write sits on a freeze surface, so a frozen database refuses it', () => {
  // organisations is registered on assessment_start by the surface map reproduced below.
  assert.match(migration, /when 'public\.organisations' then 'assessment_start'/);
  assert.match(migration, /update public\.organisations o\n\s*set synthetic_certification_ref = p_synthetic_reference/);
});

// ---------------------------------------------------------------------------
// What keeps a real customer organisation out of reach
// ---------------------------------------------------------------------------
await test('M5. an existing marker is never overwritten, cleared or relabelled', () => {
  // Both the read and the update require the column to be null.
  assert.match(migration, /where o\.id = v_organisation_id and o\.synthetic_certification_ref is null;/);
  assert.match(migration, /where o\.id = v_organisation_id and o\.synthetic_certification_ref is null;/);
  assert.equal(
    (migration.match(/synthetic_certification_ref is null/g) || []).length, 2,
    'the null requirement must be restated on the update to close the read/write window');
  assert.match(migration, /raise exception 'rc1_synthetic_marking:organisation_already_marked_or_missing'/);
  // It can only ever set a MKTEST-RC1 value, never null it out.
  assert.doesNotMatch(migration, /set synthetic_certification_ref = null/);
});

await test('M6. an organisation older than an hour is unreachable', () => {
  assert.match(migration, /if v_created_at < pg_catalog\.now\(\) - interval '1 hour' then\s*\n\s*raise exception 'rc1_synthetic_marking:organisation_not_recent'/);
});

await test('M7. the organisation must own exactly the one named assessment', () => {
  assert.match(migration, /if v_assessment_count <> 1 then\s*\n\s*raise exception 'rc1_synthetic_marking:organisation_has_other_assessments'/);
});

await test('M8. any organisation that has been used at all is refused', () => {
  for (const relation of [
    'public.score_runs', 'public.orders', 'public.reports',
    'public.report_delivery_authorizations', 'public.email_events',
    'public.data_requests', 'public.customer_report_access_tokens',
  ]) {
    assert.ok(migration.includes(`from ${relation} `), `the in-use check does not cover ${relation}`);
  }
  assert.match(migration, /if v_blocking > 0 then\s*\n\s*raise exception 'rc1_synthetic_marking:organisation_already_in_use'/);
});

await test('M9. the marking must apply to exactly one row or the whole call aborts', () => {
  assert.match(migration, /get diagnostics v_marked = row_count;\s*\n\s*if v_marked <> 1 then\s*\n\s*raise exception 'rc1_synthetic_marking:marking_did_not_apply_exactly_once'/);
  // One transaction: the audit insert and the update stand or fall together.
  assert.doesNotMatch(migration, /commit;[\s\S]*update public\.organisations/);
});

await test('M10. the reference shape is enforced before anything is resolved', () => {
  assert.match(migration, /p_synthetic_reference !~ '\^MKTEST-RC1-\[0-9\]\{8\}-\[0-9\]\{2\}\$'/);
  const body = migration.slice(migration.indexOf('v_actor := public.rc1_require_platform_admin'));
  assert.ok(
    body.indexOf('synthetic_reference_invalid') < body.indexOf('select a.organisation_id'),
    'the reference must be validated before the organisation is resolved');
});

// ---------------------------------------------------------------------------
// Nothing browser-supplied reaches a predicate
// ---------------------------------------------------------------------------
await test('M11. the organisation is resolved from the journey reference, never from an id', () => {
  assert.match(migration, /select a\.organisation_id into v_organisation_id\s*\n\s*from public\.assessments a\s*\n\s*where a\.assessment_reference = v_assessment_ref;/);
  assert.doesNotMatch(migration, /p_organisation_id|p_record_id|p_email|p_predicate/);
  // Three text arguments and nothing else.
  assert.match(migration, /create or replace function public\.rc1_mark_synthetic_certification_organisation\(\n  p_assessment_reference text,\n  p_synthetic_reference text,\n  p_reason text\n\)/);
});

await test('M12. the route pins both reference shapes and forwards only three values', async () => {
  const deps = dependencies();
  const response = await createRc1SyntheticMarkingPost(deps.value)(request({
    assessmentReference: ASSESSMENT_REF,
    syntheticReference: SYNTHETIC_REF,
    reason: REASON,
    // Hostile extras that must be ignored entirely.
    organisationId: '00000000-0000-0000-0000-000000000000',
    email: 'someone@example.test',
    predicate: '1=1',
    settingKey: 'rc1_synthetic_certification_cleanup',
  }));
  assert.equal(response.status, 200);
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.calls[0].name, 'rc1_mark_synthetic_certification_organisation');
  assert.deepEqual(deps.calls[0].args, {
    p_assessment_reference: ASSESSMENT_REF,
    p_synthetic_reference: SYNTHETIC_REF,
    p_reason: REASON,
  });
  const factory = controlPlane.split('export function createRc1SyntheticMarkingPost')[1]
    .split('export function createRc1OrphanRemediationPost')[0];
  for (const field of ['body.organisationId', 'body.email', 'body.predicate', 'body.settingKey', 'body.ids']) {
    assert.equal(factory.includes(field), false, `route must not read ${field}`);
  }
});

await test('M13. a malformed assessment or synthetic reference is refused before any RPC', async () => {
  for (const [body, expected] of [
    [{ assessmentReference: '', syntheticReference: SYNTHETIC_REF, reason: REASON },
      'RC1_MARKING_ASSESSMENT_REFERENCE_REQUIRED'],
    [{ assessmentReference: "x'; drop table public.orders; --", syntheticReference: SYNTHETIC_REF, reason: REASON },
      'RC1_MARKING_ASSESSMENT_REFERENCE_REQUIRED'],
    [{ assessmentReference: '00000000-0000-0000-0000-000000000000 or 1=1', syntheticReference: SYNTHETIC_REF, reason: REASON },
      'RC1_MARKING_ASSESSMENT_REFERENCE_REQUIRED'],
    [{ assessmentReference: ASSESSMENT_REF, syntheticReference: 'MKTEST-RC1-2026-01', reason: REASON },
      'RC1_MARKING_SYNTHETIC_REFERENCE_REQUIRED'],
    [{ assessmentReference: ASSESSMENT_REF, syntheticReference: 'PROD-RC1-20260801-01', reason: REASON },
      'RC1_MARKING_SYNTHETIC_REFERENCE_REQUIRED'],
    [{ assessmentReference: ASSESSMENT_REF, syntheticReference: SYNTHETIC_REF, reason: 'short' },
      'RC1_CONTROL_REASON_REQUIRED'],
  ]) {
    const deps = dependencies();
    const response = await createRc1SyntheticMarkingPost(deps.value)(request(body));
    const parsed = await response.json();
    assert.equal(response.status, 400, `${expected}: ${JSON.stringify(parsed)}`);
    assert.equal(parsed.error, expected);
    assert.equal(deps.calls.length, 0, 'no RPC may be reached on a malformed request');
  }
});

await test('M14. the route refuses while the application is frozen, before authority', async () => {
  const deps = dependencies({ frozen: true });
  const response = await createRc1SyntheticMarkingPost(deps.value)(request({
    assessmentReference: ASSESSMENT_REF, syntheticReference: SYNTHETIC_REF, reason: REASON,
  }));
  assert.equal(response.status, 423);
  assert.equal(deps.calls.length, 0);
});

await test('M15. an AAL1 or non-admin operator is refused', async () => {
  for (const identity of [
    { id: 'a', role: 'platform_admin', aal: 'aal1' },
    { id: 'b', role: 'analyst', aal: 'aal2' },
    null,
  ]) {
    const deps = dependencies({ identity });
    const response = await createRc1SyntheticMarkingPost(deps.value)(request({
      assessmentReference: ASSESSMENT_REF, syntheticReference: SYNTHETIC_REF, reason: REASON,
    }));
    assert.ok(response.status === 401 || response.status === 403,
      `expected an authority refusal, got ${response.status}`);
    assert.equal(deps.calls.length, 0);
  }
});

// ---------------------------------------------------------------------------
// Refusals and audit
// ---------------------------------------------------------------------------
await test('M16. refusals are classified from a closed vocabulary, never raw database text', async () => {
  const deps = dependencies({
    error: { message: 'ERROR: rc1_synthetic_marking:organisation_already_in_use CONTEXT: org "Acme Bank" id 9f3c...' },
  });
  const response = await createRc1SyntheticMarkingPost(deps.value)(request({
    assessmentReference: ASSESSMENT_REF, syntheticReference: SYNTHETIC_REF, reason: REASON,
  }));
  const parsed = await response.json();
  assert.equal(response.status, 409);
  assert.equal(parsed.reason, 'rc1_synthetic_marking:organisation_already_in_use');
  assert.ok(!JSON.stringify(parsed).includes('Acme Bank'));
  assert.ok(!JSON.stringify(parsed).includes('9f3c'));

  const unknown = dependencies({ error: { message: 'duplicate key value violates unique constraint "x" for org Acme' } });
  const unknownResponse = await createRc1SyntheticMarkingPost(unknown.value)(request({
    assessmentReference: ASSESSMENT_REF, syntheticReference: SYNTHETIC_REF, reason: REASON,
  }));
  const unknownParsed = await unknownResponse.json();
  assert.equal(unknownParsed.reason, 'unclassified');
  assert.ok(!JSON.stringify(unknownParsed).includes('Acme'));
});

await test('M17. an unexpected RPC shape is a 502, never reported as success', async () => {
  for (const response of [
    { synthetic_reference: 'MKTEST-RC1-20260801-99', marked: 1 },
    { synthetic_reference: SYNTHETIC_REF, marked: 2 },
    { synthetic_reference: SYNTHETIC_REF, marked: 0 },
  ]) {
    const deps = dependencies({ response });
    const result = await createRc1SyntheticMarkingPost(deps.value)(request({
      assessmentReference: ASSESSMENT_REF, syntheticReference: SYNTHETIC_REF, reason: REASON,
    }));
    assert.equal(result.status, 502, JSON.stringify(response));
  }
});

await test('M18. the audit records the reference, fingerprints and a count only', () => {
  assert.match(migration, /create table if not exists public\.rc1_synthetic_marking_audit/);
  assert.match(migration, /rc1_synthetic_marking_audit_reference_check[\s\S]{0,120}\^MKTEST-RC1-/);
  assert.match(migration, /reason_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /actor_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /check \(marked_count = 1\)/);
  // No identity, address, name or id column exists to leak into.
  const table = migration.slice(
    migration.indexOf('create table if not exists public.rc1_synthetic_marking_audit'),
    migration.indexOf('comment on table public.rc1_synthetic_marking_audit'));
  for (const forbidden of ['legal_name', 'organisation_id', 'assessment_id', 'email', 'respondent', 'reason text']) {
    assert.ok(!table.includes(forbidden), `the audit table exposes ${forbidden}`);
  }
  assert.match(migration, /alter table public\.rc1_synthetic_marking_audit enable row level security/);
  assert.match(migration, /revoke all on table public\.rc1_synthetic_marking_audit from public, anon, authenticated/);
});

await test('M19. the reason text is fingerprinted, never stored', () => {
  assert.match(migration, /v_reason_fingerprint := pg_catalog\.encode\(\s*\n\s*extensions\.digest\(pg_catalog\.convert_to\(v_reason, 'UTF8'\), 'sha256'\), 'hex'\);/);
  assert.ok(!/insert into public\.rc1_synthetic_marking_audit[\s\S]{0,400}v_reason\b(?!_fingerprint)/.test(migration));
});

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------
await test('M20. the function is SECURITY DEFINER with an empty search path and narrow grants', () => {
  assert.match(migration, /create or replace function public\.rc1_mark_synthetic_certification_organisation\([\s\S]{0,200}?returns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''/);
  assert.match(migration, /revoke all on function public\.rc1_mark_synthetic_certification_organisation\(text,text,text\)\s*\n\s*from public, anon, authenticated, service_role;/);
  assert.match(migration, /grant execute on function public\.rc1_mark_synthetic_certification_organisation\(text,text,text\) to authenticated;/);
  // service_role is never granted execute.
  assert.doesNotMatch(migration, /grant execute on function public\.rc1_mark_synthetic_certification_organisation\(text,text,text\) to service_role/);
});

await test('M21. the surface map keeps its real signature and loses nothing', () => {
  // The real signature takes (p_schema, p_table). A one-argument variant would create a silent
  // overload and leave the function the guards actually call untouched.
  assert.match(migration, /create or replace function public\.rc1_surface_for_relation\(p_schema text, p_table text\)/);
  assert.doesNotMatch(migration, /rc1_surface_for_relation\(p_relation text\)/);
  assert.match(migration, /when 'public\.rc1_synthetic_marking_audit' then 'activation_control'/);
  // Reproduced verbatim from the accepted definition apart from the one added line.
  const slice = (text) => {
    const from = text.indexOf("select case coalesce(p_schema, '')");
    const to = text.indexOf('else null');
    assert.ok(from > 0 && to > from);
    return text.slice(from, to)
      .split('\n')
      .filter((line) => !line.includes('rc1_synthetic_marking_audit') && !line.includes('synthetic-marking audit'))
      .join('\n');
  };
  assert.equal(slice(migration), slice(priorSurface));
  assert.match(migration, /security definer/);
  const surface = migration.slice(migration.indexOf('create or replace function public.rc1_surface_for_relation'));
  assert.match(surface, /language sql\nimmutable\nsecurity definer\nset search_path = ''/);
});

await test('M22. the route file stays a thin wrapper', () => {
  assert.match(routeFile, /createRc1SyntheticMarkingPost/);
  assert.match(routeFile, /export const runtime = 'nodejs'/);
  assert.ok(routeFile.split('\n').filter((line) => line.trim()).length <= 8);
});

await test('M23. nothing in the migration widens a cleanup or bypasses a guard', () => {
  assert.doesNotMatch(migration, /session_replication_role|disable trigger|alter table [\s\S]{0,60}disable/i);
  assert.doesNotMatch(migration, /delete from/i);
  assert.doesNotMatch(migration, /drop function|drop table/i);
  assert.doesNotMatch(migration, /to service_role/);
});


// ---------------------------------------------------------------------------
// 20260802120000: the placeholder allowance and the bounded age.
// ---------------------------------------------------------------------------
const allowance = fs.readFileSync(
  path.join(root, 'supabase', 'migrations',
    '20260802120000_rc1_synthetic_marking_placeholder_allowance.sql'), 'utf8');

await test('M24. a queued email event is not treated as harmless on its own', () => {
  // All eleven row conditions must hold before an event is disregarded.
  for (const condition of [
    "e.assessment_id = v_assessment_id",
    "e.order_id is null",
    "e.report_id is null",
    "e.data_request_id is null",
    "e.template_key = 'resume_link_phase4_placeholder'",
    "e.notification_type is null",
    "e.provider_mode = 'disabled'",
    "e.status = 'queued'",
    "e.provider_message_id is null",
    "e.sent_at is null",
    "from public.email_provider_events pe where pe.email_event_id = e.id",
    "from public.phase14_provider_attestations pa where pa.email_event_id = e.id",
    "from public.phase14_provider_attestation_consumptions c",
    "from public.report_delivery_authorizations d where d.email_event_id = e.id",
  ]) {
    assert.ok(allowance.includes(condition), `the placeholder predicate lost: ${condition}`);
  }
});

await test('M25. the set conditions close the gap a row predicate cannot', () => {
  // At most one placeholder, and no email event that is not that placeholder.
  assert.match(allowance, /if v_placeholder > 1 then\s*\n\s*raise exception 'rc1_synthetic_marking:multiple_placeholder_events'/);
  assert.match(allowance, /if v_email_total <> v_placeholder then\s*\n\s*raise exception 'rc1_synthetic_marking:organisation_already_in_use'/);
  // The total counts every link an email event can have to the organisation, not just assessments.
  for (const link of ['e.assessment_id in', 'e.order_id in', 'e.report_id in', 'e.data_request_id in']) {
    assert.ok(allowance.includes(link), `the email total ignores ${link}`);
  }
});

await test('M26. the freshness bound is 24 hours and still refuses older organisations', () => {
  assert.match(allowance, /if v_created_at < pg_catalog\.now\(\) - interval '24 hours' then\s*\n\s*raise exception 'rc1_synthetic_marking:organisation_not_recent'/);
  assert.doesNotMatch(allowance, /interval '1 hour'/);
});

await test('M27. answers now count as real use, and every earlier protection survives', () => {
  assert.ok(allowance.includes('from public.assessment_answers an'));
  assert.ok(allowance.includes('from public.exposure_answers ex'));
  for (const clause of [
    "public.rc1_require_platform_admin(true)",
    "raise exception 'rc1_synthetic_marking:meaningful_reason_required'",
    "raise exception 'rc1_synthetic_marking:synthetic_reference_invalid'",
    "raise exception 'rc1_synthetic_marking:not_enabled_in_this_environment'",
    "raise exception 'rc1_synthetic_marking:database_not_released'",
    "raise exception 'rc1_synthetic_marking:assessment_not_found'",
    "raise exception 'rc1_synthetic_marking:organisation_already_marked_or_missing'",
    "raise exception 'rc1_synthetic_marking:organisation_has_other_assessments'",
    "raise exception 'rc1_synthetic_marking:marking_did_not_apply_exactly_once'",
    "where a.assessment_reference = v_assessment_ref",
    "and o.synthetic_certification_ref is null",
    "p_synthetic_reference !~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$'",
  ]) {
    assert.ok(allowance.includes(clause), `migration 61 dropped: ${clause}`);
  }
  assert.doesNotMatch(allowance, /set synthetic_certification_ref = null/);
  assert.doesNotMatch(allowance, /to service_role/);
  assert.doesNotMatch(allowance, /session_replication_role|disable trigger/i);
});

await test('M28. no new signature, and the grants are restated unchanged', () => {
  assert.equal(
    (allowance.match(/create or replace function public\.rc1_mark_synthetic_certification_organisation\(/g) || []).length, 1);
  assert.match(allowance, /create or replace function public\.rc1_mark_synthetic_certification_organisation\(\n  p_assessment_reference text,\n  p_synthetic_reference text,\n  p_reason text\n\)/);
  assert.match(allowance, /returns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''/);
  assert.match(allowance, /revoke all on function public\.rc1_mark_synthetic_certification_organisation\(text,text,text\)\s*\n\s*from public, anon, authenticated, service_role;/);
  assert.match(allowance, /grant execute on function public\.rc1_mark_synthetic_certification_organisation\(text,text,text\) to authenticated;/);
  assert.doesNotMatch(allowance, /drop function|create table/i);
});

console.log('');
console.log(`rc1-synthetic-marking: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
