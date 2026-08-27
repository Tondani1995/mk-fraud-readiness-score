#!/usr/bin/env node
/**
 * Provider-free Essential customer-output residue contract.
 *
 * This script exercises every category in the final customer-output pattern, proves the
 * earliest manuscript boundary rejects raw scenario identifiers, proves the final HTML seam
 * either removes a bounded presentation form or fails closed with a closed-vocabulary code, and
 * runs one accepted narrative fixture through the real HTML and PDF renderer.
 */
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ESSENTIAL_CUSTOMER_RESIDUE,
  ESSENTIAL_CUSTOMER_RESIDUE_RULES,
  EssentialCustomerResidueError,
  normaliseEssentialCustomerHtml
} from '../src/lib/reports/essential-customer-output.ts';
import {
  buildBlueprintMarkdownSkeleton,
  parseBlueprintMarkdown,
  validateBlueprintTextManuscript
} from '../src/lib/reports/narrative/blueprint-text.ts';
import { normaliseProhibitedAssessmentAssurance } from '../src/lib/reports/narrative/assurance-boundary-normalisation.ts';
import { buildCleanAssuranceFixture } from '../src/lib/reports/evidence-model/__fixtures__/decision-fixtures.ts';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../src/lib/reports/essential-projection.ts';
import { selectContent } from '../src/lib/reports/select-content-blocks.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../src/lib/reports/roadmap.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../src/lib/reports/narrative/report-blueprint.ts';
import { renderReportHtml } from '../src/lib/reports/templates/report-template.ts';
import { closeRenderBrowser, renderHtmlToPdfBuffer } from '../src/lib/reports/render-pdf.ts';

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
  || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '');
if (chrome) process.env.PUPPETEER_EXECUTABLE_PATH = chrome;

const minimalBlueprint = {
  chapters: [{
    chapterId: 'RESIDUE-CHAPTER',
    title: 'Residue contract fixture',
    sections: [{
      sectionId: 'RESIDUE-SECTION',
      title: 'Bounded output boundary',
      requiredFacts: [],
      claimRefs: [],
      optionalSubsections: []
    }]
  }]
};

// The fixture supplies only the numeric tokens used by the representative domain/scenario
// references. It is not an analytical report and never leaves this process.
const validationFactPack = { allowedZero: 0, allowedOne: 1, scenarioReference: 'SCENARIO-001' };

const residueCases = [
  {
    code: 'customer_residue_scenario_id',
    category: 'Scenario ID',
    manuscriptText: 'A conditional pathway was labelled SCENARIO-001.',
    html: '<p>A conditional pathway was labelled SCENARIO-001.</p>',
    validation: 'block',
    htmlOutcome: 'reject'
  },
  {
    code: 'customer_residue_domain_id',
    category: 'Parenthesized domain ID',
    manuscriptText: 'The bounded explanation uses (D1) as a domain reference.',
    html: '<p>The bounded explanation uses (D1) as a domain reference.</p>',
    validation: 'pass',
    htmlOutcome: 'clean'
  },
  {
    code: 'customer_residue_control_placeholder',
    category: 'Control placeholder',
    manuscriptText: 'Use (the relevant control) to sequence the response.',
    html: '<p>Use (the relevant control) to sequence the response.</p>',
    validation: 'pass',
    htmlOutcome: 'clean'
  },
  {
    code: 'customer_residue_roadmap_placeholder',
    category: 'Roadmap placeholder',
    manuscriptText: 'Execute the the relevant roadmap action stabilisation item: first.',
    html: '<p>Execute the the relevant roadmap action stabilisation item: first.</p>',
    validation: 'pass',
    htmlOutcome: 'clean'
  },
  {
    code: 'customer_residue_assessed_control_placeholder',
    category: 'Assessed-control placeholder',
    manuscriptText: 'The relevant assessed control remains to be described.',
    html: '<p>The relevant assessed control remains to be described.</p>',
    validation: 'pass',
    htmlOutcome: 'reject'
  },
  {
    code: 'customer_residue_evidence_requirement_placeholder',
    category: 'Evidence-requirement placeholder',
    manuscriptText: 'The relevant evidence requirement remains to be described.',
    html: '<p>The relevant evidence requirement remains to be described.</p>',
    validation: 'pass',
    htmlOutcome: 'reject'
  },
  {
    code: 'customer_residue_roadmap_dependency_id',
    category: 'Roadmap dependency IDs',
    manuscriptText: 'Use authoritative roadmap dependency IDs and escalate threatened prerequisites.',
    html: '<p>Use authoritative roadmap dependency IDs and escalate threatened prerequisites.</p>',
    validation: 'pass',
    htmlOutcome: 'clean'
  },
  {
    code: 'customer_residue_erp',
    category: 'ERP acronym',
    manuscriptText: 'ERP activation should be tracked through the approved process.',
    html: '<p>ERP activation should be tracked through the approved process.</p>',
    validation: 'pass',
    htmlOutcome: 'clean'
  },
  {
    code: 'customer_residue_personal_data_obligations',
    category: 'Personal-data obligations',
    manuscriptText: 'Security and personal-data obligations may be breached if the process is weak.',
    html: '<p>Security and personal-data obligations may be breached if the process is weak.</p>',
    validation: 'pass',
    htmlOutcome: 'clean'
  },
  {
    code: 'customer_residue_majority_unexamined',
    category: 'Unexamined activity claim',
    manuscriptText: 'Manual review cannot cover transaction volume, so without data-driven tests the majority of activity is never examined and structured schemes persist undetected.',
    html: '<p>Manual review cannot cover transaction volume, so without data-driven tests the majority of activity is never examined and structured schemes persist undetected.</p>',
    validation: 'pass',
    htmlOutcome: 'clean'
  },
  {
    code: 'customer_residue_retired_register',
    category: 'Retired supporting-register promise',
    manuscriptText: 'The Essential Supporting Register remains available.',
    html: '<p>The Essential Supporting Register remains available.</p><p>The adjacent customer paragraph remains.</p>',
    validation: 'pass',
    htmlOutcome: 'clean'
  },
  {
    code: 'customer_residue_xlsx',
    category: 'Spreadsheet artifact filename',
    manuscriptText: 'The appendix.xlsx filename must not be emitted.',
    html: '<p>The appendix.xlsx filename must not be emitted.</p>',
    validation: 'pass',
    htmlOutcome: 'reject'
  }
];

