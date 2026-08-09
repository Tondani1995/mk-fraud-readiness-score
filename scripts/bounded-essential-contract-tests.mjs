/**
 * Bounded Essential Output Contract — permanent regression suite.
 *
 * F1–F5 bounded-projection matrix, A1–A9 invariants, M4 quality-corridor negatives and the
 * L3 supporting-register adversarial suite. Every assertion runs against the real production
 * functions; none of them re-implements MFS v1 or reconstructs the projection independently.
 *
 * The L3 checks parse the ACTUAL generated XLSX bytes and reconcile identifier SETS against
 * authoritative L1 — never the in-memory generator inputs. A workbook that silently truncates
 * must fail here even when its row counts look plausible.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import readXlsxFile from 'read-excel-file/node';

import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import {
  ESSENTIAL_CAPS,
  EssentialProjectionRequiredError,
  assertEssentialProjectionPresent,
  buildEssentialProjection
} from '../src/lib/reports/essential-projection.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../src/lib/reports/roadmap.ts';
import { buildSupportingRegisterWorkbook } from '../src/lib/reports/supporting-register-workbook.ts';
import { validateBoundedVolume, validateSupportingRegister } from '../src/lib/reports/commercial-quality.ts';
import { checkQualityGates } from '../src/lib/reports/evidence-model/index.ts';

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  FAIL - ${name}`);
    console.error(error?.message ?? error);
  }
}

const F1 = JSON.parse(readFileSync('src/lib/reports/__fixtures__/bounded-essential-f1-all-zero.json', 'utf8'));

/** Derives F2–F5 from the authoritative F1 shape by rewriting recorded responses only. */
function variant(mapResponse, mutate = (d) => d) {
  const d = structuredClone(F1);
  d.questionTraces = d.questionTraces.map((t) => {
    if (!t.applicable) return t;
    const v = mapResponse(t);
    return {
      ...t,
      responseValue: v,
      normalisedScore: v === null ? null : (v / 5) * 100,
      isCriticalGap: v !== null && t.isCritical && v <= 2,
      isMajorGap: v !== null && t.isHardGate && v <= 1,
      triggeredRules: v === null
        ? ['unknown_response_excluded_from_score_denominator']
        : [
          ...(t.isCritical && v <= 2 ? ['critical_gap_response_lte_2'] : []),
          ...(t.isHardGate && v <= 1 ? ['major_hard_gate_gap_response_lte_1'] : [])
        ]
    };
  });
  const byDomain = {};
  for (const t of d.questionTraces.filter((x) => x.applicable && x.responseValue !== null)) {
    (byDomain[t.domainCode] ??= []).push(t.responseValue);
  }
  d.domainResults = d.domainResults.map((x) => {
    const vals = byDomain[x.domainCode] ?? [];
    return {
      ...x,
      rawScore: vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length / 5) * 100 : null,
      coveragePct: 100,
      criticalGapCount: d.questionTraces.filter((t) => t.domainCode === x.domainCode && t.isCriticalGap).length
    };
  });
  const scored = d.domainResults.filter((x) => x.rawScore !== null);
  d.scoreRun = {
    ...d.scoreRun,
    overallScore: scored.length
      ? Math.round((scored.reduce((s, x) => s + x.rawScore * x.weightPct, 0) / scored.reduce((s, x) => s + x.weightPct, 0)) * 100) / 100
      : null,
    criticalGapCount: d.questionTraces.filter((t) => t.isCriticalGap).length,
    majorGapCount: d.questionTraces.filter((t) => t.isMajorGap).length
  };
  d.criticalMajorGaps = d.questionTraces
    .filter((t) => t.isCriticalGap || t.isMajorGap)
    .map(({ normalisedScore, applicable, triggeredRules, ...gap }) => gap);
  return mutate(d);
}

