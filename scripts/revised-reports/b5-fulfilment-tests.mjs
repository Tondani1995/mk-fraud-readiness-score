// Revised generation reliability with deterministic writer doubles (no paid model call): the exact bound B5 fixtures,
// the real analysis, validator, layout, PDF renderer and workbook, and an in-memory database double that emulates the
// review store's ledger and checkpoint functions as the migration defines them (lifetime order ceiling, campaign call
// and cost ceilings charged at worst case until settled, idempotent checkpoints per attempt and stage). The SQL itself is
// tested separately against a real local PostgreSQL (generation-ledger-sql-tests.mjs).
// Needs a local Chromium (PUPPETEER_EXECUTABLE_PATH).
//   PUPPETEER_EXECUTABLE_PATH=... node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/b5-fulfilment-tests.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { replay } from '../../src/lib/readiness-review/session.ts';
import { generateRevisedManualReport } from '../../src/lib/reports/revised/live/manual-generation.ts';
import { REVISED_TIME_BUDGET } from '../../src/lib/reports/revised/live/produce.ts';
import { reconcileAudits } from '../../src/lib/reports/revised/live/checkpoints.ts';
import { layoutPublication } from '../../src/lib/reports/revised/manuscript/layout.ts';
import { closePublicationBrowser } from '../../src/lib/reports/revised/manuscript/render.ts';
import { loadFixture, fixturePack } from './lib/b5-fixtures.mjs';
import { writerDouble } from './lib/writer-double.mjs';

// The restricted-test flag sets the length gate to record-only, as on the test deployment; the doubles' manuscripts are short.
process.env.MK_REVISED_COMMERCIAL_PATH = 'restricted-test';
const ENV = { MK_REVISED_CALL_CAMPAIGN: 'local-doubles' };
const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 4).join(' ') }); } };

const FX = { kestrel: loadFixture('kestrel'), marula: loadFixture('marula') };
const orderFor = (name, product) => {
  const x = FX[name];
  return {
    orderId: `order-${name}-${product}`, orderReference: `MKORD-TEST-${name.toUpperCase()}-${product.toUpperCase()}`, assessmentId: `assessment-${name}`,
    assessmentReference: x.f.assessmentReference, organisationId: `org-${name}`, organisationName: x.f.record.organisationLabel, customerName: null, scoreRunId: `run-${name}`,
    reportType: product === 'essential' ? 'essential_self_assessment' : 'mk_validated', product,
    binding: { sessionId: `session-${name}`, inputDigest: x.f.inputDigest, logDigest: x.f.logDigest, actionCount: x.f.boundActionCount, engineBuild: '1.6', outstandingTotal: 0, boundAt: '2026-11-13T06:00:00Z' }
  };
};
const replayFor = (name) => async () => replay(FX[name].f.record);

/**
 * In-memory review store. `faults` injects failures by function: 'error' (an error response), 'throw' (a network
 * failure), 'malformed', 'incomplete', 'deny' (every write refused), 'lost' (the write commits but the first response
 * is lost). Budgets: { campaign: { maxCalls, maxCostUsd } }.
 */