assert.deepEqual(
  new Set(residueCases.map((item) => item.code)),
  new Set(ESSENTIAL_CUSTOMER_RESIDUE_RULES.map((item) => item.code)),
  'focused cases must cover every final residue rule exactly once'
);

const parsedFixtureFor = (text) => parseBlueprintMarkdown(
  `# Residue contract fixture\n\n## Bounded output boundary\n\n${text}`,
  minimalBlueprint
);

const matrixResults = [];
for (const residueCase of residueCases) {
  const parsed = parsedFixtureFor(residueCase.manuscriptText);
  assert.equal(parsed.ok, true, `${residueCase.code} fixture must bind structurally`);
  const deterministicReplacements = normaliseProhibitedAssessmentAssurance(parsed);
  const validation = validateBlueprintTextManuscript(parsed, minimalBlueprint, validationFactPack);
  const validationCodes = validation.hardTruth.issues.map((issue) => issue.code);

  if (residueCase.validation === 'block') {
    assert.equal(validation.ok, false, `${residueCase.code} must be blocked at manuscript validation`);
    assert.equal(validationCodes.includes('raw_internal_id'), true, `${residueCase.code} must use the raw internal ID invariant`);
  } else {
    assert.equal(validation.ok, true, `${residueCase.code} representative must not create an unrelated hard-truth failure`);
  }

  assert.equal(ESSENTIAL_CUSTOMER_RESIDUE.test(residueCase.html), true, `${residueCase.code} fixture must exercise the authoritative final residue pattern`);
  let htmlOutcome = 'clean';
  let diagnosticCode = null;
  if (residueCase.htmlOutcome === 'clean') {
    const cleaned = normaliseEssentialCustomerHtml(residueCase.html);
    assert.equal(ESSENTIAL_CUSTOMER_RESIDUE.test(cleaned), false, `${residueCase.code} must not reach the renderer with residue`);
    // A renderer receiving this output is safe: the final contract has already been satisfied.
    const fakePdf = (html) => {
      assert.equal(ESSENTIAL_CUSTOMER_RESIDUE.test(html), false);
      return Buffer.from('%PDF-residue-contract-test');
    };
    assert.match(fakePdf(cleaned).toString(), /^%PDF/);
  } else {
    assert.throws(() => normaliseEssentialCustomerHtml(residueCase.html), (error) => {
      assert.ok(error instanceof EssentialCustomerResidueError);
      assert.equal(error.code, residueCase.code);
      assert.equal(error.message, residueCase.code);
      assert.equal(error.message.includes(residueCase.manuscriptText), false);
      diagnosticCode = error.code;
      return true;
    });
    htmlOutcome = 'fail_closed';
  }

  matrixResults.push({
    code: residueCase.code,
    category: residueCase.category,
    manuscriptValidation: validation.ok ? 'PASS' : 'BLOCK',
    deterministicManuscriptNormalisations: deterministicReplacements,
    finalHtmlOutcome: htmlOutcome,
    diagnosticCode,
    hardTruthCodes: validationCodes
  });
}