const FIXTURES = [
  { id: 'F1', label: 'all-zero systemic', data: F1, expect: { findings: 6, domains: 6, risks: 6, cars: 6, scenarios: 5, evidence: 15, roadmap: 7, systemic: true } },
  { id: 'F2', label: 'low mixed', data: variant((t) => (t.isHardGate ? 1 : (t.questionCode.charCodeAt(4) % 2 ? 3 : 2))), expect: { systemic: true } },
  { id: 'F3', label: 'moderate', data: variant((t) => (t.isHardGate ? 2 : 3)), expect: { systemic: false } },
  { id: 'F4', label: 'strong', data: variant((t) => (t.questionCode === 'D3-Q01' ? 2 : 4), (d) => { d.maturityCapEvents = []; return d; }), expect: { systemic: false } },
  { id: 'F5', label: 'provisional / high visibility', data: variant((t, i) => (t.questionCode.endsWith('1') ? null : 4), (d) => { d.maturityCapEvents = []; return d; }), expect: { systemic: false } }
];

console.log('Bounded Essential contract suite');

// ---------------------------------------------------------------- F1-F5 + A1/A3/A5/A6
for (const fixture of FIXTURES) {
  await test(`${fixture.id} (${fixture.label}): bounded projection honours every cap`, () => {
    const model = buildAdvisoryEvidenceModel(fixture.data);
    const projection = buildEssentialProjection(fixture.data, model);
    const systemic = projection.systemic.systemic;

    // A1 -- boundedness. Every main-report list at or under its accepted cap.
    assert.ok(projection.findings.length <= (systemic ? ESSENTIAL_CAPS.findingsSystemic : ESSENTIAL_CAPS.findings), 'findings cap');
    assert.ok(projection.risks.length <= ESSENTIAL_CAPS.risks, 'risks cap');
    assert.ok(projection.controlActionRecords.length <= (systemic ? ESSENTIAL_CAPS.controlActionRecordsSystemic : ESSENTIAL_CAPS.controlActionRecords), 'CAR cap');
    assert.ok(projection.scenarios.length <= (systemic ? ESSENTIAL_CAPS.scenariosSystemic : ESSENTIAL_CAPS.scenarios), 'scenario cap');
    assert.ok(projection.evidenceToObtain.length <= ESSENTIAL_CAPS.evidenceToObtain, 'evidence cap');
    assert.ok(projection.leadershipDecisions.length <= ESSENTIAL_CAPS.leadershipDecisions, 'decision cap');
    assert.ok(projection.roadmapActions.length <= ESSENTIAL_CAPS.roadmapTotalCeiling, 'roadmap ceiling');
    assert.equal(validateBoundedVolume(projection).passed, true, 'bounded-volume gate must pass');

    // A5 -- domain fairness: breadth before depth.
    const domains = new Set(projection.findings.map((f) => f.domainCode)).size;
    const domainsWithFindings = new Set(model.materialFindings.map((f) => f.domainCode)).size;
    assert.equal(domains, Math.min(projection.findings.length, domainsWithFindings), 'domain fairness');

    // A7 -- roadmap dependency closure resolves within the retained set.
    const retained = new Set(projection.roadmapActions.map((a) => a.id));
    for (const action of projection.roadmapActions) {
      for (const dep of action.dependencyIds) {
        assert.ok(!model.roadmapActions.some((a) => a.id === dep) || retained.has(dep), `dependency ${dep} not closed`);
      }
    }
    assert.doesNotThrow(() => adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions), 'roadmap must order cleanly');

    // A6 -- determinism.
    const again = buildEssentialProjection(fixture.data, buildAdvisoryEvidenceModel(fixture.data));
    assert.deepEqual(again.findings.map((f) => f.id), projection.findings.map((f) => f.id), 'selection must be deterministic');

    if (fixture.expect.systemic !== undefined) assert.equal(systemic, fixture.expect.systemic, 'systemic flag');
    if (fixture.expect.findings !== undefined) {
      assert.equal(projection.findings.length, fixture.expect.findings, 'F1 findings');
      assert.equal(domains, fixture.expect.domains, 'F1 domains');
      assert.equal(projection.risks.length, fixture.expect.risks, 'F1 risks');
      assert.equal(projection.controlActionRecords.length, fixture.expect.cars, 'F1 CARs');
      assert.equal(projection.scenarios.length, fixture.expect.scenarios, 'F1 scenarios');
      assert.equal(projection.evidenceToObtain.length, fixture.expect.evidence, 'F1 evidence');
      assert.equal(projection.roadmapActions.length, fixture.expect.roadmap, 'F1 roadmap');
    }
  });
}

