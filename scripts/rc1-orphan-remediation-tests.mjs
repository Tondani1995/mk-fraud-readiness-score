/**
 * RC1 orphan-remediation contract.
 *
 * The synthetic-journey cleanup is scoped to rows reachable from a MKTEST-RC1- organisation, and
 * widening it would turn an audited certification tool into a general-purpose delete. Certification
 * nevertheless leaves provider rows that reference no business record and never can again -- a
 * callback for an email event that no longer exists, or for none at all -- so a final rollback
 * cannot honestly claim zero provider records while they remain.
 *
 * This suite pins that the remediation removes exactly that residue: the authority model, the
 * fingerprint-and-count contract that closes the time-of-check/time-of-use window, the refusal
 * paths, and the fact that no record id, provider id, recipient or payload ever leaves the
 * database.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { createRc1OrphanRemediationPost } = await import('../src/lib/rc1/control-plane.ts');

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260801160000_rc1_orphan_remediation.sql'), 'utf8');
const controlPlane = fs.readFileSync(path.join(root, 'src', 'lib', 'rc1', 'control-plane.ts'), 'utf8');
const routeFile = fs.readFileSync(
  path.join(root, 'src', 'app', 'score', 'api', 'admin', 'rc1-orphan-remediation', 'route.ts'), 'utf8');

const operator = { accessToken: 'orphan-remediation-access-token', role: 'platform_admin', aal: 'aal2' };
const FINGERPRINT = 'a'.repeat(64);
const REASON = 'Remove provider rows left by earlier RC1 certification windows that reference no surviving business record.';

function request(body) {
  return new Request('http://127.0.0.1/score/api/admin/rc1-orphan-remediation', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function dependencies({ identity = operator, response, error = null, frozen = false } = {}) {
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
        return { data: response, error };
      },
    },
  };
}

const preparedOk = {
  counts: { email_events: 1, email_provider_events: 7, phase14_provider_attestations: 7 },
  total: 15, fingerprint: FINGERPRINT, limit: 50, classification: 'removable_orphans',
};

let failures = 0;
let total = 0;
async function test(name, fn) {
  total += 1;
  try {
    await fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}`);
    console.log(`    ${String(error?.message ?? error).split('\n').slice(0, 6).join('\n    ')}`);
  }
}

console.log('RC1 -- orphan remediation');

// ---------------------------------------------------------------------------
// Candidate classification
// ---------------------------------------------------------------------------
await test('O1. the exact current orphan shapes are classifiable', () => {
  // email_events with no business link at all.
  assert.match(migration, /where e\.assessment_id is null\s*\n\s*and e\.order_id is null\s*\n\s*and e\.report_id is null\s*\n\s*and e\.data_request_id is null/);
  // provider events with no email_event, or belonging to an orphan one.
  assert.match(migration, /where pe\.email_event_id is null\s*\n\s*or not exists \(select 1 from public\.email_events e where e\.id = pe\.email_event_id\)\s*\n\s*or pe\.email_event_id in \(select id from orphan_email_events\)/);
  // attestations with no delivery authorisation AND no surviving email_event.
  assert.match(migration, /where \(a\.authorization_id is null[\s\S]*?and \(a\.email_event_id is null/);
});

await test('O2. a linked provider event is not a candidate', () => {
  // The email-event branch is an OR of "absent" conditions; a provider event whose email_event
  // survives and carries a business link satisfies none of them.
  const cte = migration.slice(migration.indexOf('orphan_provider_events as ('), migration.indexOf('orphan_attestations as ('));
  assert.doesNotMatch(cte, /1 = 1|true\)/, 'the provider-event predicate must not be unconditional');
  assert.match(cte, /not exists \(select 1 from public\.email_events/);
});

await test('O3. a linked attestation is not a candidate', () => {
  const cte = migration.slice(migration.indexOf('orphan_attestations as ('), migration.indexOf('orphan_consumptions as ('));
  assert.match(cte, /report_delivery_authorizations d where d\.id = a\.authorization_id/);
  assert.match(cte, /and \(a\.email_event_id is null/, 'both links must be absent, not either');
});

await test('O4. a business-linked email event is refused even if it reaches the candidate set', () => {
  // Defence in depth: both phases re-check every candidate for a surviving link and refuse.
  const occurrences = migration.match(/rc1_orphan_remediation:candidate_still_linked/g) ?? [];
  assert.equal(occurrences.length, 2, 'prepare and execute must both re-check linkage');
  assert.match(migration, /e\.assessment_id is not null or e\.order_id is not null/);
});

// ---------------------------------------------------------------------------
// The prepare/confirm contract
// ---------------------------------------------------------------------------
await test('O5. execution re-derives the candidates rather than trusting prepare', () => {
  const execute = migration.slice(migration.indexOf('create or replace function public.rc1_execute_orphan_remediation'));
  assert.match(execute, /-- Re-derive rather than trusting what prepare reported\./);
  assert.match(execute, /from public\.rc1_orphan_remediation_candidates\(\)/);
});

await test('O6. a substituted candidate set is refused by fingerprint', () => {
  assert.match(migration, /if v_fingerprint <> p_expected_fingerprint then\s*\n\s*raise exception 'rc1_orphan_remediation:candidate_fingerprint_mismatch'/);
  // The fingerprint covers relation and id, ordered, so substitution changes it.
  assert.match(migration, /string_agg\(relation \|\| ':' \|\| record_id::text, E'\\n' order by relation, record_id\)/);
});

await test('O7. a count mismatch is refused', () => {
  assert.match(migration, /if v_total <> p_expected_total then\s*\n\s*raise exception 'rc1_orphan_remediation:candidate_total_mismatch'/);
});

await test('O8. an excessive candidate count is refused in both phases', () => {
  const occurrences = migration.match(/rc1_orphan_remediation:candidate_limit_exceeded/g) ?? [];
  assert.equal(occurrences.length, 2);
  assert.match(migration, /c_candidate_limit constant integer := 50/);
});

// ---------------------------------------------------------------------------
// Authority
// ---------------------------------------------------------------------------
await test('O9. both phases require platform_admin at AAL2', () => {
  const occurrences = migration.match(/rc1_require_platform_admin\(true\)/g) ?? [];
  assert.equal(occurrences.length, 2);
  assert.doesNotMatch(migration, /rc1_require_platform_admin\(false\)/);
});

await test('O10. an AAL1 session is refused by the route', async () => {
  const deps = dependencies({ identity: { ...operator, aal: 'aal1' } });
  const response = await createRc1OrphanRemediationPost(deps.value)(request({ phase: 'prepare' }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'RC1_CONTROL_AAL2_REQUIRED');
  assert.equal(deps.calls.length, 0);
});

await test('O11. a non-platform-admin is refused', async () => {
  const deps = dependencies({ identity: { ...operator, role: 'finance_admin' } });
  const response = await createRc1OrphanRemediationPost(deps.value)(request({ phase: 'prepare' }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'RC1_CONTROL_PLATFORM_ADMIN_REQUIRED');
  assert.equal(deps.calls.length, 0);
});

await test('O12. an anonymous caller is refused', async () => {
  const deps = dependencies({ identity: null });
  const response = await createRc1OrphanRemediationPost(deps.value)(request({ phase: 'prepare' }));
  assert.equal(response.status, 401);
  assert.equal(deps.calls.length, 0);
});

await test('O13. service_role holds no execute privilege on either function', () => {
  for (const signature of [
    'public.rc1_prepare_orphan_remediation()',
    'public.rc1_execute_orphan_remediation(text,text,integer)',
    'public.rc1_orphan_remediation_candidates()',
  ]) {
    assert.ok(
      migration.includes(`revoke all on function ${signature}\n  from public, anon, authenticated, service_role`),
      `${signature} must be revoked from every role first`,
    );
  }
  assert.match(migration, /grant execute on function public\.rc1_prepare_orphan_remediation\(\) to authenticated;/);
  assert.match(migration, /grant execute on function public\.rc1_execute_orphan_remediation\(text,text,integer\) to authenticated;/);
  // The id-returning helper is granted to nobody.
  assert.doesNotMatch(migration, /grant execute on function public\.rc1_orphan_remediation_candidates/);
  assert.doesNotMatch(migration, /grant execute on function[^;]*to (?:anon|service_role|public)\b/i);
});

await test('O14. the control is disabled by default and absent from Production', () => {
  assert.match(migration, /rc1_orphan_remediation:not_enabled_in_this_environment/);
  assert.match(migration, /setting_key = 'rc1_orphan_remediation'/);
  assert.doesNotMatch(migration, /insert into public\.app_settings/i,
    'the migration must never enable itself in any environment');
});

await test('O15. execution is refused unless the database is RELEASED', () => {
  const occurrences = migration.match(/rc1_orphan_remediation:database_not_released/g) ?? [];
  assert.equal(occurrences.length, 2, 'both phases must require a released database');
  assert.match(migration, /if coalesce\(v_state, ''\) <> 'RELEASED' then/);
});

await test('O16. a frozen application refuses before reaching the database', async () => {
  const deps = dependencies({ frozen: true });
  const response = await createRc1OrphanRemediationPost(deps.value)(request({ phase: 'execute', reason: REASON, expectedFingerprint: FINGERPRINT, expectedTotal: 15 }));
  assert.equal(response.status, 423);
  assert.equal((await response.json()).error, 'RC1_OPERATION_FROZEN');
  assert.equal(deps.calls.length, 0);
});

// ---------------------------------------------------------------------------
// Route surface
// ---------------------------------------------------------------------------
await test('O17. prepare returns counts, total and fingerprint only', async () => {
  const deps = dependencies({ response: preparedOk });
  const response = await createRc1OrphanRemediationPost(deps.value)(request({ phase: 'prepare' }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['classification', 'counts', 'fingerprint', 'ok', 'phase', 'total']);
  assert.equal(body.total, 15);
  assert.deepEqual(deps.calls[0].args, {});
  assert.equal(deps.calls[0].name, 'rc1_prepare_orphan_remediation');
});

await test('O18. execute forwards only the reason and the two expected values', async () => {
  const deps = dependencies({ response: { already_clean: false, total: 15, deleted: { email_events: 1 } } });
  await createRc1OrphanRemediationPost(deps.value)(request({
    phase: 'execute', reason: REASON, expectedFingerprint: FINGERPRINT, expectedTotal: 15,
    // Hostile extras that must be ignored entirely.
    ids: ['00000000-0000-0000-0000-000000000000'], recipient: 'someone@example.test',
    providerMessageId: 'msg_123', predicate: '1=1',
  }));
  assert.deepEqual(deps.calls[0].args, {
    p_reason: REASON, p_expected_fingerprint: FINGERPRINT, p_expected_total: 15,
  });
  const factory = controlPlane.split('export function createRc1OrphanRemediationPost')[1].split('export function createRc1SyntheticCleanupPost')[0];
  for (const field of ['body.ids', 'body.recipient', 'body.providerMessageId', 'body.predicate', 'body.emailEventId']) {
    assert.equal(factory.includes(field), false, `route must not read ${field}`);
  }
});

await test('O19. a missing or malformed expected result is refused before the database', async () => {
  for (const body of [
    { phase: 'execute', reason: REASON, expectedTotal: 15 },
    { phase: 'execute', reason: REASON, expectedFingerprint: 'not-a-fingerprint', expectedTotal: 15 },
    { phase: 'execute', reason: REASON, expectedFingerprint: FINGERPRINT },
    { phase: 'execute', reason: REASON, expectedFingerprint: FINGERPRINT, expectedTotal: -1 },
    { phase: 'execute', reason: 'too short', expectedFingerprint: FINGERPRINT, expectedTotal: 15 },
    { phase: 'nonsense' },
  ]) {
    const deps = dependencies({ response: preparedOk });
    const response = await createRc1OrphanRemediationPost(deps.value)(request(body));
    assert.equal(response.status, 400, `not refused: ${JSON.stringify(body)}`);
    assert.equal(deps.calls.length, 0, 'a malformed request must never reach the database');
  }
});

await test('O20. an exact remediation succeeds and returns safe counts', async () => {
  const deps = dependencies({ response: {
    already_clean: false, total: 15,
    deleted: { email_events: 1, email_provider_events: 7, phase14_provider_attestations: 7,
      phase14_provider_attestation_consumptions: 0 },
  } });
  const response = await createRc1OrphanRemediationPost(deps.value)(request({
    phase: 'execute', reason: REASON, expectedFingerprint: FINGERPRINT, expectedTotal: 15 }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.already_clean, false);
  assert.equal(body.total, 15);
  assert.equal(body.deleted.email_events, 1);
  for (const value of Object.values(body.deleted)) assert.equal(Number.isSafeInteger(value), true);
});

await test('O21. a retry with zero candidates succeeds safely and is recorded', async () => {
  const deps = dependencies({ response: { already_clean: true, total: 0, deleted: {} } });
  const response = await createRc1OrphanRemediationPost(deps.value)(request({
    phase: 'execute', reason: REASON, expectedFingerprint: FINGERPRINT, expectedTotal: 0 }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.already_clean, true);
  assert.equal(body.total, 0);
  // The database records the no-op rather than raising.
  assert.match(migration, /if v_total = 0 then[\s\S]*?insert into public\.rc1_orphan_remediation_audit/);
  assert.match(migration, /'already_clean', true/);
});

await test('O22. refusals are classified from a closed vocabulary, never raw database text', async () => {
  const deps = dependencies({
    error: { message: 'ERROR: rc1_orphan_remediation:candidate_still_linked\nDETAIL: Key (recipient_email)=(nomsa@example.test) still referenced.' },
  });
  const response = await createRc1OrphanRemediationPost(deps.value)(request({
    phase: 'execute', reason: REASON, expectedFingerprint: FINGERPRINT, expectedTotal: 15 }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, 'RC1_REMEDIATION_REFUSED');
  assert.equal(body.reason, 'rc1_orphan_remediation:candidate_still_linked');
  const serialised = JSON.stringify(body);
  for (const leak of ['nomsa@example.test', 'DETAIL', 'recipient_email']) {
    assert.equal(serialised.includes(leak), false, `refusal leaked ${leak}`);
  }
});

// ---------------------------------------------------------------------------
// Disclosure
// ---------------------------------------------------------------------------
await test('O23. neither phase can return a record id, provider id or recipient', async () => {
  const deps = dependencies({ response: {
    counts: { email_events: 1, 'customer email': 'nomsa@example.test' },
    total: 1, fingerprint: FINGERPRINT, classification: 'removable_orphans',
    record_ids: ['11111111-1111-1111-1111-111111111111'],
    provider_message_id: 'msg_should_never_appear',
    recipients: ['nomsa@example.test'],
  } });
  const response = await createRc1OrphanRemediationPost(deps.value)(request({ phase: 'prepare' }));
  const serialised = JSON.stringify(await response.json());
  for (const leak of ['11111111-1111', 'msg_should_never_appear', 'nomsa@example.test', 'record_ids', 'recipients']) {
    assert.equal(serialised.includes(leak), false, `prepare leaked ${leak}`);
  }
  // The database side returns no ids either.
  const prepare = migration.slice(
    migration.indexOf('create or replace function public.rc1_prepare_orphan_remediation'),
    migration.indexOf('create or replace function public.rc1_execute_orphan_remediation'));
  assert.doesNotMatch(prepare, /'ids'|record_id\s*,|jsonb_agg\(record_id/);
  assert.match(prepare, /jsonb_build_object\(\s*\n\s*'counts', v_counts/);
});

await test('O24. the audit records counts and fingerprints only', () => {
  const table = migration.slice(migration.indexOf('create table if not exists public.rc1_orphan_remediation_audit'), migration.indexOf('alter table public.rc1_orphan_remediation_audit'));
  for (const column of ['reason_fingerprint', 'actor_fingerprint', 'candidate_fingerprint', 'candidate_total', 'deleted_counts']) {
    assert.ok(table.includes(column), `audit is missing ${column}`);
  }
  for (const forbidden of ['recipient', 'email', 'provider_message', 'payload', 'record_id']) {
    assert.equal(table.includes(forbidden), false, `audit must not store ${forbidden}`);
  }
  assert.match(table, /reason_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(table, /candidate_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /alter table public\.rc1_orphan_remediation_audit enable row level security/);
});

await test('O25. deletion is dependency-safe and confined to the candidate arrays', () => {
  const order = [
    'delete from public.phase14_provider_attestation_consumptions',
    'delete from public.phase14_provider_attestations',
    'delete from public.email_provider_events',
    'delete from public.email_events',
  ].map((statement) => ({ statement, index: migration.indexOf(statement) }));
  for (const entry of order) assert.ok(entry.index > 0, `${entry.statement} is missing`);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i - 1].index < order[i].index, `${order[i - 1].statement} must precede ${order[i].statement}`);
  }
  // Every delete is bounded by an id array derived inside the function.
  assert.match(migration, /c\.attestation_id = any\(v_attestation_ids\)/);
  assert.match(migration, /a\.id = any\(v_attestation_ids\)/);
  assert.match(migration, /pe\.id = any\(v_provider_ids\)/);
  assert.match(migration, /e\.id = any\(v_email_ids\)/);
  const executable = migration.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(executable, /delete from public\.(?:organisations|assessments|orders|reports|score_runs)\b/);
  assert.doesNotMatch(executable, /session_replication_role|disable trigger/i);
});

await test('O26. the route file stays a thin wrapper and the audit joins a freeze surface', () => {
  assert.match(routeFile, /createRc1OrphanRemediationPost/);
  assert.match(routeFile, /export const runtime = 'nodejs'/);
  assert.ok(routeFile.split('\n').filter((line) => line.trim()).length <= 8);
  assert.match(migration, /when 'public\.rc1_orphan_remediation_audit' then 'activation_control'/);
  // The real signature takes (p_schema, p_table). A one-argument variant would create a silent
  // overload and leave the function the guards actually call untouched.
  assert.match(migration, /create or replace function public\.rc1_surface_for_relation\(p_schema text, p_table text\)/);
  assert.doesNotMatch(migration, /rc1_surface_for_relation\(p_relation text\)/);
  assert.match(migration, /select case coalesce\(p_schema, ''\) \|\| '\.' \|\| coalesce\(p_table, ''\)/);
  // Every surface registered by earlier migrations must survive this replacement.
  for (const surface of [
    "when 'public.organisations' then 'assessment_start'",
    "when 'public.reports' then 'generation'",
    "when 'public.report_quality_diagnostics' then 'generation'",
    "when 'public.rc1_synthetic_cleanup_audit' then 'activation_control'",
    "when 'public.email_provider_events' then 'resend_webhook'",
    "when 'storage.objects' then 'storage_cleanup'",
  ]) {
    assert.ok(migration.includes(surface), `the surface map dropped: ${surface}`);
  }
});


// ---------------------------------------------------------------------------
// 20260801200000: the orphan-remediation allowance on the attestation guard.
// ---------------------------------------------------------------------------
const guardAllowance = fs.readFileSync(
  path.join(root, 'supabase', 'migrations',
    '20260801200000_rc1_orphan_remediation_guard_allowance.sql'), 'utf8');
const priorGuard = fs.readFileSync(
  path.join(root, 'supabase', 'migrations',
    '20260801090000_rc1_synthetic_cleanup_attestation_allowance.sql'), 'utf8');

// Just the guard's own body, so assertions about it cannot be satisfied by the surrounding prose.
function guardBody() {
  const from = guardAllowance.indexOf(
    'create or replace function public.guard_phase14_provider_attestation_immutable');
  const to = guardAllowance.indexOf('\n$$;', from);
  assert.ok(from > 0 && to > from);
  return guardAllowance.slice(from, to);
}

await test('O27. the guard keeps SECURITY INVOKER, an empty search path and no overload', () => {
  assert.match(guardAllowance,
    /create or replace function public\.guard_phase14_provider_attestation_immutable\(\)\nreturns trigger language plpgsql set search_path=''/);
  // The guard is SECURITY INVOKER. Adding `security definer` here would silently widen it.
  assert.doesNotMatch(guardBody(), /security definer/);
  // No new signature is introduced for either function.
  assert.equal(
    (guardAllowance.match(/create or replace function public\.rc1_execute_orphan_remediation\(/g) || []).length, 1);
  assert.match(guardAllowance,
    /create or replace function public\.rc1_execute_orphan_remediation\(\n  p_reason text,\n  p_expected_fingerprint text,\n  p_expected_total integer\n\)/);
  assert.doesNotMatch(guardAllowance, /drop function/i);
});

await test('O28. the accepted synthetic branch is reproduced unchanged', () => {
  // Everything from the synthetic marker read to the end of that branch must be byte-identical to
  // the accepted 20260801090000 body, so the linked-journey cleanup cannot have drifted.
  const slice = (text) => {
    const from = text.indexOf("v_cleanup_ref := pg_catalog.current_setting('rc1.synthetic_cleanup_ref', true);");
    const to = text.indexOf('if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then');
    assert.ok(from > 0 && to > from);
    return text.slice(from, to);
  };
  assert.equal(slice(guardAllowance), slice(priorGuard));
});

await test('O29. the allowance requires a real execution frame, not merely a custom setting', () => {
  // A marker alone proves nothing -- anyone can set a GUC. The stack frame cannot be fabricated.
  assert.match(guardAllowance, /get diagnostics v_stack = pg_context;/);
  assert.match(guardAllowance,
    /'PL\/pgSQL function public\.rc1_execute_orphan_remediation\(text,text,integer\) line '/);
  // Schema-qualified and fully-typed, so neither another schema nor an overload can match it.
  assert.ok(guardAllowance.includes('public.rc1_execute_orphan_remediation(text,text,integer) line '));
  // Transaction-local on both edges, so it cannot survive commit, rollback or an exception.
  assert.match(guardAllowance,
    /set_config\('rc1\.orphan_remediation_context', 'active', true\)/);
  assert.match(guardAllowance,
    /set_config\('rc1\.orphan_remediation_context', '', true\)/);
  assert.doesNotMatch(guardAllowance, /set_config\('rc1\.orphan_remediation_context', '[^']*', false\)/);
});

await test('O30. the row must prove orphanhood itself, and the proof must stay complete', () => {
  // Both links are required, combined with AND: a null email_event_id never makes a row eligible
  // while a delivery authorisation survives, and a missing email event never does either.
  assert.match(guardAllowance,
    /if \(old\.authorization_id is null\n\s+or not exists \(select 1\n\s+from public\.report_delivery_authorizations d\n\s+where d\.id = old\.authorization_id\)\)\n\s+and \(old\.email_event_id is null/);
  assert.match(guardAllowance, /and e\.assessment_id is null\n\s+and e\.order_id is null\n\s+and e\.report_id is null\n\s+and e\.data_request_id is null/);
  // The two-link proof is only complete while those are the only two links.
  assert.match(guardAllowance, /array\['authorization_id', 'email_event_id'\]::text\[\]/);
  assert.match(guardAllowance, /phase14_provider_attestation_immutable:orphan_proof_incomplete/);
  // The guard never calls the classifier, whose result necessarily changes as the deletion
  // proceeds; it proves orphanhood from OLD instead. A call would be schema-qualified, since the
  // guard runs with an empty search path -- the unqualified name appears only in a comment.
  assert.doesNotMatch(guardBody(), /public\.rc1_orphan_remediation_candidates/);
  assert.doesNotMatch(guardBody(), /(?:perform|from|select)\s+rc1_orphan_remediation_candidates/);
});

await test('O31. UPDATE and unaudited DELETE remain refused, and the default is still refusal', () => {
  // The allowance is inside `if tg_op = 'DELETE'`, and the unconditional raise is still the exit.
  assert.match(guardAllowance, /if tg_op = 'DELETE' then/);
  assert.match(guardAllowance, /\n  raise exception 'phase14_provider_attestation_immutable';\nend;\n\$\$;/);
  assert.doesNotMatch(guardAllowance, /tg_op = 'UPDATE'/);
});

await test('O32. every re-derivation and refusal in execute survives the change', () => {
  for (const clause of [
    "raise exception 'rc1_orphan_remediation:candidate_total_mismatch';",
    "raise exception 'rc1_orphan_remediation:candidate_fingerprint_mismatch';",
    "raise exception 'rc1_orphan_remediation:candidate_still_linked';",
    "raise exception 'rc1_orphan_remediation:candidate_limit_exceeded';",
    "raise exception 'rc1_orphan_remediation:not_enabled_in_this_environment';",
    "raise exception 'rc1_orphan_remediation:database_not_released';",
    "raise exception 'rc1_orphan_remediation:meaningful_reason_required';",
    "public.rc1_require_platform_admin(true)",
  ]) {
    assert.ok(guardAllowance.includes(clause), `execute lost: ${clause}`);
  }
  // The context is opened only after every check has passed, and never on the already-clean path.
  const openAt = guardAllowance.indexOf("set_config('rc1.orphan_remediation_context', 'active', true)");
  const alreadyCleanAt = guardAllowance.indexOf("'already_clean', true, 'total', 0");
  const linkedAt = guardAllowance.indexOf("raise exception 'rc1_orphan_remediation:candidate_still_linked';");
  assert.ok(openAt > alreadyCleanAt && openAt > linkedAt);
  // Nothing widens: no other relation is deleted, and no guard is disabled.
  assert.doesNotMatch(guardAllowance,
    /delete from public\.(?:organisations|assessments|orders|reports|score_runs|report_delivery_authorizations)\b/);
  assert.doesNotMatch(guardAllowance, /session_replication_role|disable trigger/i);
});

await test('O33. the execution-context marker cannot be influenced from the browser', async () => {
  // O18 already pins that only three arguments reach the RPC. This pins the fields specific to the
  // new allowance: nothing a browser sends may name the marker, its value, or a candidate id.
  const deps = dependencies({ response: { already_clean: false, total: 15, deleted: { email_events: 1 } } });
  await createRc1OrphanRemediationPost(deps.value)(request({
    phase: 'execute', reason: REASON, expectedFingerprint: FINGERPRINT, expectedTotal: 15,
    orphanRemediationContext: 'active',
    'rc1.orphan_remediation_context': 'active',
    context: 'active', marker: 'active', setting: 'rc1.orphan_remediation_context',
    recordIds: ['59000000-0000-0000-0000-000000000201'],
    relation: 'phase14_provider_attestations',
  }));
  assert.deepEqual(deps.calls[0].args, {
    p_reason: REASON, p_expected_fingerprint: FINGERPRINT, p_expected_total: 15,
  });
  const forwarded = JSON.stringify(deps.calls[0].args);
  for (const leaked of ['orphan_remediation_context', 'active', 'recordIds', '59000000', 'relation']) {
    assert.ok(!forwarded.includes(leaked), `the route forwarded a hostile field: ${leaked}`);
  }
  // And the route never reads any of them.
  const factory = controlPlane.split('export function createRc1OrphanRemediationPost')[1]
    .split('export function createRc1SyntheticCleanupPost')[0];
  for (const field of ['body.context', 'body.marker', 'body.setting', 'body.recordIds', 'body.relation',
                       'orphan_remediation_context', 'set_config']) {
    assert.equal(factory.includes(field), false, `route must not read or set ${field}`);
  }
});

console.log('');
console.log(`rc1-orphan-remediation: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
