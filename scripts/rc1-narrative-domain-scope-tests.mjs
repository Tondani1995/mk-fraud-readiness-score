/**
 * RC1: a domain narrative may cite only its own evidence.
 *
 * The paid certification journey MKORD-2026-D1U0CTO8 failed prepare_narrative with three
 * domain_maturity_contradiction issues on domainNarratives[0..2]. buildDeterministicNarrative was
 * attaching the shared overall-score preamble and every maturity cap event to each domain section,
 * so D1/D2/D3 -- whose own bands differ from the report overall -- read as contradicting themselves,
 * and D2 cited D1's cap rules. These tests pin the scoping rule and the diagnostic mapping.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const root = process.cwd();
const cache = new Map();
function load(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const out = ts.transpileModule(fs.readFileSync(path.join(root, rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const mod = { exports: {} };
  cache.set(rel, mod.exports);
  new Function('require', 'module', 'exports', out)((spec) => {
    if (spec === 'node:crypto') return crypto;
    if (spec.startsWith('.') || spec.startsWith('@/')) {
      const base = spec.startsWith('@/') ? spec.replace('@/', 'src/') : path.join(path.dirname(rel), spec);
      for (const c of [`${base}.ts`, `${base}/index.ts`]) if (fs.existsSync(path.join(root, c))) return load(c);
    }
    return {};
  }, mod, mod.exports);
  cache.set(rel, mod.exports);
  return mod.exports;
}

const content = load('src/lib/reports/automation/content.ts');
const selectBlocks = load('src/lib/reports/select-content-blocks.ts');
const fallbackContent = load('src/lib/reports/fallback-content.ts');
const validation = load('src/lib/reports/automation/validation.ts');
const pipeline = load('src/lib/reports/automation/narrative-pipeline.ts');

// Ten domains. D1/D2/D3 sit in a different band from the report overall, mirroring the real
// journey (overall 30.09 Reactive; D1 33.33, D2 18.97, D3 37.22).
const BANDS = { D1: 'Developing', D2: 'Structured', D3: 'Strategic',
  D4: 'Reactive', D5: 'Reactive', D6: 'Reactive', D7: 'Reactive', D8: 'Reactive', D9: 'Reactive', D10: 'Reactive' };
const CODES = Object.keys(BANDS);

const data = {
  domainResults: CODES.map((c, i) => ({ domainCode: c, domainName: `Domain ${c}`, rawScore: 30 + i, maturityBand: BANDS[c] })),
  criticalMajorGaps: CODES.flatMap((c) => [{ domainCode: c, questionCode: `${c}-Q01`, prompt: `gap ${c}` }]),
  maturityCapEvents: [
    { ruleCode: 'any_hard_gate_critical_control_lte_1', relatedQuestionCode: 'D1-Q01', relatedDomainCode: null },
    { ruleCode: 'any_core_domain_below_40', relatedQuestionCode: null, relatedDomainCode: 'D1' },
    { ruleCode: 'any_core_domain_below_40', relatedQuestionCode: null, relatedDomainCode: 'D2' },
    { ruleCode: 'three_or_more_critical_controls_lte_2', relatedQuestionCode: null, relatedDomainCode: null }
  ]
};
const selected = {
  executiveSummary: { title: 'Executive', body: 'Overall posture is Reactive across the estate.' },
  falseComfort: { title: 'False comfort', body: 'Assurance is thinner than it appears.' },
  leadershipAttention: { body: 'Leadership must sponsor the remediation.' },
  domainNarratives: Object.fromEntries(CODES.map((c) => [`Domain ${c}`,
    { title: `Domain ${c}`, body: `This domain is assessed as ${BANDS[c]} on its own evidence.` }])),
  gapCommentary: Object.fromEntries(CODES.map((c) => [`${c}|${c}-Q01`, { body: `gap commentary ${c}` }]))
};

const evidence = {
  schemaVersion: 1,
  items: [
    ...CODES.map((c) => ({ id: `domain:${c}`, kind: 'domain', domainCode: c, value: { maturityBand: BANDS[c] } })),
    ...CODES.map((c) => ({ id: `gap:${c}-Q01`, kind: 'gap', questionCode: `${c}-Q01`, value: {} })),
    { id: 'score:overall', kind: 'score', value: {} },
    { id: 'score:calculated_maturity', kind: 'score', value: {} },
    { id: 'score:final_maturity', kind: 'score', value: { maturityBand: 'Reactive' } },
    { id: 'score:exposure', kind: 'score', value: {} },
    { id: 'score:exposure_band', kind: 'score', value: {} },
    { id: 'score:coverage', kind: 'score', value: {} },
    { id: 'gaps:critical_count', kind: 'gaps', value: {} },
    { id: 'gaps:major_count', kind: 'gaps', value: {} },
    { id: 'cap:any_hard_gate_critical_control_lte_1:D1-Q01', kind: 'cap', value: {} },
    { id: 'cap:any_core_domain_below_40:D1', kind: 'cap', value: {} },
    { id: 'cap:any_core_domain_below_40:D2', kind: 'cap', value: {} },
    { id: 'cap:three_or_more_critical_controls_lte_2:global', kind: 'cap', value: {} }
  ]
};

let pass = 0; const ok = (n) => { pass += 1; console.log(`  ok - ${n}`); };
const build = () => content.buildDeterministicNarrative(data, selected);

test('N1 pre-fix shape reproduces domain_maturity_contradiction on D1, D2 and D3', () => {
  const n = build();
  // Reconstruct the old behaviour: global preamble on every domain section.
  const core = ['score:overall','score:calculated_maturity','score:final_maturity','score:exposure',
    'score:exposure_band','score:coverage','gaps:critical_count','gaps:major_count'];
  const preFix = { ...n, domainNarratives: n.domainNarratives.map((d) => ({
    ...d,
    body: `${d.body} Overall the organisation is Reactive.`,
    evidenceRefs: [...d.evidenceRefs, ...core]
  })) };
  const r = validation.validatePremiumReportNarrative(preFix, evidence);
  const contradictions = r.issues.filter((i) => i.code === 'domain_maturity_contradiction');
  assert.ok(contradictions.length >= 3, `expected >=3 contradictions, saw ${contradictions.length}`);
  for (const p of ['domainNarratives[0]','domainNarratives[1]','domainNarratives[2]']) {
    assert.ok(contradictions.some((i) => i.path === p), `missing contradiction at ${p}`);
  }
  ok('N1 original D1/D2/D3 contradictions reproduce against pre-fix shape');
});

test('N2 corrected narrative passes grounding validation for all ten domains', () => {
  const r = validation.validatePremiumReportNarrative(build(), evidence);
  assert.equal(r.issues.filter((i) => i.code === 'domain_maturity_contradiction').length, 0);
  assert.equal(r.ok, true, `unexpected issues: ${r.issues.map((i) => i.code).join(',')}`);
  ok('N2 corrected narrative passes for all ten domains');
});

test('N3 every domain narrative cites its own domain anchor', () => {
  for (const d of build().domainNarratives) {
    assert.ok(d.evidenceRefs.includes(`domain:${d.domainCode}`), `${d.domainCode} missing own anchor`);
  }
  ok('N3 each section cites its own domain anchor');
});

test('N4 no domain narrative carries another domain\'s capability references', () => {
  for (const d of build().domainNarratives) {
    for (const ref of d.evidenceRefs.filter((r) => r.startsWith('cap:'))) {
      const target = ref.split(':')[2] ?? '';
      const owner = target.includes('-') ? target.split('-')[0] : target;
      assert.ok(owner === d.domainCode, `${d.domainCode} cites cap owned by ${owner}`);
    }
  }
  ok('N4 no cross-domain capability references');
});

test('N5 no domain narrative restates the overall maturity as its own', () => {
  for (const d of build().domainNarratives) {
    for (const ref of ['score:final_maturity','score:calculated_maturity','score:overall','score:exposure_band']) {
      assert.ok(!d.evidenceRefs.includes(ref), `${d.domainCode} cites global ${ref}`);
    }
  }
  ok('N5 global score refs stay out of domain sections');
});

test('N6 a deliberately contradictory domain narrative still fails', () => {
  const n = build();
  n.domainNarratives[0].body = 'This domain is Strategic and fully embedded.';  // D1 is Developing
  const r = validation.validatePremiumReportNarrative(n, evidence);
  assert.ok(r.issues.some((i) => i.code === 'domain_maturity_contradiction' && i.path === 'domainNarratives[0]'));
  ok('N6 genuine contradiction still fails');
});

test('N7 diagnostics preserve the specific rule code without narrative text', () => {
  const c = pipeline.narrativeGroundingDiagnosticCode('domain_maturity_contradiction');
  assert.equal(c, 'QG_NARRATIVE_DOMAIN_MATURITY_CONTRADICTION');
  assert.match(c, /^[A-Z][A-Z0-9_]{2,63}$/, 'must satisfy the safe-diagnostic code pattern');
  assert.notEqual(c, 'QG_QUALITY_EVALUATION_FAILED');
  assert.equal(pipeline.narrativeGroundingDiagnosticCode('not a code!'), 'QG_NARRATIVE_GROUNDING_FAILED');
  assert.equal(pipeline.narrativeGroundingDiagnosticCode(null), 'QG_NARRATIVE_GROUNDING_FAILED');
  ok('N7 real code preserved, unrecognised input degrades safely');
});

test('N8 validator thresholds and rule set are unchanged', () => {
  const src = fs.readFileSync(path.join(root, 'src/lib/reports/automation/validation.ts'), 'utf8');
  assert.match(src, /mentions\.some\(\(band\) => band\.toLowerCase\(\) !== expectedBand\.toLowerCase\(\)\)/,
    'domain_maturity_contradiction comparison must be unchanged');
  assert.match(src, /issue\('domain_maturity_contradiction'/, 'rule must still exist');
  ok('N8 validator rule and comparison unchanged');
});

process.on('exit', () => console.log(`\nRC1_NARRATIVE_DOMAIN_SCOPE_TESTS: ${pass} checks passed`));


// ---- Report content repair: Reactive content, deterministic selection, metric refs ----

const REACTIVE = { D1: 'Reactive', D2: 'Reactive', D3: 'Reactive', D4: 'Reactive', D5: 'Reactive',
  D6: 'Reactive', D7: 'Reactive', D8: 'Reactive', D9: 'Reactive', D10: 'Reactive' };
const R_CODES = Object.keys(REACTIVE);
const MIG = fs.readFileSync(path.join(root,
  'supabase/migrations/20260803160000_rc1_reactive_domain_content_correction.sql'), 'utf8');
const migBodies = MIG.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

// 18 critical + 11 major, ten domains, overall Reactive -- the live journey's shape.
const rData = {
  scoreRun: { overallScore: 30.09, calculatedMaturity: 'Reactive', finalMaturity: 'Reactive',
    exposureBand: 'High', capApplied: false },
  organisationName: 'Fixture Org',
  domainResults: R_CODES.map((c, i) => ({ domainCode: c, domainName: `Domain ${c}`, rawScore: 20 + i })),
  // 18 critical + 11 major = 29, matching the live journey's gap profile.
  criticalMajorGaps: [
    ...Array.from({ length: 18 }, (_, i) => {
      const c = R_CODES[i % 10];
      return { domainCode: c, domainName: `Domain ${c}`, questionCode: `${c}-QC${i}`,
        isCriticalGap: true, isHardGate: false, prompt: `critical ${i}` };
    }),
    ...Array.from({ length: 11 }, (_, i) => {
      const c = R_CODES[i % 10];
      return { domainCode: c, domainName: `Domain ${c}`, questionCode: `${c}-QM${i}`,
        isCriticalGap: false, isHardGate: false, prompt: `major ${i}` };
    })
  ],
  maturityCapEvents: [{ ruleCode: 'any_core_domain_below_40', relatedQuestionCode: null, relatedDomainCode: 'D1' }]
};

test('R1 no Reactive block in the correction states Structured maturity', () => {
  for (const band of ['Structured', 'Developing', 'Strategic']) {
    assert.ok(!new RegExp(`\\b${band}\\b`, 'i').test(migBodies),
      `Reactive correction must not contain the band word ${band}`);
  }
  ok('R1 corrected Reactive content states no other maturity band');
});

test('R2 D1, D2 and D3 all receive Reactive content', () => {
  for (const key of ['domain_d1_reactive', 'domain_d3_reactive', 'domain_d2_reactive']) {
    assert.ok(MIG.includes(key), `${key} must be addressed by the correction`);
  }
  assert.match(MIG, /maturity_band = 'Reactive'/);
  assert.match(MIG, /'D2',\s*\n\s*'Reactive'/, 'a D2 Reactive block must be inserted');
  ok('R2 D1, D3 corrected and D2 Reactive block added');
});

test('R3 duplicate matching blocks resolve deterministically by block key', () => {
  const dup = [
    { blockKey: 'zz_last', blockType: 'domain_narrative', domainCode: 'D1', maturityBand: 'Reactive',
      title: 'Z', body: 'Z body', status: 'active', severity: null },
    { blockKey: 'aa_first', blockType: 'domain_narrative', domainCode: 'D1', maturityBand: 'Reactive',
      title: 'A', body: 'A body', status: 'active', severity: null }
  ];
  const a = selectBlocks.selectContent(rData, dup);
  const b = selectBlocks.selectContent(rData, [...dup].reverse());
  assert.equal(a.domainNarratives['Domain D1'].title, b.domainNarratives['Domain D1'].title,
    'selection must not depend on row order');
  assert.equal(a.domainNarratives['Domain D1'].title, 'A', 'lowest block key wins');
  ok('R3 duplicate blocks resolve deterministically');
});

test('R4 the generic fallback invents no maturity statement', () => {
  const f = fallbackContent.getDomainFallback('Totally Unknown Domain', 'Reactive');
  const text = `${f.headline} ${f.body}`;
  for (const band of ['Reactive', 'Developing', 'Structured', 'Strategic']) {
    assert.ok(!new RegExp(`\\b${band}\\b`, 'i').test(text), `fallback must not assert ${band}`);
  }
  ok('R4 generic fallback asserts no band');
});

test('R5 gap commentary citing gap counts carries the matching metric evidence', () => {
  const selected = selectBlocks.selectContent(rData, []);
  // Force the metric language the live blocks use.
  for (const k of Object.keys(selected.gapCommentary)) {
    selected.gapCommentary[k] = { body: 'This is a critical gap and a major gap.', usedFallback: true };
  }
  const n = content.buildDeterministicNarrative(rData, selected);
  assert.equal(n.gapCommentary.length, 29, 'fixture must produce 18 critical + 11 major gaps');
  for (const g of n.gapCommentary) {
    assert.ok(g.evidenceRefs.includes('gaps:critical_count'), `${g.questionCode} missing gaps:critical_count`);
    assert.ok(g.evidenceRefs.includes('gaps:major_count'), `${g.questionCode} missing gaps:major_count`);
  }
  ok('R5 metric references restored for every gap commentary');
});

test('R6 every gap commentary retains its own gap and domain grounding', () => {
  const n = content.buildDeterministicNarrative(rData, selectBlocks.selectContent(rData, []));
  for (const g of n.gapCommentary) {
    assert.ok(g.evidenceRefs.includes(`gap:${g.questionCode}`), `${g.questionCode} lost its gap ref`);
    const dom = g.questionCode.split('-')[0];
    assert.ok(g.evidenceRefs.includes(`domain:${dom}`), `${g.questionCode} lost its domain ref`);
  }
  ok('R6 gap and domain grounding retained');
});

test('R7 a section with no metric language gains no metric references', () => {
  const selected = selectBlocks.selectContent(rData, []);
  for (const k of Object.keys(selected.gapCommentary)) {
    selected.gapCommentary[k] = { body: 'Controls here depend on individual diligence.', usedFallback: true };
  }
  const n = content.buildDeterministicNarrative(rData, selected);
  for (const g of n.gapCommentary) {
    assert.ok(!g.evidenceRefs.includes('gaps:critical_count'),
      'references must not be widened beyond what the wording requires');
  }
  ok('R7 references are not widened without a triggering claim');
});

test('R8 unsupported numeric and contradictory claims still fail', () => {
  const n = build();
  n.domainNarratives[0].body = 'This domain is Strategic.';
  const r1 = validation.validatePremiumReportNarrative(n, evidence);
  assert.ok(r1.issues.some((i) => i.code === 'domain_maturity_contradiction'));
  const n2 = build();
  n2.gapCommentary = [{ questionCode: 'D1-Q01', body: 'There are 4 critical gaps.', evidenceRefs: ['gap:D1-Q01', 'domain:D1'] }];
  const r2 = validation.validatePremiumReportNarrative(n2, evidence);
  assert.ok(r2.issues.some((i) => i.code === 'metric_evidence_mismatch'),
    'metric language without its reference must still fail');
  ok('R8 contradictory and unsupported claims still fail');
});

test('R9 validator metric table and thresholds unchanged', () => {
  const src = fs.readFileSync(path.join(root, 'src/lib/reports/automation/validation.ts'), 'utf8');
  assert.match(src, /requiredRefs: \['gaps:critical_count'\]/);
  assert.match(src, /requiredRefs: \['gaps:major_count'\]/);
  assert.match(src, /issue\('metric_evidence_mismatch', `\$\{path\}\.evidenceRefs`/);
  ok('R9 metric rule table and path shape unchanged');
});