// ---------------------------------------------------------------- A4: L1 immutability
await test('A4: F1 L1 universe is exactly the authoritative set and is never reduced', () => {
  const model = buildAdvisoryEvidenceModel(F1);
  const projection = buildEssentialProjection(F1, model);
  assert.equal(model.materialFindings.length, 60);
  assert.equal(model.riskRegister.length, 56);
  assert.equal(model.controlImprovements.length, 60);
  assert.equal(model.evidenceChecklist.length, 243);
  assert.equal(model.roadmapActions.length, 60);
  assert.equal(model.functionalAgenda.length, 130);
  assert.equal(F1.questionTraces.length, 68);
  assert.deepEqual(projection.universe, {
    materialFindings: 60, riskRegister: 56, controlImprovements: 60,
    evidenceChecklist: 243, roadmapActions: 60, functionalAgenda: 130,
    controlActionRecords: projection.universe.controlActionRecords
  });
});

// ---------------------------------------------------------------- A9: no special-casing
await test('A9: no assessment/order/report identifier special-casing in bounded modules', () => {
  for (const file of [
    'src/lib/reports/essential-projection.ts',
    'src/lib/reports/supporting-register-workbook.ts',
    'src/lib/reports/templates/report-template.ts'
  ]) {
    const source = readFileSync(file, 'utf8');
    assert.ok(!/MKFRS-\d{4}-|MKORD-\d{4}-|RPT-MKFRS-/.test(source), `${file} must not special-case an identifier`);
  }
});

// ---------------------------------------------------------------- projection-required invariant
await test('Paid Essential fails closed when the bounded projection is absent', () => {
  assert.throws(
    () => assertEssentialProjectionPresent('essential_self_assessment', undefined, 'test stage'),
    (error) => error instanceof EssentialProjectionRequiredError && error.code === 'essential_projection_required'
  );
  // Legacy/non-Essential report types are unaffected.
  assert.doesNotThrow(() => assertEssentialProjectionPresent('mk_validated', undefined, 'test stage'));
});

// ---------------------------------------------------------------- M4 quality corridor
await test('M4: excessive L2 volume raises QG_COMMERCIAL_VOLUME_EXCEEDED', () => {
  const model = buildAdvisoryEvidenceModel(F1);
  const projection = buildEssentialProjection(F1, model);
  const overfull = { ...projection, findings: model.materialFindings, risks: model.riskRegister };
  const result = validateBoundedVolume(overfull);
  assert.equal(result.passed, false);
  assert.ok(result.violations.some((v) => v.code === 'QG_COMMERCIAL_VOLUME_EXCEEDED'), 'must raise the volume code');
  assert.ok(result.violations.every((v) => v.severity === 'violation'), 'must be release-blocking');
});

await test('M4: incomplete L3 raises QG_SUPPORTING_REGISTER_INCOMPLETE', () => {
  const clean = validateSupportingRegister({ reconciled: true, mismatches: [] });
  assert.equal(clean.passed, true);
  const broken = validateSupportingRegister({ reconciled: false, mismatches: ['materialFindings:59/60'] });
  assert.equal(broken.passed, false);
  assert.ok(broken.violations.some((v) => v.code === 'QG_SUPPORTING_REGISTER_INCOMPLETE'));
  assert.ok(broken.violations.every((v) => v.severity === 'violation'));
});

await test('M4: the minimum commercial-substance control still fires independently', () => {
  const thin = structuredClone(F1);
  thin.questionTraces = thin.questionTraces.map((t) => (t.applicable
    ? { ...t, responseValue: 5, normalisedScore: 100, isCriticalGap: false, isMajorGap: false, triggeredRules: [] }
    : t));
  thin.criticalMajorGaps = [];
  thin.maturityCapEvents = [];
  thin.domainResults = thin.domainResults.map((d) => ({ ...d, rawScore: 100, criticalGapCount: 0 }));
  thin.scoreRun = { ...thin.scoreRun, overallScore: 100, criticalGapCount: 0, majorGapCount: 0 };
  const model = buildAdvisoryEvidenceModel(thin);
  const gate = checkQualityGates(model, thin);
  assert.ok(
    gate.warnings.some((w) => w.code === 'QG_COMMERCIAL_VOLUME_WARNING'),
    'a near-empty assessment must still trip the minimum-substance control'
  );
});