function store({ budgets = { 'local-doubles': { maxCalls: 50, maxCostUsd: 25 } }, faults = {}, trigger = 'admin_generate', failUpload = false, failFinalise = false } = {}) {
  const S = { calls: [], checkpoints: [], runs: [], events: [], attempts: new Map(), finalised: 0, uploads: 0, log: [], trigger };
  const fault = (k) => faults[k];
  const once = new Set();
  const committedCost = (camp) => S.calls.filter((c) => c.campaign === camp).reduce((m, c) => m + (['succeeded', 'failed'].includes(c.status) && c.settledCost !== null ? c.settledCost : c.reservedCost), 0);
  const rpc = {
    review_reserve_generation_call: ({ p }) => {
      if (fault('reserve') === 'throw') throw new Error('network failure');
      if (fault('reserve') === 'error') return { data: null, error: { message: 'injected ledger error' } };
      if (fault('reserve') === 'malformed') return { data: { ok: true }, error: null };
      const b = budgets[p.campaign];
      if (!p.campaign || !b) return { data: { allowed: false, reason: 'campaign_budget_missing' }, error: null };
      if (!(p.reservedCostUsd > 0)) return { data: { allowed: false, reason: 'cost_not_bounded' }, error: null };
      const ceiling = Math.min(Math.max(p.orderCeiling ?? 6, 1), 6);
      const orderCalls = S.calls.filter((c) => c.order === p.orderReference).length;
      if (orderCalls >= ceiling) return { data: { allowed: false, reason: 'order_ceiling_reached', orderCalls, orderCeiling: ceiling }, error: null };
      const campCalls = S.calls.filter((c) => c.campaign === p.campaign).length;
      if (campCalls + 1 > b.maxCalls) return { data: { allowed: false, reason: 'campaign_calls_exhausted' }, error: null };
      if (committedCost(p.campaign) + p.reservedCostUsd > b.maxCostUsd) return { data: { allowed: false, reason: 'campaign_cost_exhausted' }, error: null };
      const callId = crypto.randomUUID();
      S.calls.push({ callId, campaign: p.campaign, order: p.orderReference, attempt: p.attemptId, stage: p.stage, model: p.model, reservedCost: p.reservedCostUsd, status: 'reserved', settledCost: null });
      return { data: { allowed: true, callId, orderCalls: orderCalls + 1, orderCeiling: ceiling, campaignCalls: campCalls + 1, maxCalls: b.maxCalls, committedUsd: committedCost(p.campaign), maxCostUsd: b.maxCostUsd }, error: null };
    },
    review_settle_generation_call: ({ p }) => {
      if (fault('settle') === 'error') return { data: null, error: { message: 'injected settlement error' } };
      const c = S.calls.find((x) => x.callId === p.callId && x.status === 'reserved');
      if (!c) return { data: { settled: false }, error: null };
      c.status = p.status; c.settledCost = p.status === 'indeterminate' ? null : p.costUsd; c.usage = p.usage;
      return { data: { settled: true, status: c.status }, error: null };
    },
    review_record_generation_checkpoint: ({ p }) => {
      const f = fault(`checkpoint:${p.stage}`);
      if (f === 'deny') return { data: null, error: { message: 'injected checkpoint denial' } };
      const existing = S.checkpoints.find((c) => c.attemptId === p.attemptId && c.stage === p.stage);
      if (!existing) S.checkpoints.unshift({ ...p, createdAt: new Date().toISOString() });
      if (f === 'lost' && !once.has(`${p.attemptId}:${p.stage}`)) { once.add(`${p.attemptId}:${p.stage}`); return { data: null, error: { message: 'injected lost response' } }; }
      const row = existing ?? S.checkpoints[0];
      return { data: { recorded: true, duplicate: !!existing, payloadDigest: row.payloadDigest, matches: row.payloadDigest === p.payloadDigest }, error: null };
    },
    review_generation_checkpoints: ({ p_order, p_input_digest }) => {
      const f = fault('history');
      if (f === 'throw') throw new Error('network failure');
      if (f === 'error') return { data: null, error: { message: 'injected history error' } };
      if (f === 'malformed') return { data: { unexpected: true }, error: null };
      const rows = S.checkpoints.filter((c) => c.orderReference === p_order && c.inputDigest === p_input_digest)
        .map((c) => ({ attemptId: c.attemptId, stage: c.stage, factPackDigest: c.factPackDigest, manuscript: c.stage === 'linked' ? null : c.manuscript, reportId: c.reportId, resumeMeta: c.auditPackage?.resumeMeta ?? null, createdAt: c.createdAt }));
      if (f === 'incomplete') return { data: [{ attemptId: 'x', stage: 'validated', factPackDigest: null, manuscript: null }], error: null };
      return { data: rows, error: null };
    },
    review_unlinked_generation_audits: ({ p_order }) => {
      if (fault('history') === 'error') return { data: null, error: { message: 'injected history error' } };
      const linked = new Set(S.checkpoints.filter((c) => c.stage === 'linked').map((c) => c.attemptId));
      return { data: S.checkpoints.filter((c) => c.orderReference === p_order && c.stage === 'validated' && !linked.has(c.attemptId)).map((c) => ({ attemptId: c.attemptId, inputDigest: c.inputDigest })), error: null };
    },
    review_record_report_run: ({ p_run }) => { S.runs.push(p_run); return { data: null, error: null }; },
    complete_manual_report_generation: ({ p_attempt_id }) => finalise(p_attempt_id),
    finalise_manual_report_with_supporting_register: ({ p_attempt_id }) => finalise(p_attempt_id)
  };
  const finalise = (attemptId) => {
    if (failFinalise) return { data: null, error: { message: 'injected finalisation failure', code: 'XX000' } };
    S.finalised += 1;
    const id = crypto.randomUUID();
    S.attempts.set(attemptId, { status: 'completed', output_report_id: id });
    return { data: { report: { id, report_reference: `RPT-TEST-V${S.finalised}`, version_number: S.finalised }, superseded_report_id: null }, error: null };
  };
  const from = (table) => {
    const filters = {};
    const chain = {
      insert: async (row) => { if (table === 'order_events') S.events.push(row); return { error: null }; },
      select: () => chain, eq: (k, v) => { filters[k] = v; return chain; }, order: () => chain, limit: () => chain,
      maybeSingle: async () => {
        if (table === 'manual_report_generation_attempts') return { data: { trigger_source: S.trigger, ...(S.attempts.get(filters.id) ?? { status: 'started', output_report_id: null }) }, error: null };
        if (table === 'report_templates') return { data: { id: 'template-1', template_code: 't', version_number: 1 }, error: null };
        return { data: null, error: null };
      },
      then: (res) => res({ data: [], error: null })
    };
    return chain;
  };
  return {
    S, faults, from,
    storage: { from: () => ({ upload: async () => { if (failUpload) return { error: { message: 'injected upload failure' } }; S.uploads += 1; return { error: null }; } }) },
    rpc: async (name, args) => { S.log.push(name); if (!rpc[name]) return { data: null, error: { message: `unexpected rpc ${name}` } }; return rpc[name](args); }
  };
}
const helpers = () => ({
  verifyPrivateObject: async () => {}, assertValidPdf: (b) => { if (b.subarray(0, 4).toString() !== '%PDF') throw new Error('not a pdf'); },
  sanitiseReference: (v) => v.replace(/[^A-Za-z0-9-]/g, '-'), recordDiagnostics: async () => {},
  makeError: (reason, message, status) => Object.assign(new Error(message), { reason, status })
});
const doubleFor = (name, product, opts = {}) => { const pk = () => fixturePack(FX[name], product); return writerDouble({ fp: () => pk().fp, plan: () => pk().plan, ...opts }); };
const run = async ({ name = 'marula', product = 'essential', db = store(), writer, now, layout, env = ENV, attemptId = crypto.randomUUID() } = {}) => {
  const w = writer ?? doubleFor(name, product);
  const tracked = [];
  let out = null, error = null;
  try {
    out = await generateRevisedManualReport({ db, attemptId, versionNumber: 1, technicalReference: 'tr', order: orderFor(name, product), stage: () => {}, track: (t) => tracked.push(t), helpers: helpers(), writer: w.writer, replay: replayFor(name), now, layout, env });
  } catch (e) { error = e; }
  return { out, error, db, w, tracked, attemptId };
};
const lastFailure = (db) => String(db.S.runs.filter((r) => r.status === 'failed').at(-1)?.failure ?? '').split(':')[0];
const ledger = (db) => db.S.calls.map((c) => `${c.stage}:${c.status}`).join(',');

