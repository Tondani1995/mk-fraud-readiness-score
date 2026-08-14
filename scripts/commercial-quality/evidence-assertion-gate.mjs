#!/usr/bin/env node
/**
 * Evidence-conditioned assertion gate, and mode-presentation completeness.
 *
 * Two pre-AI checks that would each have caught a Pass 2 defect before a single
 * provider call.
 *
 * 1. UNSUPPORTED_POSITIVE_ASSERTION_CONTRACT — no component may be authorised to
 *    describe a strength, foundation, established capability or something worth
 *    preserving unless the assessment supports it. CASE-01 scored 0.00 across
 *    all ten domains and its opening section was still briefed to say the
 *    position was "not a zero-base condition".
 *
 * 2. MODE_PRESENTATION_COMPLETENESS — each narrative mode must carry the
 *    exhibits that make it that mode. A sustainment report without strengths and
 *    watchpoints is a remediation report with its findings removed.
 *
 * Usage:
 *   npm run v11:evidence-assertion-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildReportThesis, buildNarrativeSlotPlan } from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { evidenceSupport } from '../../src/lib/reports/essential/evidence-support.ts';

const DEFAULT_ORDERS = {
  'CASE-01': 'MKORD-2026-B1DN82OG', 'CASE-02': 'MKORD-2026-D1U0CTO8', 'CASE-03': 'MKORD-2026-RHFC6DYH',
  'CASE-04': 'MKORD-2026-HB0OT81P', 'CASE-05': 'MKORD-2026-22FF6B69', 'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-07': 'MKORD-2026-O8E19UPV', 'CASE-08': 'MKORD-2026-RXXUNVD9', 'CASE-09': 'MKORD-2026-1EOLBY7Y',
  'CASE-10': 'MKORD-2026-72BCEIDN', 'CASE-11': 'MKORD-2026-O9DT0QTT'
};

/**
 * Language that asserts a positive capability, and the support each class needs.
 *
 * Meaning, not spelling: every pattern here is a way of telling management that
 * something is already working.
 */
const POSITIVE_ASSERTIONS = [
  { assertion: 'NOT_STARTING_FROM_ZERO', requires: 'FOUNDATION', patterns: [/\bnot a zero-base\b/i, /\bnot starting from zero\b/i, /\bnot start(?:ing)? from scratch\b/i] },
  { assertion: 'FOUNDATION', requires: 'FOUNDATION', patterns: [/\bfoundations?\b/i, /\bbuild on\b/i, /\bplatform to build\b/i, /\bbase to build\b/i] },
  // Ranking language is a relative claim even when the word "strength" is absent.
  { assertion: 'RELATIVE_STRENGTH', requires: 'RELATIVE_STRENGTH', patterns: [/\brelative strength\b/i, /\brelatively strong(?:er)?\b/i, /\bmaterially stronger\b/i, /\bstrongest relevant\b/i, /\bmost developed\b/i, /\bmost exposed\b/i, /\bthe strongest\b/i, /\bthe weakest\b/i, /\bahead of the others?\b/i] },
  { assertion: 'ESTABLISHED_CAPABILITY', requires: 'ESTABLISHED_CAPABILITY', patterns: [/\bestablished capabilit(?:y|ies)\b/i, /\balready working\b/i, /\bmature practice\b/i, /\boperating well\b/i] },
  { assertion: 'PRESERVE', requires: 'PRESERVE', patterns: [/\bpreserve\b/i, /\bsustain the\b/i, /\bmaintain the strong\b/i, /\bprotect what\b/i] }
];

/** Denial markers: the claim is being ruled out, not made. */
const NEGATORS = /\b(?:no|not|never|none|nor|without|absence of|does not|do not|cannot)\b/i;

const orders = process.env.ORDERS
  ? Object.fromEntries(process.env.ORDERS.split(',').map((order, index) => [`CASE-${String(index + 1).padStart(2, '0')}`, order.trim()]))
  : DEFAULT_ORDERS;

/** The exhibits that make each mode what it is. */
const MODE_REQUIREMENTS = {
  REMEDIATION: ['exposures', 'priorities', 'roadmap', 'dashboard', 'diagnosis'],
  MIXED: ['exposures', 'priorities', 'roadmap', 'dashboard', 'diagnosis'],
  SUSTAINMENT: ['strengths', 'watchpoints', 'priorities', 'roadmap', 'dashboard', 'diagnosis']
};