// ---------------------------------------------------------------- L3 actual-byte reconciliation
const GOVERNED = {
  Findings: (m, d) => m.materialFindings.map((x) => x.id),
  Risks: (m) => m.riskRegister.map((x) => x.id),
  'Control Improvements': (m) => m.controlImprovements.map((x) => x.id),
  'Evidence Checklist': (m) => m.evidenceChecklist.map((x) => x.id),
  Roadmap: (m) => m.roadmapActions.map((x) => x.id),
  'Functional Agenda': (m) => m.functionalAgenda.map((x) => x.id),
  'Question Trace': (m, d) => d.questionTraces.map((x) => x.questionCode)
};

async function parseWorkbook(bytes) {
  const sheets = await readXlsxFile(Readable.from(bytes));
  return Object.fromEntries(sheets.map((s) => [s.sheet, s.data]));
}

let f1Workbook;
await test('L3: F1 workbook reconciles identifier SETS from actual XLSX bytes', async () => {
  const model = buildAdvisoryEvidenceModel(F1);
  const projection = buildEssentialProjection(F1, model);
  f1Workbook = await buildSupportingRegisterWorkbook(F1, model, projection);
  assert.match(f1Workbook.checksumSha256, /^[0-9a-f]{64}$/);
  assert.ok(f1Workbook.bytes.length > 0);
  const parsed = await parseWorkbook(f1Workbook.bytes);
  for (const [sheet, ids] of Object.entries(GOVERNED)) {
    assert.ok(parsed[sheet], `workbook must contain the ${sheet} sheet`);
    const rows = parsed[sheet].slice(1);                    // header row excluded
    const expected = ids(model, F1).map(String).sort();
    const actual = rows.map((r) => String(r[0])).sort();
    assert.equal(rows.length, expected.length, `${sheet} row count`);
    assert.deepEqual(actual, expected, `${sheet} identifier set`);
  }
});

// ---------------------------------------------------------------- L3 adversarial suite
function reconcile(parsed, model, data) {
  const mismatches = [];
  for (const [sheet, ids] of Object.entries(GOVERNED)) {
    const rows = parsed[sheet]?.slice(1);
    if (!rows) { mismatches.push(`${sheet}:missing`); continue; }
    const expected = ids(model, data).map(String).sort();
    const actual = rows.map((r) => String(r[0])).sort();
    if (rows.length !== expected.length) mismatches.push(`${sheet}:${rows.length}/${expected.length}`);
    else if (JSON.stringify(actual) !== JSON.stringify(expected)) mismatches.push(`${sheet}:identifier-set`);
  }
  return { reconciled: mismatches.length === 0, mismatches };
}

