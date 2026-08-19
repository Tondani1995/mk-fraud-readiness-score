from pathlib import Path

# A. Remove the orphaned manual_report_deliveries dependency. The approved manual-only
# launch already has an idempotent delivery-attempt table and claim/completion RPCs.
page_path = Path('src/app/score/admin/orders/[orderReference]/page.tsx')
page = page_path.read_text()
old = """  // Manual delivery record: MK emailed the report and recorded it. Separate from the
  // provider delivery authorisations shown in the Release C panel.
  const { data: manualDelivery } = latestReport
    ? await db.from('manual_report_deliveries')
        .select('delivered_at,recipient_email,delivered_by')
        .eq('report_id', latestReport.id).maybeSingle()
    : { data: null };
  // Resolved separately rather than as an embedded join: the delivery row is the
  // authoritative record, and a failure to resolve the actor's display name must not
  // make a recorded delivery look as though it never happened.
  const { data: manualDeliveryActor } = manualDelivery?.delivered_by
    ? await db.from('admin_profiles').select('full_name,email').eq('id', manualDelivery.delivered_by).maybeSingle()
    : { data: null };
"""
new = """  // Manual operator delivery is persisted in the existing Phase 1 delivery-attempt
  // table. provider_mode=disabled distinguishes an operator-sent customer email from the
  // historical provider-double test path; DELIVERED is written only by the existing
  // complete_manual_report_delivery RPC.
  const { data: manualDelivery } = latestReport
    ? await db.from('manual_report_delivery_attempts')
        .select('completed_at,recipient_email,requested_by')
        .eq('report_id', latestReport.id)
        .eq('status', 'DELIVERED')
        .eq('provider_mode', 'disabled')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const { data: manualDeliveryActor } = manualDelivery?.requested_by
    ? await db.from('admin_profiles').select('full_name,email').eq('id', manualDelivery.requested_by).maybeSingle()
    : { data: null };
"""
if page.count(old) != 1:
    raise SystemExit('manual-delivery page anchor drifted')
page = page.replace(old, new, 1)
if page.count('deliveredAt={manualDelivery?.delivered_at ?? null}') != 1:
    raise SystemExit('manual-delivery timestamp anchor drifted')
page = page.replace('deliveredAt={manualDelivery?.delivered_at ?? null}', 'deliveredAt={manualDelivery?.completed_at ?? null}', 1)
page_path.write_text(page)

# B. Bind the manual operator action to existing idempotent Phase 1 delivery RPCs.
route_path = Path('src/app/score/api/admin/orders/[orderReference]/mark-delivered/route.ts')
route_path.write_text("""import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

function reasonFrom(message: string) {
  return message.match(/phase1_[a-z_]+/)?.[0] ?? 'delivery_record_failed';
}

function responseFor(reason: string): [string, number] {
  return ({
    phase1_order_not_found: ['Order not found.', 404],
    phase1_delivery_permission_denied: ['You are not authorised to record delivery.', 403],
    phase1_report_record_missing: ['A generated report could not be found for this order.', 409],
    phase1_report_order_mismatch: ['The report does not belong to this order.', 409],
    phase1_report_not_ready: ['Delivery can only be recorded once a verified report exists.', 409],
    phase1_delivery_recipient_missing: ['This order has no delivery recipient on file.', 409],
    phase1_delivery_attempt_not_active: ['The delivery record changed before it could be completed. Retry once.', 409]
  } as Record<string, [string, number]>)[reason] ?? ['The delivery could not be recorded.', 409];
}

/** Records an operator-sent manual customer email. This endpoint never sends email. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ orderReference: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, reason: 'unauthorised' }, { status: 401 });
  if (!['platform_admin', 'approver'].includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden', message: 'You are not authorised to record delivery.' }, { status: 403 });
  }

  const { orderReference } = await context.params;
  const db = createSupabaseServiceClient() as any;
  const { data: order, error: orderError } = await db.from('orders')
    .select('id,status')
    .eq('order_reference', orderReference)
    .maybeSingle();
  if (orderError || !order) {
    return NextResponse.json({ ok: false, reason: 'phase1_order_not_found', message: 'Order not found.' }, { status: 404 });
  }
  if (order.status !== 'payment_received') {
    return NextResponse.json({ ok: false, reason: 'manual_delivery_order_not_paid', message: 'Delivery can only be recorded once payment is confirmed.' }, { status: 409 });
  }

  const { data: report, error: reportError } = await db.from('reports')
    .select('id,storage_status,storage_bucket,storage_path,checksum,version_number')
    .eq('order_id', order.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reportError || !report || report.storage_status !== 'VERIFIED' || !report.storage_bucket || !report.storage_path || !report.checksum) {
    return NextResponse.json({ ok: false, reason: 'manual_delivery_report_not_ready', message: 'Delivery can only be recorded once a verified report exists.' }, { status: 409 });
  }

  const technicalReference = crypto.randomUUID();
  const requestKey = `operator-manual-delivery:${report.id}`;
  const { data: claim, error: claimError } = await db.rpc('claim_manual_report_delivery', {
    p_report_id: report.id,
    p_order_reference: orderReference,
    p_requested_by: admin.id,
    p_request_key: requestKey,
    p_provider_mode: 'disabled',
    p_technical_reference: technicalReference
  });
  if (claimError || !claim?.attempt) {
    const reason = reasonFrom(String(claimError?.message ?? ''));
    const [message, status] = responseFor(reason);
    return NextResponse.json({ ok: false, reason, message, technicalReference }, { status });
  }

  if (claim.reason === 'already_delivered' || (claim.reason === 'idempotent_replay' && claim.attempt.status === 'DELIVERED')) {
    return NextResponse.json({
      ok: true,
      alreadyDelivered: true,
      deliveredAt: claim.attempt.completed_at ?? null,
      recipient: claim.attempt.recipient_email ?? null,
      message: 'This report was already recorded as delivered.'
    });
  }

  const { data: completed, error: completeError } = await db.rpc('complete_manual_report_delivery', {
    p_attempt_id: String(claim.attempt.id),
    p_status: 'DELIVERED',
    p_error_category: null,
    p_safe_message: null
  });
  if (completeError || !completed?.attempt) {
    const reason = reasonFrom(String(completeError?.message ?? ''));
    const [message, status] = responseFor(reason);
    return NextResponse.json({ ok: false, reason, message, technicalReference }, { status });
  }

  return NextResponse.json({
    ok: true,
    alreadyDelivered: false,
    deliveredAt: completed.attempt.completed_at ?? null,
    recipient: completed.attempt.recipient_email ?? null,
    message: 'Delivery recorded.'
  });
}
""")