await T('GF-01', 'Operator generation succeeds with one call reserved before dispatch and settled after; the validated checkpoint holds the full audit package; the report is linked to it', async () => {
  const r = await run();
  const v = r.db.S.checkpoints.find((c) => c.stage === 'validated' && c.attemptId === r.attemptId);
  const pkg = v?.auditPackage ?? {};
  const keys = ['manuscript', 'factPack', 'storyPlan', 'writerBrief', 'validation', 'ai', 'versions', 'boundInput', 'resumeMeta'];
  const ok = r.out?.auditStatus === 'linked' && r.w.calls.length === 1 && ledger(r.db) === 'writer:succeeded' && keys.every((k) => pkg[k])
    && pkg.boundInput.inputDigest === FX.marula.f.inputDigest && r.db.S.checkpoints.some((c) => c.stage === 'linked' && c.attemptId === r.attemptId && c.reportId === r.out.reportId)
    && r.db.S.finalised === 1 && /written by openai\/gpt-5-mini \(1 AI call\)/.test(r.db.S.events.find((e) => e.event_type === 'revised_report_generated')?.note ?? '') && !/sk-[A-Za-z0-9]{10}|service_role|Bearer /.test(JSON.stringify(pkg));
  return [ok, r.error ? `${r.error.reason}: ${r.error.message}` : `ledger ${ledger(r.db)}; package ${Object.keys(pkg).length} keys; audit ${r.out.auditStatus}`];
});
await T('GF-02', 'Kestrel Comprehensive completes with its workbook and passes the publication gates', async () => {
  const r = await run({ name: 'kestrel', product: 'comprehensive' });
  return [!!r.out?.reportId && r.db.S.uploads === 2 && r.db.S.finalised === 1, r.error ? r.error.message : `uploads ${r.db.S.uploads}; advisories ${JSON.stringify(r.out.publicationAdvisories)}`];
});
await T('GF-03', 'The worker\'s automatic trigger is refused before anything is reserved or called', async () => {
  const r = await run({ db: store({ trigger: 'payment_confirmation' }) });
  return [r.error?.reason === 'revised_requires_operator' && r.w.calls.length === 0 && r.db.S.calls.length === 0, `${r.error?.reason}; reserved ${r.db.S.calls.length}`];
});
await T('GF-04', 'History unavailable (error, network failure, malformed, incomplete): refused before any reservation or call', async () => {
  const out = [];
  for (const f of ['error', 'throw', 'malformed', 'incomplete']) {
    const r = await run({ db: store({ faults: { history: f } }) });
    out.push({ f, reason: r.error?.reason, status: r.error?.status, reserved: r.db.S.calls.length, calls: r.w.calls.length });
  }
  return [out.every((x) => x.reason === 'generation_history_unavailable' && x.status === 503 && x.reserved === 0 && x.calls === 0), JSON.stringify(out)];
});
await T('GF-05', 'Ledger unavailable at reservation (error, network failure, malformed): no call is made', async () => {
  const out = [];
  for (const f of ['error', 'throw', 'malformed']) {
    const r = await run({ db: store({ faults: { reserve: f } }) });
    out.push({ f, reason: r.error?.reason, calls: r.w.calls.length, uploads: r.db.S.uploads });
  }
  return [out.every((x) => x.reason === 'generation_accounting_unavailable' && x.calls === 0 && x.uploads === 0), JSON.stringify(out)];
});
await T('GF-06', 'No approved campaign budget: no call is made', async () => {
  const r = await run({ env: {} });
  const r2 = await run({ env: { MK_REVISED_CALL_CAMPAIGN: 'unapproved' } });
  return [r.error?.reason === 'generation_budget_missing' && r.w.calls.length === 0 && r2.error?.reason === 'generation_budget_missing' && r2.w.calls.length === 0, `${r.error?.reason}; ${r2.error?.reason}`];
});
await T('GF-07', 'Provider failure: the call stays counted at its worst case (failed, cost unknown); the retry succeeds', async () => {
  const db = store();
  const first = await run({ db, writer: doubleFor('marula', 'essential', { mode: 'fail' }) });
  const failed = db.S.calls[0];
  const second = await run({ db });
  return [first.error && failed.status === 'failed' && failed.settledCost === null && !!second.out && db.S.calls.length === 2, `first ${first.error?.reason}; ledger ${ledger(db)}`];
});
await T('GF-08', 'Provider timeout: the call is settled as indeterminate and stays charged at its worst case', async () => {
  const db = store();
  const w = doubleFor('marula', 'essential');
  const timeoutWriter = { writer: async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; }, calls: [] };
  const r = await run({ db, writer: timeoutWriter });
  void w;
  return [r.error?.reason === 'generation_timed_out' && db.S.calls[0]?.status === 'indeterminate' && db.S.calls[0]?.settledCost === null, `${r.error?.reason}; ledger ${ledger(db)}`];
});
await T('GF-09', 'Rejection after the permitted repair: exactly two calls in the ledger, the draft stored, nothing validated or composed', async () => {
  const r = await run({ writer: doubleFor('marula', 'essential', { mode: 'reject' }) });
  const stages = r.db.S.checkpoints.map((c) => c.stage).join(',');
  return [r.db.S.calls.length === 2 && stages === 'drafted' && r.db.S.uploads === 0 && lastFailure(r.db) === 'manuscript_rejected', `ledger ${ledger(r.db)}; checkpoints ${stages}`];
});
await T('GF-10', 'Deadline: a slow draft leaves no time for the repair; the draft is stored; the retry repairs it with one call (two in the ledger, never three)', async () => {
  const db = store();
  let clock = 1_800_000_000_000;
  const first = await run({ db, now: () => clock, writer: doubleFor('marula', 'essential', { mode: 'reject', onCall: () => { clock += 160_000; } }) });
  const second = await run({ db, writer: doubleFor('marula', 'essential', { sequence: ['valid'] }) });
  return [lastFailure({ S: { runs: db.S.runs.slice(0, 1) } }) === 'time_budget_exhausted' && first.w.calls.length === 1 && !!second.out && second.w.calls.length === 1 && db.S.calls.length === 2,
    `first ${first.error?.reason} after ${first.w.calls.length} call; retry ${second.out ? 'generated' : second.error?.message} with ${second.w.calls.length}; ledger ${ledger(db)}`];
});
await T('GF-11', 'Storage failure after validation: nothing finalised; the retry composes the stored manuscript with no AI call', async () => {
  const db = store({ failUpload: true });
  const first = await run({ db });
  db.storage = store().storage;
  const second = await run({ db });
  return [!!first.error && !!second.out && second.w.calls.length === 0 && db.S.calls.length === 1 && db.S.finalised === 1, `first ${first.error?.reason}; retry ${second.out ? 'generated' : second.error?.message} with ${second.w.calls.length} AI calls; ledger ${ledger(db)}`];
});
await T('GF-12', 'Render failure: its call is in the ledger regardless of the failure record; the retry composes with no AI call', async () => {
  const db = store();
  const broken = async () => { throw new Error('injected render failure'); };
  const first = await run({ db, layout: broken });
  const second = await run({ db });
  return [first.error?.reason === 'pdf_render_failed' && db.S.calls.length === 1 && !!second.out && second.w.calls.length === 0, `first ${first.error?.reason}; ledger ${ledger(db)}; retry calls ${second.w.calls.length}`];
});
await T('GF-13', 'The order allowance is lifetime: it does not reset after a successful report (ceiling lowered to 2 for the test)', async () => {
  const db = store();
  const env = { ...ENV, MK_REVISED_ORDER_CALL_CEILING: '2' };
  const first = await run({ db, env });
  const second = await run({ db, env, writer: doubleFor('marula', 'essential', { mode: 'reject' }) });
  return [!!first.out && second.error?.reason === 'generation_call_ceiling_reached' && db.S.calls.length === 2, `first ${first.out ? 'generated' : first.error?.reason}; second ${second.error?.reason} after ${second.w.calls.length} call; ledger ${ledger(db)}`];
});
await T('GF-14', 'Campaign cost: a call whose worst case does not fit the remaining budget is not made', async () => {
  const r = await run({ db: store({ budgets: { 'local-doubles': { maxCalls: 10, maxCostUsd: 0.01 } } }) });
  return [r.error?.reason === 'generation_budget_exhausted' && r.w.calls.length === 0, `${r.error?.reason}`];
});
await T('GF-15', 'Settlement write fails: the call stays reserved (counted at worst case) and the report still completes', async () => {
  const r = await run({ db: store({ faults: { settle: 'error' } }) });
  return [!!r.out && r.db.S.calls[0].status === 'reserved', `ledger ${ledger(r.db)}`];
});
await T('GF-16', 'Audit package cannot be stored: no PDF is stored and nothing is finalised; the calls are counted', async () => {
  const r = await run({ db: store({ faults: { 'checkpoint:validated': 'deny' } }) });
  return [r.error?.reason === 'generation_audit_unavailable' && r.db.S.uploads === 0 && r.db.S.finalised === 0 && r.db.S.calls.length === 1, `${r.error?.reason}; uploads ${r.db.S.uploads}; finalised ${r.db.S.finalised}`];
});
await T('GF-17', 'Lost response on the audit write: the retry finds the stored package and the report completes once', async () => {
  const r = await run({ db: store({ faults: { 'checkpoint:validated': 'lost' } }) });
  return [!!r.out && r.db.S.checkpoints.filter((c) => c.stage === 'validated').length === 1 && r.db.S.finalised === 1, r.error ? r.error.message : 'one validated checkpoint; one report'];
});
await T('GF-18', 'Audit link denied after the report is committed: success is returned as pending, never a second report; recovery links it with no AI call', async () => {
  const db = store({ faults: { 'checkpoint:linked': 'deny' } });
  const r = await run({ db });
  const pendingEvent = db.S.events.some((e) => e.event_type === 'revised_audit_link_pending');
  delete db.faults['checkpoint:linked'];
  const recovered = await reconcileAudits(db, orderFor('marula', 'essential').orderReference, FX.marula.f.inputDigest);
  return [r.out?.auditStatus === 'pending_link' && pendingEvent && db.S.finalised === 1 && recovered.linked.length === 1 && recovered.linked[0].reportId === r.out.reportId && db.S.calls.length === 1,
    `${r.out?.auditStatus}; pending event ${pendingEvent}; finalised ${db.S.finalised}; recovered ${JSON.stringify(recovered.linked.map((x) => x.attemptId === r.attemptId))}`];
});
await T('GF-19', 'A repeated request on the same attempt cannot produce a second report from that attempt', async () => {
  const db = store();
  const attemptId = crypto.randomUUID();
  const first = await run({ db, attemptId });
  const again = await run({ db, attemptId, now: () => Date.now() + 1000 });
  return [!!first.out && !!again.error && db.S.finalised === 1, `again: ${again.error?.reason ?? 'generated'}; finalised ${db.S.finalised}`];
});
await T('GF-20', 'Finalisation failure is reported to the existing handler (uploaded, invoked, not committed)', async () => {
  const r = await run({ db: store({ failFinalise: true }) });
  const t = Object.assign({}, ...r.tracked);
  return [r.error?.reason === 'report_persistence_failed' && t.pdfUploaded && t.finalisationInvoked && !t.finalisationCommitted, JSON.stringify({ reason: r.error?.reason, pdfUploaded: t.pdfUploaded, finalisationCommitted: !!t.finalisationCommitted })];
});
await T('GF-21', 'Answers changed since binding: refused before any reservation or call', async () => {
  const db = store();
  const w = doubleFor('marula', 'essential');
  const changed = { ...FX.marula.f.record, actions: FX.marula.f.record.actions.slice(0, -1) };
  let err = null;
  try { await generateRevisedManualReport({ db, attemptId: 'a', versionNumber: 1, technicalReference: 't', order: orderFor('marula', 'essential'), stage: () => {}, track: () => {}, helpers: helpers(), writer: w.writer, replay: async () => replay(changed), env: ENV }); } catch (e) { err = e; }
  return [err?.status === 409 && w.calls.length === 0 && db.S.calls.length === 0, `${err?.reason} ${err?.status}`];
});
await T('GF-22', 'Publication gate: a PDF whose headings or contents numbers are not verified is held, not stored; the retry recomposes with no AI call', async () => {
  const db = store();
  const unverified = async (base, deps) => { const out = await layoutPublication(base, deps); return { ...out, layout: { ...out.layout, contentsComplete: false, missing: ['moved:ESS-EXEC'] } }; };
  const first = await run({ db, layout: unverified });
  const held = db.S.events.find((e) => e.event_type === 'revised_publication_held');
  const second = await run({ db });
  return [first.error?.reason === 'pdf_publication_held' && db.S.uploads === 1 && !!held && !!second.out && second.w.calls.length === 0, `first ${first.error?.reason}; uploads after both ${db.S.uploads}; retry calls ${second.w.calls.length}`];
});

