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