# C. Keep the direct Phase 6 harness aligned with the central maturity-band module.
phase6_path = Path('scripts/phase6-engine-direct-tests.mjs')
phase6 = phase6_path.read_text()
old_engine_sources = "const engineSource = fs.readFileSync(enginePath, 'utf8');\n"
new_engine_sources = "const engineSource = fs.readFileSync(enginePath, 'utf8');\nconst maturityBandPath = path.join(root, 'src/lib/scoring/maturity-band.ts');\nconst maturityBandSource = fs.readFileSync(maturityBandPath, 'utf8');\n"
if phase6.count(old_engine_sources) != 1:
    raise SystemExit('phase6 engine source anchor drifted')
phase6 = phase6.replace(old_engine_sources, new_engine_sources, 1)
old_sandbox = """  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (id) => {
      throw new Error(`Unexpected runtime import from scoring-engine.ts: ${id}`);
    },
    console
  };
"""
new_sandbox = """  const maturityTranspiled = ts.transpileModule(maturityBandSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: maturityBandPath
  }).outputText;
  const maturityModule = { exports: {} };
  vm.runInNewContext(maturityTranspiled, {
    module: maturityModule,
    exports: maturityModule.exports,
    require: (id) => { throw new Error(`Unexpected runtime import from maturity-band.ts: ${id}`); },
    console
  }, { filename: 'maturity-band.transpiled.cjs' });

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: (id) => {
      if (id === './maturity-band') return maturityModule.exports;
      throw new Error(`Unexpected runtime import from scoring-engine.ts: ${id}`);
    },
    console
  };
"""
if phase6.count(old_sandbox) != 1:
    raise SystemExit('phase6 sandbox anchor drifted')
phase6_path.write_text(phase6.replace(old_sandbox, new_sandbox, 1))

# D. Keep the Node 24 Chromium smoke loading the real design-token module.
smoke_path = Path('scripts/phase14-node24-chromium-smoke.mjs')
smoke = smoke_path.read_text()
old_source = "const source = readFileSync(sourcePath, 'utf8');\n"
new_source = "const source = readFileSync(sourcePath, 'utf8');\nconst tokenSourcePath = join(process.cwd(), 'src/lib/reports/design/tokens.ts');\nconst tokenSource = readFileSync(tokenSourcePath, 'utf8');\n"
if smoke.count(old_source) != 1:
    raise SystemExit('phase14 smoke source anchor drifted')
smoke = smoke.replace(old_source, new_source, 1)
old_exec = """const module = { exports: {} };
new Function('require', 'module', 'exports', '__filename', '__dirname', output)(
  require,
  module,
  module.exports,
  sourcePath,
  join(process.cwd(), 'src/lib/reports')
);
"""
new_exec = """const tokenOutput = ts.transpileModule(tokenSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: tokenSourcePath
}).outputText;
const tokenModule = { exports: {} };
new Function('require', 'module', 'exports', '__filename', '__dirname', tokenOutput)(
  require, tokenModule, tokenModule.exports, tokenSourcePath, join(process.cwd(), 'src/lib/reports/design')
);
const runtimeRequire = (id) => id === './design/tokens' ? tokenModule.exports : require(id);
const module = { exports: {} };
new Function('require', 'module', 'exports', '__filename', '__dirname', output)(
  runtimeRequire, module, module.exports, sourcePath, join(process.cwd(), 'src/lib/reports')
);
"""
if smoke.count(old_exec) != 1:
    raise SystemExit('phase14 smoke execution anchor drifted')
smoke_path.write_text(smoke.replace(old_exec, new_exec, 1))