const cases = [];
const violations = [];

for (const [caseId, order] of Object.entries(orders)) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const thesis = buildReportThesis(pack, blueprint);
  const plan = buildNarrativeSlotPlan(pack, blueprint, thesis);
  const model = buildEssentialPresentationModel({ factPack: pack, thesis, blueprint, commentary: {} });
  const support = evidenceSupport(pack.domains);

  // --- 1. Evidence-conditioned assertions, in the instructions and the model ---
  const surfaces = [
    ...plan.slots.flatMap((slot) => [
      { where: `slot ${slot.slotId} purpose`, text: slot.purpose },
      { where: `slot ${slot.slotId} takeaway`, text: slot.requiredManagementTakeaway }
    ]),
    { where: 'executive storyline', text: blueprint.executiveStory },
    { where: 'cover judgement', text: model.cover.centralJudgement },
    { where: 'conclusion', text: model.conclusion }
  ].filter((entry) => typeof entry.text === 'string' && entry.text.trim());

  const asserted = [];
  for (const surface of surfaces) {
    for (const entry of POSITIVE_ASSERTIONS) {
      const pattern = entry.patterns.find((candidate) => candidate.test(surface.text));
      if (!pattern) continue;
      // "does not yet show an established capability" denies the claim rather
      // than making it. Reporting that as an unsupported assertion is the same
      // keyword-without-sense mistake this gate exists to prevent.
      const at = surface.text.search(pattern);
      if (NEGATORS.test(surface.text.slice(0, at >= 0 ? at : surface.text.length))) continue;
      const supported = support.supported[entry.requires] === true;
      asserted.push({ where: surface.where, assertion: entry.assertion, supported });
      if (!supported) {
        violations.push({
          caseId, order, code: 'UNSUPPORTED_POSITIVE_ASSERTION_CONTRACT',
          where: surface.where, assertion: entry.assertion, requires: entry.requires,
          evidence: { foundations: support.foundations.length, spread: support.spread, strongest: support.strongest?.score ?? null },
          text: surface.text.slice(0, 140)
        });
      }
    }
  }

  // --- 2. Mode presentation completeness ---
  const required = MODE_REQUIREMENTS[model.narrativeMode] ?? [];
  const missing = required.filter((key) => {
    const value = model[key];
    if (!value) return true;
    if (Array.isArray(value.rows)) return value.rows.length === 0;
    if (Array.isArray(value.stages)) return value.stages.length === 0;
    if (Array.isArray(value.scenarios)) return value.scenarios.length === 0;
    return false;
  });
  if (missing.length) {
    violations.push({ caseId, order, code: 'MODE_PRESENTATION_COMPLETENESS', mode: model.narrativeMode, missing });
  }

  cases.push({
    caseId, order, mode: model.narrativeMode,
    overallScore: model.readinessScore.score,
    support: { foundations: support.foundations.map((d) => ({ name: d.name, score: d.score })), spread: support.spread, flat: support.flat, supported: support.supported },
    positiveAssertions: asserted,
    modeRequired: required,
    modeMissing: missing
  });
}

const summary = {
  cases: cases.length,
  violations: violations.length,
  unsupportedAssertions: violations.filter((v) => v.code === 'UNSUPPORTED_POSITIVE_ASSERTION_CONTRACT').length,
  modeIncomplete: violations.filter((v) => v.code === 'MODE_PRESENTATION_COMPLETENESS').length,
  byCase: cases.map((entry) => ({
    caseId: entry.caseId, mode: entry.mode, overallScore: entry.overallScore,
    flat: entry.support.flat, spread: entry.support.spread, foundations: entry.support.foundations.length,
    positiveAssertions: entry.positiveAssertions.length,
    unsupported: entry.positiveAssertions.filter((a) => !a.supported).length
  })),
  violationDetail: violations
};

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/essential-pass3-final-certification/preflight';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'evidence-conditioned-assertions.json'), `${JSON.stringify({ summary, cases }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} violation(s).`);
  console.error('A report may not tell management something is working unless the assessment shows it is.');
  process.exit(1);
}
console.log('\nPASS: every positive capability assertion is supported, and every mode carries its exhibits.');