// Full provider-free fixture: the manuscript is structurally accepted and contains only the
// presentation forms that the existing bounded customer-output seam removes or rewrites.
const data = structuredClone(buildCleanAssuranceFixture());
data.organisationName = 'Residue Contract Fixture';
data.assessmentReference = 'RESIDUE-CONTRACT-2026';
data.reportReference = 'RPT-RESIDUE-CONTRACT-2026';
const advisoryModel = buildAdvisoryEvidenceModel(data);
const projection = buildEssentialProjection(data, advisoryModel);
const content = selectContent(data, [], projection);
const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions);
const factPack = buildEssentialNarrativeFactPack(data, advisoryModel, projection);
assertNarrativeFactPack(factPack);
const storyPlan = buildNarrativeStoryPlan(factPack);
assertNarrativeStoryPlan(storyPlan, factPack);
const blueprint = buildReportBlueprint(factPack, storyPlan);
const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
const safeResidueByIndex = new Map([
  [1, 'The bounded explanation uses (D1) as a domain reference.'],
  [2, 'Use (the relevant control) to sequence the response.'],
  [3, 'Execute the the relevant roadmap action stabilisation item: first.'],
  [4, 'Use authoritative roadmap dependency IDs and escalate threatened prerequisites.'],
  [5, 'ERP activation should be tracked through the approved process.'],
  [6, 'Security and personal-data obligations may be breached if the process is weak.'],
  [7, 'Manual review cannot cover transaction volume, so without data-driven tests the majority of activity is never examined and structured schemes persist undetected.'],
  [8, 'The Essential Supporting Register remains available.']
]);
const acceptedMarkdown = skeleton.headings.map((heading, index) => {
  const headingLine = `${'#'.repeat(heading.level)} ${heading.title}`;
  if (heading.kind === 'chapter') return headingLine;
  const residue = safeResidueByIndex.get(index) ?? 'This bounded section explains the recorded assessment position and its management implication.';
  return `${headingLine}\n\n${residue}`;
}).join('\n\n');
const acceptedNarrative = parseBlueprintMarkdown(acceptedMarkdown, blueprint);
assert.equal(acceptedNarrative.ok, true, 'accepted render fixture must bind to the deterministic Blueprint');
const acceptedDeterministicReplacements = normaliseProhibitedAssessmentAssurance(acceptedNarrative);
const acceptedValidation = validateBlueprintTextManuscript(acceptedNarrative, blueprint, factPack);
assert.equal(acceptedValidation.ok, true, JSON.stringify(acceptedValidation.hardTruth.issues.map((issue) => issue.code)));

let renderHtml;
let customerHtml;
let pdf;
let renderDirectory;
try {
  renderHtml = renderReportHtml(data, content, roadmap, advisoryModel, undefined, projection, acceptedNarrative);
  customerHtml = normaliseEssentialCustomerHtml(renderHtml);
  assert.equal(ESSENTIAL_CUSTOMER_RESIDUE.test(customerHtml), false, 'final customer HTML must be residue-free');
  pdf = await renderHtmlToPdfBuffer(customerHtml, { footerLabel: data.reportReference });
  assert.ok(Buffer.isBuffer(pdf), 'PDF renderer must return bytes');
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF', 'PDF must have a valid signature');
  assert.ok(pdf.length > 10_000, 'PDF must be non-trivial');
  if (process.env.KEEP_RESIDUE_RENDER === '1') {
    renderDirectory = await mkdtemp(path.join(os.tmpdir(), 'mk-essential-residue-'));
    await writeFile(path.join(renderDirectory, 'residue-contract.pdf'), pdf);
  }
} finally {
  await closeRenderBrowser();
}

console.log(JSON.stringify({
  status: 'PASS',
  providerCalls: 0,
  generateInvocations: 0,
  residueMatrix: matrixResults,
  acceptedFixture: {
    manuscriptValidation: 'PASS',
    deterministicManuscriptNormalisations: acceptedDeterministicReplacements,
    rawHtmlBytes: Buffer.byteLength(renderHtml),
    customerHtmlBytes: Buffer.byteLength(customerHtml),
    finalResidue: false
  },
  pdfRender: {
    status: 'PASS',
    signature: '%PDF',
    bytes: pdf.length,
    outputDirectory: renderDirectory ?? null
  }
}, null, 2));
