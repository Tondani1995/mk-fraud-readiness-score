#!/usr/bin/env node
/**
 * Comprehensive interpretation gate — zero provider calls.
 *
 * Three things must be true before a single live report is bought:
 *
 *   BRIEF_CONTAINMENT   the provider receives themes and counts, not registers
 *   VALIDATOR_CONTROLS  the validators catch what they claim, and stay silent on
 *                       legitimate prose (every earlier phase lost time to a
 *                       keyword rule that fired on its own denial)
 *   REGISTER_ISOLATION  interpretation text cannot reach the six registers
 *
 * Usage:
 *   npm run v11:comprehensive-interpretation-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../../src/lib/reports/comprehensive/management-model.ts';
import { renderComprehensiveManagementReportHtml } from '../../src/lib/reports/comprehensive/render-comprehensive-html.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';
import {
  buildInterpretationBrief, buildInterpretationPrompt, validateInterpretation,
  INTERPRETATION_CONTRACTS, interpretationToCommentary
} from '../../src/lib/reports/comprehensive/interpretation.ts';

const DEFAULT_ORDERS = {
  'CASE-05': 'MKORD-2026-22FF6B69',
  'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-11': 'MKORD-2026-O9DT0QTT'
};

const orders = process.env.ORDERS
  ? Object.fromEntries(process.env.ORDERS.split(',').map((order, index) => [`CASE-${String(index + 1).padStart(2, '0')}`, order.trim()]))
  : DEFAULT_ORDERS;

const violations = [];
const cases = [];
const add = (caseId, code, detail) => violations.push({ caseId, code, detail });

/**
 * Pad a body to a word count so length rules do not mask the rule under test.
 *
 * The filler must differ per slot. Padding all six fields with one sentence made
 * every fixture genuinely self-repeating, and the duplication rule correctly
 * flagged 45 of them — a broken fixture reading as a broken validator.
 */
const FILLERS = [
  ' Authority over supplier records and authority over payment release currently rest together, and that pairing is what turns an ordinary clerical step into an opportunity.',
  ' Value leaves through a transaction that looks entirely routine on the face of it, which is why volume-based review has not surfaced anything to date.',
  ' Deciding ownership is the prerequisite: tooling layered onto unclear accountability automates the confusion rather than resolving it.',
  ' The programmes reinforce one another because each depends on an authority question the previous one settles, and none of them stands alone.',
  ' Sequencing here is a dependency relationship rather than a preference, since later work cannot be assured without the earlier decisions in place.',
  ' Progress would show as a management team able to demonstrate from its own records who approved what, without reconstructing it afterwards.'
];
const pad = (text, target, seed = 0) => {
  const filler = FILLERS[seed % FILLERS.length];
  let out = text;
  while (out.trim().split(/\s+/).length < target) out += filler;
  return out;
};

/** A complete six-field response built from one body, for single-rule tests. */
const six = (body) => Object.fromEntries(INTERPRETATION_CONTRACTS.map((contract, index) => [
  contract.id,
  // Distinct lead and distinct filler per slot, so only the rule under test fires.
  pad(`${['Position', 'Exposure', 'Response', 'Programmes', 'Sequence', 'Outcome'][index]} note. ${body}`, contract.minWords + 5, index)
]));