// "Create New Version" (admin_regenerate) is written afresh, and a draft or manuscript that a later report has superseded
// is never reused (14 November 2026: a regenerate re-repaired the round 1 draft).
const stages = (db, from = 0) => db.S.calls.slice(from).map((c) => c.stage).join(',');
const validatedOf = (db, attemptId) => db.S.checkpoints.find((c) => c.stage === 'validated' && c.attemptId === attemptId)?.auditPackage?.ai ?? {};
const draftThenRepair = async () => {
  const db = store({ trigger: 'admin_generate' });
  const first = await run({ db, writer: doubleFor('marula', 'essential', { mode: 'reject' }) });
  db.S.trigger = 'admin_retry';
  const second = await run({ db });
  return { db, first, second };
};
await T('GF-23', 'Create New Version after a report repaired from a stored draft: the writer drafts afresh; the old draft is not repaired again', async () => {
  const { db, first, second } = await draftThenRepair();
  const before = db.S.calls.length;
  db.S.trigger = 'admin_regenerate';
  const third = await run({ db });
  const ai = validatedOf(db, third.attemptId);
  const note = db.S.events.filter((e) => e.event_type === 'revised_report_generated').at(-1)?.note ?? '';
  const ok = !!first.error && validatedOf(db, second.attemptId).resumedFrom === 'repair' && !!third.out && stages(db, before) === 'writer'
    && ai.resumeMode === 'fresh' && ai.resumedFrom === null && /written by openai\/gpt-5-mini \(1 AI call\)/.test(note) && !/stored by an earlier attempt/.test(note);
  return [ok, `setup ${stages(db, 0).split(',').slice(0, before).join(',')}; new version ${stages(db, before)}; mode ${ai.resumeMode}, resumed ${ai.resumedFrom}`];
});
await T('GF-24', 'Retry after a report: a superseded draft is not repaired again; the retry is written afresh', async () => {
  const { db } = await draftThenRepair();
  const before = db.S.calls.length;
  const third = await run({ db });
  const ai = validatedOf(db, third.attemptId);
  return [!!third.out && stages(db, before) === 'writer' && ai.resumeMode === 'resume' && ai.resumedFrom === null, `retry ${stages(db, before)}; resumed ${ai.resumedFrom}`];
});
await T('GF-25', 'Create New Version ignores a current stored draft that a retry would repair', async () => {
  const db = store({ trigger: 'admin_generate' });
  await run({ db, writer: doubleFor('marula', 'essential', { mode: 'reject' }) });
  const before = db.S.calls.length;
  db.S.trigger = 'admin_regenerate';
  const second = await run({ db });
  return [!!second.out && stages(db, before) === 'writer' && validatedOf(db, second.attemptId).resumedFrom === null, `new version ${stages(db, before)}`];
});
await T('GF-26', 'Create New Version ignores a validated manuscript that never became a report (a retry composes it with no call)', async () => {
  const db = store({ failUpload: true });
  const first = await run({ db });
  db.storage = store().storage;
  db.S.trigger = 'admin_regenerate';
  const second = await run({ db });
  return [!!first.error && !!second.out && second.w.calls.length === 1 && stages(db) === 'writer,writer' && validatedOf(db, second.attemptId).resumedFrom === null, `first ${first.error?.reason}; ledger ${stages(db)}`];
});
await T('GF-27', 'A composed manuscript is superseded by the report it became: a later retry writes afresh instead of composing it again', async () => {
  const db = store({ failUpload: true });
  await run({ db });
  db.storage = store().storage;
  const second = await run({ db });
  const before = db.S.calls.length;
  const third = await run({ db });
  return [second.w.calls.length === 0 && !!third.out && stages(db, before) === 'writer', `retry composed with ${second.w.calls.length} calls; next ${stages(db, before)}`];
});

await closePublicationBrowser();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/b5-fulfilment.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
