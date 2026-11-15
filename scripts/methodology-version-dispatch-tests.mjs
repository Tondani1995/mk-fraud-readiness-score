// Version-based methodology dispatch: the family is resolved from the assessment's recorded mode, methodology version
// and graph pin, and anything that does not resolve fails closed. Realistic records use the repository's real version
// codes and the real V1.2 candidate graph identity; no database, provider or customer record is touched.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/methodology-version-dispatch-tests.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveMethodologyRoute, dispatchSubmittedAssessmentScoring, loadRecordedMethodologyFromDb, methodologyFamilyFor,
  FIXED_METHODOLOGY_CODES, ADAPTIVE_GRAPH_REGISTRY
} from '../src/lib/scoring/methodology-dispatch.ts';

const graphV12 = JSON.parse(fs.readFileSync('src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json', 'utf8'));
const MV = { 'MFRS-V1.0': '00000000-0000-4000-8000-000000000010', 'MFRS-V1.1': '00000000-0000-4000-8000-000000000011', 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION': '00000000-0000-4000-8000-000000000012' };
const G12 = { id: '00000000-0000-4000-8000-0000000000a2', graphVersion: graphV12.graphVersion, methodologyVersionId: MV[graphV12.methodologyVersion], methodologyVersion: graphV12.methodologyVersion, graphFingerprint: graphV12.graphFingerprint, status: 'published' };
const G11 = { id: '00000000-0000-4000-8000-0000000000a1', graphVersion: 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804', methodologyVersionId: MV['MFRS-V1.1'], methodologyVersion: 'MFRS-V1.1', graphFingerprint: 'b'.repeat(64), status: 'draft' };
const fixed = (code) => ({ assessmentReference: `FX-FIXED-${code}`, assessmentMode: 'legacy_fixed', methodologyVersionId: MV[code], methodologyVersionCode: code, graphVersionId: null, graphVersionSnapshot: null, graphFingerprintSnapshot: null, graph: null });
const adaptive = (g, over = {}) => ({ assessmentReference: `FX-ADAPTIVE-${g.graphVersion}`, assessmentMode: 'adaptive', methodologyVersionId: g.methodologyVersionId, methodologyVersionCode: g.methodologyVersion, graphVersionId: g.id, graphVersionSnapshot: g.graphVersion, graphFingerprintSnapshot: g.graphFingerprint, graph: g, ...over });

const results = [];
async function T(id, name, fn) {
  try { await fn(); results.push([id, 'PASS', name]); } catch (error) { results.push([id, 'FAIL', `${name}: ${error.message}`]); }
}

await T('VD-01', 'Fixed assessments on MFRS-V1.0 and MFRS-V1.1 resolve to the fixed calculator', () => {
  for (const code of FIXED_METHODOLOGY_CODES) assert.deepEqual(resolveMethodologyRoute(fixed(code)), { ok: true, family: 'mfrs-fixed', methodologyVersionCode: code });
});
await T('VD-02', 'An adaptive V1.2 assessment resolves to the adaptive calculator with its own graph version and fingerprint', () => {
  const r = resolveMethodologyRoute(adaptive(G12));
  assert.equal(r.ok, true); assert.equal(r.family, 'mfrs-adaptive'); assert.equal(r.graphVersion, 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'); assert.equal(r.graphFingerprint, graphV12.graphFingerprint);
});
await T('VD-03', 'MFRS-V1.1 is fixed or adaptive by the recorded mode and pin, never by the code alone', () => {
  assert.equal(resolveMethodologyRoute(fixed('MFRS-V1.1')).family, 'mfrs-fixed');
  assert.equal(resolveMethodologyRoute(adaptive(G11)).family, 'mfrs-adaptive');
});
await T('VD-04', 'The defect in the withdrawn patch: an adaptive assessment with a null graph identifier is refused, not scored as fixed', () => {
  assert.equal(methodologyFamilyFor({ graphVersionId: null }), 'mfrs-fixed', 'the withdrawn rule');
  const r = resolveMethodologyRoute(adaptive(G12, { graphVersionId: null }));
  assert.equal(r.ok, false); assert.equal(r.refusal, 'adaptive_assessment_without_graph_pin');
});
await T('VD-05', 'Mismatches fail closed with their reason', () => {
  const cases = [
    [{ ...fixed('MFRS-V1.1'), graphVersionId: G12.id }, 'fixed_assessment_with_graph_pin'],
    [{ ...fixed('MFRS-V1.0'), methodologyVersionCode: 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION' }, 'unregistered_methodology_version'],
    [{ ...fixed('MFRS-V1.0'), methodologyVersionCode: null }, 'methodology_version_not_found'],
    [adaptive(G12, { graph: null }), 'graph_not_found'],
    [adaptive(G12, { graph: { ...G12, graphVersion: 'MFRS-V9-UNKNOWN' }, graphVersionSnapshot: 'MFRS-V9-UNKNOWN' }), 'unregistered_graph_version'],
    [adaptive(G12, { methodologyVersionId: MV['MFRS-V1.1'], methodologyVersionCode: 'MFRS-V1.1' }), 'graph_methodology_mismatch'],
    [adaptive(G12, { graphVersionSnapshot: 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804' }), 'graph_snapshot_mismatch'],
    [adaptive(G12, { graphFingerprintSnapshot: 'c'.repeat(64) }), 'graph_fingerprint_mismatch'],
    [{ ...fixed('MFRS-V1.1'), assessmentMode: 'review' }, 'unknown_assessment_mode'],
    [{ ...fixed('MFRS-V1.1'), assessmentMode: null }, 'unknown_assessment_mode'],
    [null, 'assessment_not_found']
  ];
  for (const [record, refusal] of cases) { const r = resolveMethodologyRoute(record); assert.equal(r.ok, false, refusal); assert.equal(r.refusal, refusal); }
});
await T('VD-06', 'A revised (review bank) assessment is registered and refused; it never reaches an MFRS calculator', () => {
  for (const record of [{ ...fixed('MFRS-V1.1'), reviewRuleset: { engine: { build: '1.6' } } }, adaptive(G12, { reviewRuleset: { engine: { build: '1.6' } } })]) {
    const r = resolveMethodologyRoute(record); assert.equal(r.ok, false); assert.equal(r.family, 'revised-review'); assert.equal(r.refusal, 'revised_methodology_inactive');
  }
});
await T('VD-07', 'The entry point calls exactly the resolved family\'s unchanged scorer, passes the run type through and calls none on refusal', async () => {
  const records = { A: fixed('MFRS-V1.1'), B: adaptive(G12), C: adaptive(G12, { graphVersionId: null }), D: { ...fixed('MFRS-V1.1'), reviewRuleset: { engine: { build: '1.6' } } } };
  const calls = [];
  const deps = {
    loadRecordedMethodology: async (ref) => records[ref] ?? null,
    scoreFixed: async (ref, o) => { calls.push(['fixed', ref, o.runType]); return { ok: true, scoreRunId: `run-${ref}` }; },
    scoreAdaptive: async (ref, o) => { calls.push(['adaptive', ref, o.runType]); return { ok: true, scoreRunId: `run-${ref}` }; }
  };
  const a = await dispatchSubmittedAssessmentScoring('A', { runType: 'initial' }, deps);
  const b = await dispatchSubmittedAssessmentScoring('B', { runType: 'admin_recalc' }, deps);
  const c = await dispatchSubmittedAssessmentScoring('C', { runType: 'initial' }, deps);
  const d = await dispatchSubmittedAssessmentScoring('D', { runType: 'initial' }, deps);
  const e = await dispatchSubmittedAssessmentScoring('missing', { runType: 'initial' }, deps);
  assert.deepEqual(calls, [['fixed', 'A', 'initial'], ['adaptive', 'B', 'admin_recalc']]);
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  assert.deepEqual([c.status, c.errors[0]], [409, 'methodology_dispatch_refused:adaptive_assessment_without_graph_pin']);
  assert.deepEqual([d.status, d.errors[0]], [409, 'methodology_dispatch_refused:revised_methodology_inactive']);
  assert.deepEqual([e.status, e.errors[0]], [404, 'methodology_dispatch_refused:assessment_not_found']);
});
await T('VD-08', 'The production loader reads the stored columns and resolves stored rows exactly as the in-memory records', async () => {
  // A minimal stand-in for the service-role client's query builder over rows shaped as the migrations define them.
  const tables = {
    assessments: [
      { assessment_reference: 'FX-ROW-FIXED', assessment_mode: 'legacy_fixed', methodology_version_id: MV['MFRS-V1.1'], graph_version_id: null, graph_version_snapshot: null, graph_fingerprint_snapshot: null },
      { assessment_reference: 'FX-ROW-ADAPTIVE', assessment_mode: 'adaptive', methodology_version_id: MV[graphV12.methodologyVersion], graph_version_id: G12.id, graph_version_snapshot: G12.graphVersion, graph_fingerprint_snapshot: G12.graphFingerprint }
    ],
    methodology_versions: Object.entries(MV).map(([version_code, id]) => ({ id, version_code })),
    adaptive_graph_versions: [{ id: G12.id, graph_version: G12.graphVersion, methodology_version_id: G12.methodologyVersionId, methodology_version: G12.methodologyVersion, graph_fingerprint: G12.graphFingerprint, status: 'published' }]
  };
  const db = { from: (t) => ({ select: () => ({ eq: (col, val) => ({ maybeSingle: async () => ({ data: tables[t].find((r) => r[col] === val) ?? null, error: null }) }) }) }) };
  assert.equal(resolveMethodologyRoute(await loadRecordedMethodologyFromDb(db, 'FX-ROW-FIXED')).family, 'mfrs-fixed');
  const r = resolveMethodologyRoute(await loadRecordedMethodologyFromDb(db, 'FX-ROW-ADAPTIVE'));
  assert.equal(r.family, 'mfrs-adaptive'); assert.equal(r.ok, true);
  assert.equal(await loadRecordedMethodologyFromDb(db, 'FX-ROW-NONE'), null);
});
await T('VD-09', 'Every registered adaptive graph names the methodology it was compiled against; the repository graph agrees with the registry', () => {
  assert.equal(ADAPTIVE_GRAPH_REGISTRY[graphV12.graphVersion].methodologyVersionCode, graphV12.methodologyVersion);
  assert.ok(Object.values(ADAPTIVE_GRAPH_REGISTRY).every((x) => x.methodologyVersionCode));
});

for (const [id, status, name] of results) console.log(`${status} ${id} ${name}`);
const failed = results.filter((r) => r[1] !== 'PASS').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