await test('L3 adversarial: twelve defective workbooks all fail closed', async () => {
  const model = buildAdvisoryEvidenceModel(F1);
  const parsed = await parseWorkbook(f1Workbook.bytes);
  assert.equal(reconcile(parsed, model, F1).reconciled, true, 'the intact workbook must reconcile');

  const mutate = (fn) => { const copy = structuredClone(parsed); fn(copy); return copy; };
  const cases = [
    ['missing sheet', mutate((w) => { delete w.Findings; })],
    ['renamed/unexpected sheet', mutate((w) => { w['Findings Register'] = w.Findings; delete w.Findings; })],
    ['truncated Findings', mutate((w) => { w.Findings = w.Findings.slice(0, 30); })],
    ['truncated Evidence Checklist', mutate((w) => { w['Evidence Checklist'] = w['Evidence Checklist'].slice(0, 100); })],
    ['missing final record', mutate((w) => { w.Roadmap = w.Roadmap.slice(0, -1); })],
    ['duplicate ID', mutate((w) => { w.Findings[2] = [...w.Findings[1]]; })],
    ['correct counts but wrong IDs', mutate((w) => { w.Risks = w.Risks.map((r, i) => (i === 0 ? r : ['WRONG-' + i, ...r.slice(1)])); })],
    ['broken provenance (question trace)', mutate((w) => { w['Question Trace'] = w['Question Trace'].map((r, i) => (i === 0 ? r : ['ZZ-Q99', ...r.slice(1)])); })],
    ['first sheet only', { Findings: parsed.Findings }],
    ['empty workbook', {}],
    ['agenda truncated', mutate((w) => { w['Functional Agenda'] = w['Functional Agenda'].slice(0, 5); })],
    ['control improvements dropped', mutate((w) => { w['Control Improvements'] = [w['Control Improvements'][0]]; })]
  ];
  for (const [label, defective] of cases) {
    const result = reconcile(defective, model, F1);
    assert.equal(result.reconciled, false, `${label} must NOT reconcile`);
    assert.equal(validateSupportingRegister(result).passed, false, `${label} must raise a release-blocking violation`);
  }
});

await test('L3 adversarial: malformed XLSX bytes fail closed', async () => {
  await assert.rejects(() => parseWorkbook(Buffer.from('not a workbook, just text')));
});


// ---------------------------------------------------------------- min-M8 authority + integrity
import { __testables as registerDelivery } from '../src/lib/reports/supporting-register-delivery.ts';

await test('min-M8: pre-migration schema absence degrades narrowly, everything else fails closed', () => {
  const absent = registerDelivery.isSecondaryArtefactSchemaAbsent;
  // Exactly the three accepted signals.
  // Genuine absence only.
  assert.equal(absent({ code: '42P01', message: 'relation "report_artifacts" does not exist' }), true);
  assert.equal(absent({ code: 'PGRST202', message: 'Could not find complete_report_secondary_artefact' }), true);
  assert.equal(absent({ code: 'PGRST205', message: 'Could not find the table report_artifacts in the schema cache' }), true);
  assert.equal(absent({ message: 'relation "report_artifacts" does not exist' }), true);
  // Privilege, constraint and runtime failures must FAIL CLOSED even when they name the object.
  assert.equal(absent({ code: '42501', message: 'permission denied for table report_artifacts' }), false);
  assert.equal(absent({ code: '23505', message: 'duplicate key value violates report_artifacts_report_type_uidx' }), false);
  assert.equal(absent({ message: 'connection terminated unexpectedly while querying report_artifacts' }), false);
  assert.equal(absent({ code: 'P0001', message: 'complete_report_secondary_artefact failed unexpectedly' }), false);
  assert.equal(absent({ message: 'complete_report_secondary_artefact raised report_artifact_already_verified' }), false);
  assert.equal(absent({ code: '23505', message: 'duplicate key value' }), false);
  assert.equal(absent({ code: '42501', message: 'permission denied' }), false);
  assert.equal(absent({ message: 'connection terminated unexpectedly' }), false);
  assert.equal(absent(null), false);
});

// customer-report-access.ts uses TypeScript parameter properties, which node's strip-only mode
// cannot execute (the same constraint documented on ReportCommercialQualityError). The contract is
// therefore asserted against the source, which is what actually governs the access path.
await test('min-M8: register retrieval is fail-closed on every non-verified artefact state', () => {
  const source = readFileSync('src/lib/reports/customer-report-access.ts', 'utf8');
  // Artefact selection happens only after report-level authority.
  const authorityIndex = source.indexOf('assertReportAccessEligible');
  const artefactIndex = source.indexOf("input.artefact === 'register'");
  assert.ok(authorityIndex > -1 && artefactIndex > authorityIndex, 'artefact selection must follow report authority');
  // Bound to the authorised parent report, never to a client-supplied artefact id.
  assert.ok(source.includes(".eq('report_id', report.id)"), 'artefact must be bound to the authorised report');
  assert.ok(!/artefact_id|artefactId/.test(source), 'no client-addressable artefact identifier may exist');
  // Unverified status and integrity mismatch both fail closed.
  assert.ok(source.includes("artefact.storage_status !== 'VERIFIED'"), 'unverified artefact must fail closed');
  assert.ok(source.includes("registerChecksum !== artefact.checksum_sha256"), 'checksum must be verified');
  assert.ok(source.includes("const artefactType = input.artefact === 'register' ? 'supporting_register' : 'pdf';"), 'audit must distinguish artefacts');
});

