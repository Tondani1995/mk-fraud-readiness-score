import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Contract tests for two public claims that must never drift from the implementation:
 *
 *   1. Fraud Readiness is described as deterministic at the core, with generative AI confined to
 *      written interpretation downstream of the result.
 *   2. The website does not claim the live instrument comprehensively assesses AI-specific fraud
 *      while `FRAUD_READINESS_AI_COVERAGE.explicitAiQuestions` is false.
 *
 * Both are page claims about code. If the engine, the narrative boundary or the questionnaire
 * changes, this gate fails and the public wording has to be revisited in the same change.
 */

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}: ${error.message}`);
  }
}

const methodology = read('src/lib/website/methodology.ts');
const methodologyComponent = read('src/components/website/MethodologyTrust.tsx');
const scoringEngine = read('src/lib/scoring/scoring-engine.ts');
const maturityBand = read('src/lib/scoring/maturity-band.ts');
const nextStep = read('src/lib/snapshot/next-step-recommendation.ts');
const snapshotNarrative = read('src/lib/snapshot/narrative.ts');
const reportValidation = read('src/lib/reports/narrative/validation.ts');
const aiFraud = read('src/lib/website/ai-fraud.ts');
const aiPage = read('src/app/(website)/ai-fraud-readiness/page.tsx');
const storefront = read('src/components/website/FraudReadiness/FraudReadinessStorefront.tsx');
const capabilities = read('src/lib/website/capabilities.ts');

// --- deterministic core ---------------------------------------------------------------------

check('the scoring engine calls no model and stays a pure calculation', () => {
  assert.doesNotMatch(scoringEngine, /generateText|createGateway|from 'ai'|openai|anthropic/i);
  assert.doesNotMatch(scoringEngine, /Math\.random|Date\.now/);
  assert.match(scoringEngine, /export function calculateFraudReadinessScore/);
});

check('maturity bands come from one thresholds module the engine uses', () => {
  assert.match(maturityBand, /MATURITY_BAND_THRESHOLDS/);
  assert.match(maturityBand, /export function getMaturityBand/);
  assert.match(scoringEngine, /import \{ getMaturityBand \} from '\.\/maturity-band'/);
  // Critical-control caps still exist, which is what "defined maturity logic" claims publicly.
  assert.match(scoringEngine, /maturityCapEvents/);
  assert.match(scoringEngine, /capTo/);
});

check('the next-step recommendation stays a pure rule evaluation over persisted fields', () => {
  assert.doesNotMatch(nextStep, /generateText|createGateway|from 'ai'/);
  assert.match(nextStep, /No model call, no randomisation/);
});

check('the snapshot AI brief excludes numerical diagnostics and falls back deterministically', () => {
  assert.match(snapshotNarrative, /export type SnapshotNarrativeBrief = \{[^}]*\}/s);
  const brief = snapshotNarrative.match(/export type SnapshotNarrativeBrief = \{([^}]*)\}/s)?.[1] ?? '';
  for (const numericField of ['overallScore', 'coveragePct', 'criticalGapCount', 'majorGapCount', 'nARatePct']) {
    assert.doesNotMatch(brief, new RegExp(numericField), `${numericField} must not reach the prose model`);
  }
  assert.match(snapshotNarrative, /buildDeterministicSnapshotNarrativeContent|buildMinimalSafeSnapshotNarrativeContent/);
});

check('report prose cannot introduce a figure that is not in the deterministic fact pack', () => {
  assert.match(reportValidation, /unsupported_numeric_claim/);
});

check('the public methodology statement keeps its two load-bearing sentences', () => {
  assert.match(methodology, /Expert-designed\. Deterministic at the core\./);
  assert.match(methodology, /not decided by generative AI/);
  assert.match(methodologyComponent, /AI does not determine your assessment result/);
  assert.match(methodologyComponent, /operates downstream of the validated assessment logic/);
  // Never claim AI is absent from the platform altogether.
  assert.doesNotMatch(methodology, /no AI is used anywhere|does not use AI at all/i);
});

check('the methodology component is published on the Fraud Readiness and AI pages', () => {
  assert.match(storefront, /<MethodologyTrust \/>/);
  assert.match(aiPage, /<MethodologyTrust tone="dark" \/>/);
});

// --- AI coverage honesty --------------------------------------------------------------------

check('the live instrument has no AI-specific questions, and the flag says so', () => {
  const seeds = ['supabase/migrations/0002_phase4_dev_seed.sql', 'supabase/migrations/0009_methodology_copy_polish.sql'];
  const questionnaire = seeds.map(read).join('\n');
  const aiTerms = /deepfake|voice clon|synthetic identit|generative ai|artificial intelligence/i;
  const seedMentionsAi = aiTerms.test(questionnaire);
  assert.match(aiFraud, /explicitAiQuestions: (true|false)/);
  const flag = /explicitAiQuestions: true/.test(aiFraud);
  assert.equal(
    flag,
    seedMentionsAi,
    'FRAUD_READINESS_AI_COVERAGE.explicitAiQuestions must match what the seeded questionnaire actually asks'
  );
});

check('the AI page states the current scope limit while no AI-specific questions exist', () => {
  if (/explicitAiQuestions: true/.test(aiFraud)) return;
  assert.match(aiPage, /does not yet ask about deepfakes, voice cloning or synthetic identities by\s*\n?\s*name/);
  assert.doesNotMatch(aiPage, /comprehensively (tests|assesses)/i);
});

check('every cited figure on the AI page carries a named public source', () => {
  const sourceIds = [...aiFraud.matchAll(/id: '([a-z0-9-]+)'/g)].map((match) => match[1]);
  const usedIds = [...aiFraud.matchAll(/sourceId: '([a-z0-9-]+)'/g)].map((match) => match[1]);
  assert.ok(usedIds.length >= 4, 'evidence points must be cited');
  for (const id of usedIds) assert.ok(sourceIds.includes(id), `evidence cites unknown source ${id}`);
  for (const publisher of ['INTERPOL', 'ACFE and SAS', 'SABRIC']) assert.match(aiFraud, new RegExp(publisher));
  assert.match(aiPage, /AI_FRAUD_SOURCES\.map/);
});

check('AI-enabled fraud is visible across all four capabilities', () => {
  const aiLanguage = /AI-enabled|synthetic|impersonation|generated/i;
  for (const id of ['assess', 'build', 'enable', 'monitor']) {
    const section = capabilities.split(`id: '${id}'`)[1]?.split('nextStep')[0] ?? '';
    assert.match(section, aiLanguage, `capability ${id} must address AI-enabled fraud`);
  }
  assert.match(capabilities, /AI has changed the fraud threat/);
});

check('the AI page is reachable without a new primary navigation item', () => {
  const navbar = read('src/components/website/Navbar.tsx');
  assert.doesNotMatch(navbar, /ai-fraud-readiness/);
  for (const surface of [
    'src/components/website/Footer.tsx',
    'src/lib/website/capabilities.ts',
    'src/components/website/Home/TriggersSection.tsx',
    'src/app/(website)/insights/page.tsx',
    'src/app/sitemap.ts'
  ]) {
    assert.match(read(surface), /ai-fraud-readiness/, `${surface} must link to the AI page`);
  }
});

check('the AI page carries metadata, canonical and structured data', () => {
  const layout = read('src/app/(website)/ai-fraud-readiness/layout.tsx');
  assert.match(layout, /buildPageMetadata/);
  assert.match(layout, /path: "\/ai-fraud-readiness"/);
  assert.match(layout, /"@type": "Service"/);
  assert.match(layout, /"@type": "FAQPage"/);
});

console.log(failures === 0 ? 'AI fraud and methodology transparency checks passed.' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