# E. Make the false-positive corpus a permanent provider-free gate.
provider_gate_path = Path('.github/workflows/essential-provider-diagnostics.yml')
provider_gate = provider_gate_path.read_text()
assurance_step = """      - name: Prove Essential assurance boundary provider-free
        run: npx tsx --test scripts/commercial-quality/essential-assurance-boundary-tests.mjs
"""
safety_step = assurance_step + """
      - name: Prove MUST_ALLOW / MUST_REPAIR / MUST_REJECT false-positive safety net
        run: node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/commercial-quality/essential-false-positive-safety-net-tests.mjs
"""
if provider_gate.count(assurance_step) != 1:
    raise SystemExit('provider-free assurance step anchor drifted')
provider_gate_path.write_text(provider_gate.replace(assurance_step, safety_step, 1))

# F. Concrete false-positive decision corpus.
safety_path = Path('scripts/commercial-quality/essential-false-positive-safety-net-tests.mjs')
safety_path.write_text("""import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAssuranceLanguage } from '../../src/lib/reports/narrative/validation.ts';
import { normaliseProhibitedAssessmentAssurance } from '../../src/lib/reports/narrative/assurance-boundary-normalisation.ts';
import { classifyNarrativeIssue, classifyNarrativeRecoveryIssue } from '../../src/lib/reports/narrative/validation-severity.ts';
import { emptyNarrativeRecoveryBudget, recoveryDecision } from '../../src/lib/reports/narrative/recovery-policy.ts';

const MUST_ALLOW = [
  'Operating effectiveness should then be independently verified before management closes the action.',
  'The control evidence must be independently reviewed before reliance.',
  'Control effectiveness can be independently verified once the evidence pack is complete.',
  'Management should independently review whether activation occurred only after verification and whether exceptions were approved.',
  'The intended measure is a complete custody trail; this is a management control objective, not a statement that evidence has been validated.'
];
const MUST_REPAIR = [
  'This assessment has independently verified that evidence exists.',
  'Operating effectiveness has been independently verified before closure.'
];
const MUST_REJECT = [
  'Operating effectiveness was independently verified.',
  'The evidence must be independently verified by MK before closure.',
  'Independent verification is important.'
];

function manuscript(text) {
  return { ok: true, markdown: `# Executive\\n\\n${text}`, errors: [], chapters: [{ chapterId: 'EXEC', title: 'Executive', sections: [{ chapterId: 'EXEC', sectionId: 'POSITION', title: 'Position', permittedClaimRefs: [], paragraphs: [{ text, permittedClaimRefs: [] }], subsections: [] }] }] };
}

test('MUST_ALLOW remains untouched', () => {
  for (const text of MUST_ALLOW) {
    assert.notEqual(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
    const candidate = manuscript(text);
    assert.equal(normaliseProhibitedAssessmentAssurance(candidate), 0, text);
    assert.equal(candidate.chapters[0].sections[0].paragraphs[0].text, text);
  }
});

test('MUST_REPAIR is blocked, bounded and deterministically repaired', () => {
  const issue = classifyNarrativeRecoveryIssue({ code: 'assurance_claim', localSemanticEligible: true });
  assert.equal(issue.blocking, true);
  assert.equal(issue.repairEligible, true);
  assert.equal(issue.severity, 'REPAIRABLE_SEMANTIC_FAILURE');
  const decision = recoveryDecision({ budget: emptyNarrativeRecoveryBudget(), issueSeverity: issue.severity, issueScope: 'block', fullGenerationRejected: true });
  assert.equal(decision.action, 'TARGETED_REPAIR');
  for (const text of MUST_REPAIR) {
    assert.equal(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
    const candidate = manuscript(text);
    assert.equal(normaliseProhibitedAssessmentAssurance(candidate), 2, text);
    const repaired = candidate.chapters[0].sections[0].paragraphs[0].text;
    assert.notEqual(repaired, text);
    assert.equal(classifyAssuranceLanguage(repaired), null, repaired);
  }
});

test('MUST_REJECT and hard truth remain fail-closed', () => {
  for (const text of MUST_REJECT) assert.equal(classifyAssuranceLanguage(text)?.category, 'prohibited_assurance', text);
  const issue = classifyNarrativeRecoveryIssue({ code: 'assurance_claim', localSemanticEligible: false });
  assert.equal(issue.severity, 'HARD_TRUTH_FAILURE');
  assert.equal(issue.repairEligible, false);
  assert.equal(recoveryDecision({ budget: emptyNarrativeRecoveryBudget(), issueSeverity: issue.severity, issueScope: 'block', fullGenerationRejected: true }).action, 'HUMAN_REVIEW_REQUIRED');
  for (const code of ['unsupported_numeric_claim', 'invented_finding', 'invented_scenario', 'unknown_claim_ref']) {
    const truth = classifyNarrativeIssue(code);
    assert.equal(truth.severity, 'HARD_TRUTH_FAILURE', code);
    assert.equal(truth.blocking, true, code);
    assert.equal(truth.repairEligible, false, code);
  }
});
""")

print('reviewed final-acceptance source closure staged')