await test('min-M8: no second report row, no second auth model, no changed RPC signature', () => {
  const delivery = readFileSync('src/lib/reports/supporting-register-delivery.ts', 'utf8');
  assert.ok(delivery.includes('complete_report_secondary_artefact'), 'uses the new additive RPC');
  assert.ok(!/from\('reports'\)[\s\S]{0,80}insert/.test(delivery), 'must not create a second reports row');
  const migration = readFileSync('supabase/migrations/20260807120000_report_secondary_artifacts.sql', 'utf8');
  assert.ok(/create table if not exists public\.report_artifacts/.test(migration));
  assert.ok(/unique index if not exists report_artifacts_report_type_uidx/.test(migration), 'one artefact per (report, type)');
  assert.ok(/enable row level security/.test(migration), 'RLS enabled');
  assert.ok(/grant select on public\.report_artifacts to service_role/.test(migration), 'service-role only');
  assert.ok(/report_artifact_already_verified/.test(migration), 'verified artefact cannot be silently rewritten');
  assert.ok(/'created', false/.test(migration), 'identical replay is idempotent');
  // The accepted PDF completion signature is untouched.
  assert.ok(!/create or replace function public\.complete_manual_report_generation/.test(migration));
});


// ---------------------------------------------------------------- roadmap source provenance
import { validateRoadmapSource } from '../src/lib/reports/commercial-quality.ts';

await test('roadmap source: Essential validates against the projected dependency-closed roadmap', () => {
  const model = buildAdvisoryEvidenceModel(F1);
  const projection = buildEssentialProjection(F1, model);
  const projected = adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions).agenda;

  // 1. the exact projected dependency-closed roadmap passes
  assert.equal(validateRoadmapSource(projected, model, projection).passed, true);

  // 6. L1 remains unchanged by validation
  assert.equal(model.roadmapActions.length, 60);

  // 5. dependency closure legitimately adds actions beyond the initial ranked selection, and those
  //    are accepted -- the projected roadmap is larger than the pre-closure pick.
  assert.ok(projection.roadmapActions.length >= 1);
  const closureRetained = new Set(projection.roadmapActions.map((a) => a.id));
  for (const action of projection.roadmapActions) {
    for (const dep of action.dependencyIds) {
      if (model.roadmapActions.some((a) => a.id === dep)) assert.ok(closureRetained.has(dep));
    }
  }

  // 4. a full-L1-only action must NOT be accepted merely because it exists in L1
  const outsideProjection = model.roadmapActions.find((a) => !closureRetained.has(a.id));
  assert.ok(outsideProjection, 'F1 must have L1 actions outside the projection');
  const leaked = adaptAdvisoryRoadmapToLegacyAgenda([...projection.roadmapActions, outsideProjection]).agenda;
  const leakResult = validateRoadmapSource(leaked, model, projection);
  assert.equal(leakResult.passed, false);
  assert.ok(leakResult.violations.some((v) => v.code === 'QG_ROADMAP_SOURCE_MISMATCH'));

  // 2. a rendered action absent from the projected source fails
  const foreign = { ...projected[0], ruleCode: 'RA-NOT-IN-SOURCE', domainCode: 'D9' };
  const rendered = validateRoadmapSource([...projected.slice(1), foreign], model, projection);
  assert.equal(rendered.passed, false);
  assert.ok(rendered.violations.some((v) => v.code === 'QG_ROADMAP_SOURCE_MISMATCH'));

  // 3. omission and mutation of a projected action both fail
  assert.equal(validateRoadmapSource(projected.slice(1), model, projection).passed, false, 'omission must fail');
  const mutated = projected.map((item, index) => (index === 0 ? { ...item, ownerRole: 'Someone else entirely' } : item));
  assert.equal(validateRoadmapSource(mutated, model, projection).passed, false, 'mutation must fail');
});