for (const [caseId, order] of Object.entries(orders)) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const model = buildComprehensiveManagementModel(assembleComprehensive(evidence));
  const domains = pack.domains.filter((domain) => typeof domain.score === 'number')
    .map((domain) => ({ name: domain.name, score: domain.score, band: getMaturityBand(domain.score) }));
  const brief = buildInterpretationBrief({
    model, organisationName: pack.organisation.name, score: pack.assessment.score,
    maturity: pack.assessment.maturity, domains
  });
  const prompt = buildInterpretationPrompt(brief);

  // ---- BRIEF_CONTAINMENT ---------------------------------------------------
  // The prompt must not carry the registers. Spot-check the actual row text:
  // an evidence artefact, a control specification and an action deliverable.
  const evidenceItems = model.registers.evidence.flatMap((group) => group.items);
  const leaked = [
    ['evidence artefact', evidenceItems.map((row) => row.artefact)],
    ['control design', model.registers.controls.map((row) => row.controlDesign ?? row.controlObjective)],
    ['action deliverable', model.registers.actions.map((row) => row.deliverable)],
    ['finding statement', model.registers.findings.map((row) => row.finding ?? row.observation)]
  ];
  for (const [label, values] of leaked) {
    const present = values.filter((value) => value && String(value).length > 25 && prompt.includes(String(value)));
    if (present.length) add(caseId, 'BRIEF_CONTAINMENT', `${present.length} ${label} row(s) reached the prompt`);
  }
  if (prompt.length > 24_000) add(caseId, 'BRIEF_CONTAINMENT', `prompt is ${prompt.length} chars; the brief is meant to be a summary`);

  // ---- VALIDATOR_CONTROLS --------------------------------------------------
  const expectCode = (label, response, code, slot) => {
    const issues = validateInterpretation(response, brief);
    const hit = issues.some((issue) => issue.code === code && (!slot || issue.slot === slot));
    if (!hit) add(caseId, 'VALIDATOR_CONTROLS', `negative control "${label}" was not caught (expected ${code}); got ${[...new Set(issues.map((i) => i.code))].join(',') || 'nothing'}`);
  };
  expectCode('invented number', six('Roughly 847 supplier payments run through the process each month.'), 'UNSUPPORTED_NUMBER');
  expectCode('assurance claim', six('MK independently validated the payment controls and confirmed they operate effectively.'), 'ASSURANCE_CLAIM');
  expectCode('observation voice', six('We observed that approvals were applied inconsistently across the branches.'), 'CLAIMS_OBSERVATION');
  expectCode('invented cost', six('Implementation will cost approximately R450000 across the first year.'), 'UNSUPPORTED_NUMBER');
  expectCode('filler', six('In today\'s business environment the organisation must respond decisively.'), 'FILLER');
  const contradictBand = ['Reactive', 'Developing', 'Structured', 'Strategic'].find((band) => band !== brief.maturity);
  expectCode('maturity contradiction', six(`The organisation sits in the ${contradictBand} maturity band overall.`), 'MATURITY_CONTRADICTION');
  {
    const short = six('Short.');
    short.executiveInterpretation = 'Too brief to be useful.';
    expectCode('too short', short, 'TOO_SHORT', 'executiveInterpretation');
  }
  {
    const long = six('The position is weak.');
    long.conclusion = pad('The position is weak.', 400);
    expectCode('too long', long, 'TOO_LONG', 'conclusion');
  }
  {
    const duplicated = six('The position requires attention.');
    const sentence = 'Payment authority and supplier maintenance sit with the same people, so a single person can both create a beneficiary and pay it without any second pair of eyes involved anywhere.';
    duplicated.whyThisMatters = pad(`Exposure note. ${sentence}`, 100);
    duplicated.managementImplication = pad(`Response note. ${sentence}`, 100);
    expectCode('duplicated sentence', duplicated, 'DUPLICATE_SENTENCE');
  }
  expectCode('register recitation', six('Detection contains 8 risks, while supplier integrity contains 7 and culture adds 5.'), 'REGISTER_RECITATION');
  expectCode('engine vocabulary', six(`The report is in ${model.narrativeMode} mode for this organisation.`), 'ENGINE_VOCABULARY');
  expectCode('engine construct', six('The bounded section writer derives this from the fact pack.'), 'ENGINE_VOCABULARY');
  // The engine's mode token must not be in the prompt at all.
  for (const token of ['SUSTAINMENT', 'REMEDIATION', 'MIXED', 'narrativeMode']) {
    if (prompt.includes(token)) add(caseId, 'BRIEF_CONTAINMENT', `engine token "${token}" reached the prompt`);
  }
  {
    // Only fires where the canonical label actually exists in this case.
    const abbreviated = { CEO: 'chief executive', CFO: 'chief financial', COO: 'chief operating', CTO: 'chief technology' };
    const pair = Object.entries(abbreviated).find(([, prefix]) => brief.governance.some((entry) => entry.role.toLowerCase().startsWith(prefix)));
    if (pair) expectCode('role label drift', six(`The ${pair[0]} must own this decision outright.`), 'ROLE_LABEL_DRIFT');
  }
  if (model.narrativeMode === 'SUSTAINMENT') {
    expectCode('manufactured weakness', six('This is a critical gap that leaves the organisation exposed.'), 'MANUFACTURED_WEAKNESS');
  }

  // Positive controls. These are the constructions that broke earlier gates:
  // a denial of verification, a control design that uses verification language
  // about the organisation's own process, and a soundness statement.
  const legitimate = {
    executiveInterpretation: pad('The assessed position reflects what management reported rather than anything examined on site. No evidence has been independently verified, and the score should be read as a design-level indication.', 120, 0),
    whyThisMatters: pad('Where supplier bank details can be changed by the same person who releases payment, value leaves the organisation through an ordinary transaction rather than an obvious breach.', 100, 1),
    managementImplication: pad('Management must decide who owns the banking-detail change process before any system work begins, because tooling built on unclear accountability simply automates the confusion.', 100, 2),
    controlProgrammeSynthesis: pad('Good practice requires that bank-detail changes are independently verified by callback to a previously held number; the programmes below assume that design is built, not that it exists today.', 120, 3),
    implementationSynthesis: pad('The first horizon closes the authority questions that every later control depends on, so sequencing is a prerequisite relationship and not a preference.', 100, 4),
    conclusion: pad('Success would mean a management team that can show, from its own records, who approved what and on what basis, without needing to reconstruct it after the fact.', 80, 5)
  };
  const falsePositives = validateInterpretation(legitimate, brief);
  for (const issue of falsePositives) {
    add(caseId, 'VALIDATOR_FALSE_POSITIVE', `${issue.slot} ${issue.code}: ${issue.detail}`);
  }

  // ---- REGISTER_ISOLATION --------------------------------------------------
  // Render twice with entirely different interpretation text. Everything from
  // the register appendices onward must be byte-identical: the AI writes the
  // interpretation slots and nothing else.
  const base = { model, organisationName: pack.organisation.name, assessmentReference: pack.assessment.reference, score: pack.assessment.score, maturity: pack.assessment.maturity, domains: domains.map((domain) => ({ title: domain.name, score: domain.score, band: domain.band })) };
  const marker = 'ZZQX-INTERPRETATION-MARKER';
  const withA = renderComprehensiveManagementReportHtml({ ...base, commentary: interpretationToCommentary(legitimate) });
  const withB = renderComprehensiveManagementReportHtml({ ...base, commentary: interpretationToCommentary(Object.fromEntries(INTERPRETATION_CONTRACTS.map((contract) => [contract.id, `${marker} ${contract.id} replacement body text entirely unlike the other version.`]))) });
  const registersOf = (html) => html.split('<section class="reg">').slice(1).join('<section class="reg">');
  if (registersOf(withA) !== registersOf(withB)) add(caseId, 'REGISTER_ISOLATION', 'register appendices changed when only the interpretation changed');
  if (registersOf(withB).includes(marker)) add(caseId, 'REGISTER_ISOLATION', 'interpretation text reached a register appendix');
  const withNone = renderComprehensiveManagementReportHtml(base);
  if (registersOf(withNone) !== registersOf(withA)) add(caseId, 'REGISTER_ISOLATION', 'registers differ between an AI and a deterministic render');
  const slotCount = (withA.match(/class="interp"/g) ?? []).length;
  if (slotCount !== INTERPRETATION_CONTRACTS.length) add(caseId, 'REGISTER_ISOLATION', `${slotCount} interpretation slots rendered; ${INTERPRETATION_CONTRACTS.length} expected`);
  if ((withNone.match(/class="interp"/g) ?? []).length !== 0) add(caseId, 'REGISTER_ISOLATION', 'a deterministic render emitted an interpretation slot');

  cases.push({
    caseId, mode: model.narrativeMode, promptChars: prompt.length,
    briefKB: Number((JSON.stringify(brief).length / 1024).toFixed(1)),
    registerRowsWithheld: evidenceItems.length + model.registers.controls.length + model.registers.actions.length + model.registers.findings.length,
    slotsRendered: slotCount, falsePositives: falsePositives.length
  });
}

const summary = { cases: cases.length, violations: violations.length, byCase: cases, violationDetail: violations };
const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/comprehensive-c5-interpretation';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'interpretation-gate.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} interpretation-gate violation(s).`);
  process.exit(1);
}
console.log('\nPASS: the brief withholds the registers, the validators discriminate, and interpretation cannot reach a register.');