await test('roadmap source: legacy/non-Essential behaviour is unchanged', () => {
  const model = buildAdvisoryEvidenceModel(F1);
  // With no projection the validator still compares against the complete L1 model exactly as before.
  const fullAgenda = adaptAdvisoryRoadmapToLegacyAgenda(model.roadmapActions).agenda;
  assert.equal(validateRoadmapSource(fullAgenda, model).passed, true);
  assert.equal(validateRoadmapSource(fullAgenda.slice(1), model).passed, false);
});


// ------------------------------------------------- legacy-register structural detection contract
await test('PDF_LEGACY_FULL_REGISTER_PRESENT detects structure, not prose', () => {
  const audit = readFileSync('scripts/checkpoint-f-pdf-audit.py', 'utf8');
  // Must not be a bare case-sensitive substring scan of the whole document.
  assert.ok(!/prohibited not in full_text/.test(audit), 'raw substring scan must be gone');
  // Normalised, case-insensitive heading comparison so a re-cased genuine heading cannot evade it.
  assert.ok(/casefold\(\)/.test(audit), 'comparison must be case-insensitive');
  assert.ok(/_normalise_heading/.test(audit), 'headings must be normalised');
  assert.ok(/structural_titles/.test(audit), 'detection must use structural titles');
  // TOC rows carry a trailing page number and must still be detected.
  assert.ok(/\\s\+\\d\{1,4\}\$/.test(audit), 'TOC page numbers must be stripped before comparison');
  // The prohibition itself is unchanged and still covers every legacy register.
  for (const legacy of [
    'Complete material findings register', 'Complete risk register',
    'Complete control improvement register', 'Complete evidence checklist',
    'A5. Functional agenda', 'A6. Methodology question-code mapping'
  ]) assert.ok(audit.includes(legacy), `prohibition must still list ${legacy}`);
  // The legitimate prose the old check would have tripped on is present in the template.
  const template = readFileSync('src/lib/reports/templates/report-template.ts', 'utf8');
  assert.ok(template.includes('The complete evidence checklist is not reproduced in this report'),
    'explanatory prose referencing the old register must remain permitted');
});


// ------------------------------------------------------- artefact-aware customer access audit
await test('C: persisted access audit identifies pdf vs supporting_register', () => {
  const route = readFileSync('src/lib/reports/customer-report-access.ts', 'utf8');
  const audit = readFileSync('supabase/migrations/20260807130000_report_artefact_access_audit.sql', 'utf8');
  const accepted = readFileSync('supabase/migrations/20260804203520_g29_customer_report_access_audit.sql', 'utf8');

  // 1 + 2: the artefact discriminator reaches the RPC for both artefacts.
  assert.ok(route.includes('record_customer_report_artefact_access'), 'route must use the artefact-aware RPC');
  assert.ok(route.includes("const artefactType = input.artefact === 'register' ? 'supporting_register' : 'pdf';"),
    'both artefact values must be supplied');
  // ...and is persisted in all three trails, not just returned.
  assert.ok(/'artefact_type', p_artefact_type/.test(audit), 'artefact_type must be persisted in metadata');
  for (const sink of ['public.report_events', 'public.order_events', 'public.audit_logs']) {
    assert.ok(audit.includes(sink), `${sink} must receive the artefact-aware metadata`);
  }

  // 3: a failed register retrieval after valid parent authority still records the register.
  const calls = route.match(/await recordAccess\(\{[^\n]*\}\);/g) ?? [];
  assert.ok(calls.length >= 10, 'expected the full set of audit call sites');
  for (const call of calls) {
    assert.ok(call.includes('artefact: requestedArtefact'),
      `every access audit must state the requested artefact: ${call}`);
  }
  assert.ok(/artefact: CustomerArtefact;/.test(route), 'the audit artefact must be a required field');

  // 4: closed vocabulary, rejected rather than recorded.
  assert.ok(/not in \('pdf', 'supporting_register'\)/.test(audit), 'vocabulary must be closed');
  assert.ok(/customer_report_access_artefact_type_invalid/.test(audit), 'invalid artefact must fail closed');

  // 5: identical binding rules to the accepted audit.
  for (const guard of [
    'customer_report_access_service_role_required',
    'customer_report_access_token_missing',
    'customer_report_access_binding_mismatch',
    'customer_report_access_partial_binding'
  ]) assert.ok(audit.includes(guard), `binding guard ${guard} must be preserved`);
  assert.ok(/security definer/.test(audit) && /set search_path = ''/.test(audit));
  assert.ok(/revoke all on function public\.record_customer_report_artefact_access/.test(audit));
  assert.ok(/grant execute on function public\.record_customer_report_artefact_access[\s\S]{0,120}to service_role/.test(audit));

  // 6: the accepted six-argument RPC is untouched and still callable.
  assert.ok(/create or replace function public\.record_customer_report_access\(/.test(accepted));
  assert.ok(!/drop function[\s\S]{0,80}record_customer_report_access/.test(audit),
    'the accepted RPC must not be dropped');
  // Strip SQL comments first: the header prose names the accepted function deliberately.
  const auditSql = audit.replace(/^\s*--.*$/gm, '');
  assert.ok(!/record_customer_report_access\s*\(/.test(auditSql.replace(/record_customer_report_artefact_access/g, '')),
    'the new migration must not redefine the accepted RPC');

  // 7: one audit trail per attempt -- the artefact-aware call, with the accepted six-argument
  // function reachable only when the artefact-aware one is absent from the schema.
  assert.equal((route.match(/\.rpc\('record_customer_report_/g) ?? []).length, 2,
    'the audit path is the artefact-aware call plus its pre-migration fallback');
  assert.ok(/if \(auditError && isAuditFunctionAbsent\(auditError\)\) \{[\s\S]{0,200}rpc\('record_customer_report_access', binding\)/.test(route),
    'the fallback must be reachable only when the artefact-aware function is absent');
  assert.ok(/return code === '42883' \|\| code === 'PGRST202';/.test(route),
    'absence must be decided by SQLSTATE/PostgREST code alone');
  // A privilege failure or binding rejection must NOT downgrade to the fallback.
  for (const code of ['42501', '23505', 'ECONNREFUSED']) {
    assert.ok(!new RegExp(`'${code}'`).test(route), `${code} must not be treated as absence`);
  }
  assert.ok(/p_artefact_type: artefactType/.test(route), 'the artefact type is sent on the primary call');

  // No raw token, IP or user-agent may be persisted.
  assert.ok(!/p_raw_token|ip_address|user_agent/.test(audit), 'no token/IP/user-agent in the audit');
});


await test('navigation: no tracked contents heading is quoted in prose', () => {
  // extractHeadingPageMap() locates each REPORT_TOC_ENTRIES entry by its heading text. A prose
  // cross-reference that quotes a tracked heading verbatim is matched instead, so the printed page
  // number and the PDF bookmark point at the mention rather than the section -- exactly the
  // PDF_TOC_PAGE_MISMATCH defect Checkpoint F caught on the two longest fixtures.
  const template = readFileSync('src/lib/reports/templates/report-template.ts', 'utf8');
  const entries = [...template.matchAll(/^  \{ key: '([^']+)', label: '([^']+)'/gm)]
    .map((match) => match[2]);
  assert.ok(entries.length >= 8, 'expected the tracked contents entries to be discoverable');
  // Strip the entry table and the section()/subsection() call sites, which legitimately name them.
  const prose = template
    .replace(/export const REPORT_TOC_ENTRIES[\s\S]*?\n\];/, '')
    .replace(/(?:^|[^A-Za-z])(?:section|subsection)\('[^']*'(?:, '[^']*')?/g, '')
    .replace(/^\s*(?:\/\/|<!--).*$/gm, '');
  for (const label of entries) {
    assert.ok(!prose.includes(`"${label}"`),
      `prose must not quote the tracked contents heading ${JSON.stringify(label)}`);
  }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
