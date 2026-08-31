import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(file, needle, label) {
  assert(read(file).includes(needle), `${label}: expected ${file} to include ${needle}`);
}

function assertNotIncludes(file, needle, label) {
  assert(!read(file).includes(needle), `${label}: expected ${file} not to include ${needle}`);
}

function assertSourceOrder(file, firstNeedle, secondNeedle, label) {
  const source = read(file);
  const firstIndex = source.indexOf(firstNeedle);
  const secondIndex = source.indexOf(secondNeedle);
  assert(firstIndex >= 0, `${label}: expected ${file} to include ${firstNeedle}`);
  assert(secondIndex >= 0, `${label}: expected ${file} to include ${secondNeedle}`);
  assert(firstIndex < secondIndex, `${label}: expected ${firstNeedle} before ${secondNeedle} in ${file}`);
}

function assertMatchesSource(source, pattern, label) {
  assert(pattern.test(source), `${label}: expected source to match ${pattern}`);
}

function assertNotMatchesSource(source, pattern, label) {
  assert(!pattern.test(source), `${label}: expected source not to match ${pattern}`);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function loadCommercialInsights() {
  const filePath = path.join(root, 'src/lib/snapshot/commercial-insights.ts');
  const source = read('src/lib/snapshot/commercial-insights.ts');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filePath
  }).outputText;

  const module = { exports: {} };
  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: (id) => { throw new Error(`Unexpected runtime import from commercial-insights.ts: ${id}`); },
    console
  }, { filename: 'commercial-insights.phase13.cjs' });

  assert(typeof module.exports.buildCommercialSnapshotInsights === 'function', 'Commercial insight builder export missing.');
  assert(typeof module.exports.commercialScoreBand === 'function', 'Commercial score-band export missing.');
  assert(typeof module.exports.readinessLabelForScore === 'function', 'Readiness label export missing.');
  return module.exports;
}

const files = {
  builder: 'src/lib/snapshot/commercial-insights.ts',
  snapshot: 'src/components/assessment/SnapshotResult.tsx',
  snapshotCopy: 'src/lib/snapshot/result-copy.ts',
  productChoice: 'src/components/products/ProductChoice.tsx',
  orderJourney: 'src/components/commercial/OrderJourney.tsx',
  snapshotPage: 'src/app/score/snapshot/[assessmentRef]/page.tsx',
  snapshotNarrative: 'src/lib/snapshot/narrative.ts',
  snapshotNarrativeCache: 'src/lib/snapshot/narrative-cache.ts',
  commercialEventRoute: 'src/app/score/api/assessments/[assessmentRef]/commercial-event/route.ts',
  paidOrderRoute: 'src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts',
  reportRequestRoute: 'src/app/score/api/assessments/[assessmentRef]/report-request/route.ts',
  personalisedRoute: 'src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts',
  enquiryTaxonomy: 'src/lib/enquiries/taxonomy.ts',
  advisoryPage: 'src/app/score/advisory/[assessmentRef]/page.tsx',
  advisoryForm: 'src/components/assessment/AdvisoryEnquiryForm.tsx',
  freeSnapshot: 'src/lib/snapshot/free-snapshot.ts',
  migration: 'supabase/migrations/0014_phase13_customer_commercial_conversion.sql',
  advisoryMigration: 'supabase/migrations/20260830170000_mk_advisory_enquiry_path.sql',
  adminShell: 'src/components/admin/AdminShell.tsx',
  adminList: 'src/app/score/admin/enquiries/page.tsx',
  adminDetail: 'src/app/score/admin/enquiries/[requestReference]/page.tsx',
  adminHelper: 'src/lib/admin/personalised-enquiries.ts',
  startForm: 'src/components/assessment/StartAssessmentForm.tsx',
  workflow: '.github/workflows/phase7-verification.yml',
  packageJson: 'package.json'
};

for (const file of Object.values(files)) assert(exists(file), `${file} must exist.`);

const {
  buildCommercialSnapshotInsights,
  commercialScoreBand,
  readinessLabelForScore,
  DOMAIN_CONTENT_BY_CODE
} = loadCommercialInsights();

const approvedCurrentPosition = {
  Reactive: 'Your responses indicate that fraud controls are presently fragmented, largely reactive or dependent on individual intervention. The organisation has limited assurance that fraud risks are being identified and controlled consistently across the operating environment.',
  Developing: 'Your responses indicate that the organisation has established some important fraud-control foundations, but these controls are not yet consistently embedded across the operating environment.',
  Structured: 'The organisation has established a comparatively structured fraud-control environment across several areas. The principal opportunity is now to improve consistency, integration and evidence that these controls operate effectively across the organisation.',
  Strategic: 'The organisation demonstrates comparatively mature fraud-control practices across several areas. Continued assurance will depend on maintaining effective oversight, responding to emerging fraud exposures and preventing stronger controls from creating false comfort around weaker areas.'
};

const approvedRiskImplication = {
  Moderate: 'The organisation’s operating environment creates meaningful fraud exposure. Inconsistent ownership, monitoring or exception handling may therefore allow weaknesses to remain undetected between functions or systems.',
  High: 'The organisation operates with substantial fraud exposure. Existing controls may perform adequately in routine circumstances but become less dependable when fraud activity crosses departments, systems, channels or third parties.'
};

const capPriority = 'Leadership should address the control weakness that triggered the readiness cap before relying on the broader score as evidence of a dependable fraud-control environment.';
const criticalPriority = 'Leadership attention should prioritise the identified critical-control weaknesses and establish clear ownership, remediation dates and evidence of sustained operation.';
const developingPriority = 'Leadership attention should move from individual control activities to a coordinated fraud-readiness programme with clear ownership, measurable oversight and prioritised remediation.';
const structuredPriority = 'Leadership should focus on control consistency, independent assurance and the areas where stronger overall maturity could conceal concentrated weaknesses.';
const noStrengthContext = 'The assessment did not identify a sufficiently mature control area to present as a dependable organisational strength. This does not mean that no controls exist. It means that the evidence supplied does not yet support treating any area as consistently embedded.';

const domainNames = {
  D1: 'Fraud Leadership and Governance',
  D2: 'Fraud Risk Identification',
  D3: 'Operational Fraud Controls',
  D4: 'Fraud Detection Capability',
  D5: 'Fraud Incident Response',
  D6: 'Whistleblowing and Reporting Culture',
  D7: 'Third-Party and Supply Chain Fraud Risk',
  D8: 'Digital and Identity Fraud Risk',
  D9: 'Fraud Culture and Awareness',
  D10: 'Continuous Improvement and Fraud Risk Monitoring'
};

function baseDomains() {
  return Object.entries(domainNames).map(([domainCode, domainName], index) => ({
    domainId: domainCode,
    domainCode,
    domainName,
    weightPct: 10,
    rawScore: 65,
    weightedContribution: 6.5,
    coveragePct: 100,
    criticalGapCount: 0,
    index
  }));
}

function makeSnapshot(overrides = {}) {
  const domainOverrides = overrides.domainOverrides ?? {};
  return {
    assessmentId: 'assessment-phase13',
    assessmentReference: 'MFRS-PH13-TEST',
    organisationName: 'Phase 13 Test Organisation',
    respondentName: 'Phase 13 Respondent',
    respondentEmail: 'phase13@example.test',
    scoreRunId: 'score-run-phase13',
    methodologyVersionId: 'methodology-phase13',
    runNumber: 1,
    overallScore: overrides.overallScore ?? 65,
    calculatedMaturity: overrides.calculatedMaturity ?? 'Structured',
    finalMaturity: overrides.finalMaturity ?? 'Structured',
    exposureScore: overrides.exposureScore ?? 60,
    exposureBand: overrides.exposureBand ?? 'Moderate',
    coveragePct: overrides.coveragePct ?? 100,
    nARatePct: overrides.nARatePct ?? 0,
    criticalGapCount: overrides.criticalGapCount ?? 0,
    majorGapCount: overrides.majorGapCount ?? 0,
    capApplied: overrides.capApplied ?? false,
    capReason: overrides.capReason ?? null,
    scoredAt: '2026-07-11T00:00:00.000Z',
    domains: baseDomains().map((domain) => ({ ...domain, ...(domainOverrides[domain.domainCode] ?? {}) }))
  };
}

assertEqual(Object.keys(DOMAIN_CONTENT_BY_CODE).length, 10, 'Every active domain has controlled commercial content');
for (const code of Object.keys(domainNames)) assert(DOMAIN_CONTENT_BY_CODE[code], `${code} controlled content exists`);
assertEqual(readinessLabelForScore(39.99), 'Immediate attention', 'Below 40 readiness label');
assertEqual(readinessLabelForScore(40), 'Developing', '40 readiness label');
assertEqual(readinessLabelForScore(60), 'Structured', '60 readiness label');
assertEqual(readinessLabelForScore(70), 'Structured', '70 readiness label');
assertEqual(readinessLabelForScore(80), 'Stronger foundation', '80 readiness label');
assertEqual(readinessLabelForScore(null), 'Not scored', 'Null readiness label');
assertEqual(commercialScoreBand(88), 'Strategic', 'Score band remains available for analytics metadata');

const reactiveCritical = buildCommercialSnapshotInsights(makeSnapshot({
  overallScore: 32,
  finalMaturity: 'Reactive',
  exposureBand: 'Severe',
  criticalGapCount: 1,
  majorGapCount: 1,
  domainOverrides: { D1: { rawScore: 22, criticalGapCount: 1 } }
}));
assertEqual(reactiveCritical.currentPosition, approvedCurrentPosition.Reactive, 'Reactive current-position block');
assertEqual(reactiveCritical.leadershipPriority, criticalPriority, 'Critical-gap leadership block');
assertEqual(reactiveCritical.criticalGapIndicator, true, 'Critical gap indicator');
assertEqual(reactiveCritical.priorityAreas[0].domainCode, 'D1', 'Critical domain ranks first');
assertEqual(reactiveCritical.priorityAreas[0].readinessStatus, 'Immediate attention', 'Critical low domain label');

const developingModerate = buildCommercialSnapshotInsights(makeSnapshot({ overallScore: 50, finalMaturity: 'Developing', exposureBand: 'Moderate' }));
assertEqual(developingModerate.currentPosition, approvedCurrentPosition.Developing, 'Developing current-position block');
assertEqual(developingModerate.riskImplication, approvedRiskImplication.Moderate, 'Moderate exposure block');
assertEqual(developingModerate.leadershipPriority, developingPriority, 'Developing leadership block');

const structuredHigh = buildCommercialSnapshotInsights(makeSnapshot({ overallScore: 72, finalMaturity: 'Structured', exposureBand: 'High' }));
assertEqual(structuredHigh.currentPosition, approvedCurrentPosition.Structured, 'Structured current-position block');
assertEqual(structuredHigh.riskImplication, approvedRiskImplication.High, 'High exposure block');
assertEqual(structuredHigh.leadershipPriority, structuredPriority, 'Structured leadership block');

const strategic = buildCommercialSnapshotInsights(makeSnapshot({ overallScore: 88, finalMaturity: 'Strategic', exposureBand: 'Low' }));
assertEqual(strategic.currentPosition, approvedCurrentPosition.Strategic, 'Strategic current-position block for final maturity Strategic');
assertEqual(strategic.scoreBand, 'Strategic', 'Strategic score band is retained');

const strategicCappedToStructured = buildCommercialSnapshotInsights(makeSnapshot({
  overallScore: 88,
  calculatedMaturity: 'Strategic',
  finalMaturity: 'Structured',
  exposureBand: 'Low',
  capApplied: true,
  capReason: 'critical_control_cap'
}));
assertEqual(strategicCappedToStructured.scoreBand, 'Strategic', 'Capped fixture keeps score-derived analytics band');
assertEqual(strategicCappedToStructured.currentPosition, approvedCurrentPosition.Structured, 'Capped fixture uses final-maturity narrative, not score-derived narrative');
assertEqual(strategicCappedToStructured.leadershipPriority, capPriority, 'Triggered-cap leadership block wins before maturity logic');
assertEqual(strategicCappedToStructured.criticalGapIndicator, true, 'Cap triggers critical indicator');

const noStrength = buildCommercialSnapshotInsights(makeSnapshot({ domainOverrides: { D1: { rawScore: 69.99 }, D2: { rawScore: 82, coveragePct: 60 }, D3: { rawScore: 86, criticalGapCount: 1 } } }));
assertEqual(noStrength.strengths.length, 0, 'No qualifying strengths');
assertEqual(noStrength.strengthContext, noStrengthContext, 'Approved no-strength context');

const strengthBoundaryBelow = buildCommercialSnapshotInsights(makeSnapshot({ domainOverrides: { D1: { rawScore: 69.99, coveragePct: 100 } } }));
assert(!strengthBoundaryBelow.strengths.some((item) => item.domainCode === 'D1'), '69.99 raw score does not qualify as a strength');
const strengthBoundaryAt = buildCommercialSnapshotInsights(makeSnapshot({ domainOverrides: { D1: { rawScore: 70, coveragePct: 70 } } }));
assert(strengthBoundaryAt.strengths.some((item) => item.domainCode === 'D1'), '70 raw score with 70 coverage and no critical gap qualifies as a strength');
const strengthCoverageBoundaryBelow = buildCommercialSnapshotInsights(makeSnapshot({ domainOverrides: { D1: { rawScore: 90, coveragePct: 69.99 } } }));
assert(!strengthCoverageBoundaryBelow.strengths.some((item) => item.domainCode === 'D1'), '69.99 coverage does not qualify as a strength');
const strengthCriticalGapExclusion = buildCommercialSnapshotInsights(makeSnapshot({ domainOverrides: { D1: { rawScore: 90, coveragePct: 100, criticalGapCount: 1 } } }));
assert(!strengthCriticalGapExclusion.strengths.some((item) => item.domainCode === 'D1'), 'Critical gap excludes an otherwise strong domain');

const oneStrength = buildCommercialSnapshotInsights(makeSnapshot({ domainOverrides: { D3: { rawScore: 84, coveragePct: 100 } } }));
assertEqual(oneStrength.strengths.length, 1, 'Exactly one qualifying strength');
assertEqual(oneStrength.strengths[0].domainCode, 'D3', 'One strength domain');
assertEqual(oneStrength.strengths[0].readinessStatus, 'Stronger foundation', 'Strength label');

const moreThanTwoStrengths = buildCommercialSnapshotInsights(makeSnapshot({ domainOverrides: { D1: { rawScore: 85 }, D2: { rawScore: 95 }, D3: { rawScore: 90 }, D4: { rawScore: 88 } } }));
assertEqual(moreThanTwoStrengths.strengths.length, 2, 'Strengths are capped at two');
assertDeepEqual(moreThanTwoStrengths.strengths.map((item) => item.domainCode), ['D2', 'D3'], 'Strength ordering by score then stable tie breakers');

const priorityTie = buildCommercialSnapshotInsights(makeSnapshot({ domainOverrides: { D5: { rawScore: 20 }, D6: { rawScore: 20 }, D7: { rawScore: 20 } } }));
assertDeepEqual(priorityTie.priorityAreas.map((item) => item.domainCode), ['D5', 'D6', 'D7'], 'Priority tie breaks by original domain order');

const nAExclusion = buildCommercialSnapshotInsights(makeSnapshot({
  coveragePct: 90,
  nARatePct: 10,
  domainOverrides: { D1: { rawScore: null, coveragePct: 0 }, D2: { rawScore: 35 }, D3: { rawScore: 38 } }
}));
assert(!nAExclusion.priorityAreas.some((item) => item.domainCode === 'D1'), 'N/A domain excluded from priority ranking');
assert(nAExclusion.coverageMessage.includes('Not-applicable responses are excluded from the score'), 'N/A coverage copy explains non-inflation');

const identicalInput = makeSnapshot({ overallScore: 55, exposureBand: 'Moderate', domainOverrides: { D8: { rawScore: 30 } } });
assertDeepEqual(buildCommercialSnapshotInsights(identicalInput), buildCommercialSnapshotInsights(identicalInput), 'Identical input produces identical deterministic output');

assertIncludes(files.builder, 'DOMAIN_CONTENT_BY_CODE', 'Builder uses controlled domain-code map');
assertIncludes(files.builder, '30/60/90-day fraud-readiness roadmap', 'Paid-product comparison source may mention roadmap');
assertIncludes(files.builder, 'commercialMaturityBand(snapshot.finalMaturity)', 'Builder selects executive narrative from persisted final maturity');
assertIncludes(files.builder, 'rawScore ?? 0) >= 70', 'Builder applies approved 70 strength threshold');
assertNotIncludes(files.builder, 'keyword(', 'Builder must not use keyword heuristics');
assertNotIncludes(files.builder, 'Math.random', 'Insight builder must not use randomness');
assertNotIncludes(files.builder, 'Date.now', 'Insight builder must not use current time');
assertNotIncludes(files.builder, 'openai', 'Insight builder must not call AI providers');
assertNotIncludes(files.builder, 'benchmark', 'Insight builder must not expose benchmark content');

assertIncludes(files.snapshotPage, 'buildCommercialSnapshotInsights(snapshot)', 'Snapshot page builds insights server-side');
assertIncludes(files.snapshotPage, 'snapshotUrl = `/score/snapshot/', 'Snapshot URL stays under /score route flow');
assertIncludes(files.snapshotPage, 'encodeURIComponent(token)', 'Snapshot URL preserves private token safely');
assertIncludes(files.snapshotPage, 'commercialInsights={commercialInsights}', 'Snapshot page passes insights into component');
assertIncludes(files.snapshotPage, 'buildCachedSnapshotNarrative', 'Snapshot page reads the validated narrative cache before generating copy');
assertIncludes(files.snapshotNarrative, 'prioritySignals: z.array(shortText(220)).length(2)', 'Snapshot narrative requires exactly two priority signals');
assertIncludes(files.snapshotNarrativeCache, 'free_snapshot_narratives', 'Snapshot narrative cache uses the accepted cache table');
assertIncludes(files.snapshotNarrativeCache, 'onConflict: \'assessment_id,score_run_id,methodology_version,prompt_version\'', 'Snapshot cache is bound to the full accepted identity key');

assertIncludes(files.freeSnapshot, 'respondentEmail: string | null', 'Free snapshot can prepopulate respondent contact context');
assertIncludes(files.freeSnapshot, 'respondentEmail: respondent?.email ?? null', 'Free snapshot loads respondent email from server-side relationship');

assertIncludes(files.snapshot, 'What this means', 'Snapshot leads with the organisation-specific interpretation');
assertIncludes(files.snapshot, 'What needs attention', 'Snapshot shows the attention section');
assertIncludes(files.snapshot, 'Needs attention first', 'Snapshot renders the bounded priority-signal block');
assertIncludes(files.snapshot, 'For leadership', 'Snapshot renders the bounded management implication');
assertIncludes(files.snapshot, 'What this Snapshot covers', 'Snapshot explains the scope of the result');
assertNotIncludes(files.snapshot, 'personalised interpretation is temporarily unavailable', 'Snapshot must not expose an AI-availability failure message');
assertNotIncludes(files.snapshot, 'paidReportValue', 'Snapshot must not render the deterministic paid-detail giveaway');
assertIncludes(files.productChoice, 'Your next step', 'Snapshot exposes the current product-choice section');
assertIncludes(files.productChoice, 'How far do you want to take this?', 'Snapshot exposes the product decision heading');
assertIncludes(files.productChoice, 'COMMERCIAL_CATALOGUE', 'Product choices read the commercial catalogue');
assertIncludes(files.productChoice, 'Choose ${product.label}', 'Essential and Comprehensive use catalogue-backed choices');
assertIncludes(files.productChoice, 'MK Advisory', 'Snapshot exposes the MK Advisory action');
assertIncludes(files.productChoice, "optionCode: 'advisory'", 'Advisory selection is associated with its option code');
assertIncludes(files.productChoice, "post('advisory_selected')", 'Advisory selection emits its current commercial event');
assertIncludes(files.productChoice, '/advisory/', 'Advisory selection uses the readiness-specific route');
assertIncludes(files.productChoice, 'Opening…', 'Product choices provide immediate navigation feedback');
assertNotIncludes(files.productChoice, 'priceCents.advisory', 'Advisory has no public price');
assertIncludes(files.orderJourney, 'StepConfirm', 'Current paid-product flow shows an order summary before order creation');
assertIncludes(files.orderJourney, 'Do you need a tax invoice for this order?', 'Paid-tier flow asks the invoice question before order creation');
assertIncludes(files.orderJourney, 'snapshotToken', 'Current paid-product order remains token-bound');
assertIncludes(files.orderJourney, 'legalName', 'Invoice flow collects legal/company name');
assertIncludes(files.orderJourney, 'billingAddress', 'Invoice flow collects billing address');
assertIncludes(files.orderJourney, 'vatNumber', 'Invoice flow supports an optional VAT number');
assertIncludes(files.orderJourney, 'registrationNumber', 'Invoice flow supports an optional registration number');
assertIncludes(files.orderJourney, 'purchaseOrderReference', 'Invoice flow supports an optional PO/reference');
assertNotIncludes(files.productChoice, 'ComprehensiveRequestPanel', 'Comprehensive selection is not a request-only panel');
assertNotIncludes(files.snapshot, 'personalised interpretation unavailable', 'Snapshot has no customer-visible AI availability message');
assertIncludes(files.snapshot, 'IntersectionObserver', 'Snapshot view events use IntersectionObserver');
assertIncludes(files.snapshot, 'threshold: [0.5]', 'Snapshot observes real section at 50% threshold');
assertIncludes(files.snapshot, 'eventType="executive_summary_viewed"', 'Executive summary view event is emitted at section visibility');
assertIncludes(files.snapshotPage, "eventType: 'snapshot_viewed'", 'Snapshot view event is emitted on private result access');
assertNotIncludes(files.snapshot, "emitCommercialEvent('personalised_report_50000_selected'", 'R50 card selection must not emit high-value event before enquiry persistence');
assertNotIncludes(files.snapshot, 'SnapshotEventBeacon', 'Snapshot no longer uses one-pixel beacons');
assertNotIncludes(files.snapshot, 'Executive Fraud Readiness Advisory', 'Snapshot must not use rejected product name');
assertNotIncludes(files.snapshot, 'This page is intentionally limited', 'Snapshot must not expose implementation boundary copy');
assertNotIncludes(files.snapshot, 'Manual EFT only in V1', 'Snapshot must not expose V1 implementation copy');
assertNotIncludes(files.snapshot, 'No instant download in V1', 'Snapshot must not expose V1 implementation copy');
assertNotIncludes(files.snapshot, 'No automatic report release in V1', 'Snapshot must not expose V1 implementation copy');
assertNotIncludes(files.snapshot, 'benchmarks', 'Snapshot must not mention benchmarks');
assertNotIncludes(files.snapshot, 'Benchmarks', 'Snapshot must not mention Benchmarks');
assertNotIncludes(files.snapshot, 'AI-generated', 'Snapshot must not mention AI-generated content');
assert(!/\bEXP-0[1-8]\b|\bD(?:[1-9]|10)-Q\d{2}\b|hard-gate|N\/A rule/i.test(read(files.snapshot)), 'Snapshot must not expose internal methodology codes or rule labels.');

const snapshotSource = read(files.snapshot);
const productChoiceSource = read(files.productChoice);
assertIncludes(files.productChoice, 'onChoose={() => chooseTier(tier)}', 'Paid selection is a distinct option step');
assertIncludes(files.productChoice, 'router.push(destination)', 'Product selection navigates through the focused route');
assertIncludes(files.productChoice, '/order/new?', 'Paid-tier selection uses the focused order route');
assertNotIncludes(files.productChoice, 'requestDetailedReport', 'Current product choice must not use the superseded generic report-request handler');
assertNotIncludes(files.productChoice, 'selectFullReport', 'Current product choice must not use the superseded R5 selection handler');
assertNotIncludes(files.productChoice, 'selectPersonalisedReport', 'Current product choice must not use the superseded R50 selection handler');
assertIncludes(files.orderJourney, 'onSubmit={() => void submitOrder()}', 'Only the focused order journey submits the current paid-order request');
assertSourceOrder(files.productChoice, 'chooseTier', 'chooseAdvisory', 'Paid-tier and Advisory choices are defined in the same decision area');

assertIncludes(files.advisoryPage, 'validateSnapshotToken', 'Advisory page requires the private Snapshot token');
assertIncludes(files.advisoryPage, 'loadFreeSnapshotByReference', 'Advisory page loads the existing Snapshot context');
assertIncludes(files.advisoryForm, 'Talk to MK about your result', 'Advisory page uses the approved in-flow heading');
assertIncludes(files.advisoryPage, 'token', 'Advisory page keeps the private token in the private navigation path');
assertIncludes(files.advisoryForm, 'primaryReason', 'Advisory form collects an approved primary reason');
assertIncludes(files.advisoryForm, 'areasOfFocus', 'Advisory form collects approved focus areas');
assertIncludes(files.advisoryForm, 'preferredContactMethod', 'Advisory form collects preferred contact method');
assertIncludes(files.advisoryForm, 'preferredConsultationTimeframe', 'Advisory form collects timeframe');
assertIncludes(files.advisoryForm, 'consentContact', 'Advisory form requires explicit contact consent');
assertIncludes(files.advisoryForm, 'Thanks. MK has your request.', 'Advisory form provides in-flow confirmation');
assertNotIncludes(files.advisoryForm, '/paid-order', 'Advisory form cannot create a paid order');
assertNotIncludes(files.advisoryForm, 'snapshot_ai', 'Advisory form cannot invoke Snapshot AI');

assertIncludes(files.paidOrderRoute, 'createPaidOrderForAssessment', 'Current paid-order route uses the commercial order service');
assertIncludes(files.paidOrderRoute, 'isSelfServicePaidTier', 'Current paid-order route accepts only current self-service tiers');
assertIncludes(files.paidOrderRoute, 'validateSnapshotToken', 'Current paid-order route requires the private snapshot token');
assertNotIncludes(files.paidOrderRoute, "if (body?.tier === 'comprehensive')", 'Comprehensive is not blocked by the retired request-only route guard');
assertIncludes(files.paidOrderRoute, 'parseInvoiceRequest', 'Paid-order route validates the closed invoice schema server-side');
assertIncludes(files.paidOrderRoute, 'invoiceRequested: result.invoiceRequested', 'Paid-order response states whether an invoice was requested');
assertIncludes(files.paidOrderRoute, 'createPaidOrderForAssessment', 'Comprehensive uses the normal paid-order service path');
assertIncludes(files.reportRequestRoute, 'parseInvoiceRequest', 'Legacy Essential route uses the same invoice contract');

assertIncludes(files.reportRequestRoute, 'validateSnapshotToken', 'R5 report request route requires snapshot token');
assertNotIncludes(files.reportRequestRoute, 'consentContact', 'R5 report request route must not require consentContact');
assertIncludes(files.reportRequestRoute, 'createOrGetOrderForReportRequest', 'Legacy detailed-report request route retains its separate manual EFT compatibility contract');

assertIncludes(files.commercialEventRoute, 'validateSnapshotToken', 'Commercial event route validates snapshot token');
assertIncludes(files.commercialEventRoute, "'executive_summary_viewed'", 'Commercial event route accepts executive summary view');
assertIncludes(files.commercialEventRoute, "'report_options_opened'", 'Commercial event route accepts report options open');
assertIncludes(files.commercialEventRoute, "'report_option_selected'", 'Commercial event route accepts generic option selected');
assertIncludes(files.commercialEventRoute, "'essential_selected'", 'Commercial event route accepts the Essential selected event');
assertIncludes(files.commercialEventRoute, "'advisory_selected'", 'Commercial event route accepts the Advisory selected event');
assertNotIncludes(files.commercialEventRoute, "'personalised_report_50000_selected'", 'Commercial event route must not accept pre-enquiry R50 specific event');
assertNotIncludes(files.commercialEventRoute, "notificationType: 'report_options_opened'", 'Report options open must not queue internal notification');
assertIncludes(files.commercialEventRoute, "notificationType: selectionTier === 'comprehensive' ? 'comprehensive_selected' : 'essential_selected'", 'Tier selection queues internal notification');
assertNotIncludes(files.commercialEventRoute, "notificationType: 'personalised_report_50000_selected'", 'Commercial event route must not queue R50 notification before data request exists');
assertNotIncludes(files.commercialEventRoute, 'snapshotToken:', 'Commercial event route must not write snapshot token into event metadata');

const personalisedSource = read(files.personalisedRoute);
// Shared with the public Advisory intake, so the constant is asserted at its definition and at
// its use rather than as an inline declaration in the route.
assertIncludes(files.enquiryTaxonomy, "ADVISORY_REQUEST_TYPE = 'mk_advisory'", 'Advisory request type is defined once as mk_advisory');
assertIncludes(files.personalisedRoute, 'request_type: ADVISORY_REQUEST_TYPE', 'Advisory endpoint persists the current controlled request type');
assertIncludes(files.personalisedRoute, 'request_reference: makeRequestReference()', 'R50 endpoint generates public enquiry reference');
assertIncludes(files.personalisedRoute, '.in(\'status\', ACTIVE_STATUSES)', 'R50 endpoint reuses active enquiries');
assertIncludes(files.personalisedRoute, 'validateChoice', 'R50 endpoint validates choices');
assertIncludes(files.personalisedRoute, 'validateFocusAreas', 'R50 endpoint validates focus areas');
assertIncludes(files.personalisedRoute, '{ status: 400 }', 'R50 endpoint rejects invalid enum values with 400');
assertIncludes(files.personalisedRoute, 'At least one approved focus area is required.', 'R50 endpoint requires a focus area');
assertIncludes(files.personalisedRoute, 'selectActiveAdvisoryRequest(db, input.assessment.id)', 'Advisory endpoint recovers duplicate active request races');
assertIncludes(files.personalisedRoute, "eventType: 'advisory_enquiry_submitted'", 'Advisory endpoint tracks one current enquiry event after persistence');
assertEqual(countOccurrences(personalisedSource, "eventType: 'advisory_enquiry_submitted'"), 1, 'Advisory endpoint tracks one specific event per persisted enquiry path');
assertNotIncludes(files.personalisedRoute, "eventType: 'report_option_selected'", 'R50 endpoint does not duplicate generic option analytics after persistence');
assertIncludes(files.personalisedRoute, "notificationType: 'advisory_enquiry_submitted'", 'Advisory endpoint queues the internal notification after persistence');
assertEqual(countOccurrences(personalisedSource, "notificationType: 'advisory_enquiry_submitted'"), 1, 'Advisory endpoint queues one specific notification per persisted enquiry path');
assertIncludes(files.personalisedRoute, 'dataRequestId: result.request.id', 'R50 event and notification are linked to persisted data_request_id');
assertIncludes(files.personalisedRoute, 'request_created: result.created', 'R50 repeat submissions enrich existing event metadata with create/update status');
assertIncludes(files.personalisedRoute, 'payment_obligation: false', 'R50 endpoint records no payment obligation');
assertIncludes(files.personalisedRoute, 'order_created: false', 'R50 endpoint records no order creation');
assertIncludes(files.personalisedRoute, 'report_generation: false', 'R50 endpoint records no report generation');
assertNotIncludes(files.personalisedRoute, 'cleanChoice', 'R50 endpoint must not silently default invalid values');
assertNotIncludes(files.personalisedRoute, 'createOrGetOrderForReportRequest', 'R50 endpoint must not create an order');
assertNotIncludes(files.personalisedRoute, 'renderHtmlToPdfBuffer', 'R50 endpoint must not generate a report');
assertNotIncludes(files.personalisedRoute, 'provider_message_id', 'R50 endpoint must not pretend notification delivery');
assertNotIncludes(files.personalisedRoute, 'metadata: { notes', 'R50 event metadata must not include free-form notes');
assertNotIncludes(files.personalisedRoute, 'metadata: { areasOfFocus', 'R50 event metadata must not include form answers');

assertIncludes(files.advisoryMigration, 'data_requests_active_mk_advisory_uidx', 'Advisory migration adds the active-enquiry uniqueness guard');
assertIncludes(files.advisoryMigration, "request_type = 'mk_advisory'", 'Advisory uniqueness guard is limited to current requests');
assertIncludes(files.advisoryMigration, 'data_requests_advisory_reason_chk', 'Advisory migration constrains the primary reason');
assertIncludes(files.advisoryMigration, 'data_requests_advisory_focus_areas_chk', 'Advisory migration constrains focus areas');
assertIncludes(files.advisoryMigration, 'data_requests_advisory_contact_method_chk', 'Advisory migration constrains contact method');
assertIncludes(files.advisoryMigration, 'data_requests_advisory_timeframe_chk', 'Advisory migration constrains timeframe');
assertIncludes(files.advisoryMigration, 'data_requests_advisory_consent_chk', 'Advisory migration requires contact consent');
assertIncludes(files.advisoryMigration, "'advisory_selected'", 'Advisory migration accepts the current selection event');
assertIncludes(files.advisoryMigration, "'advisory_enquiry_submitted'", 'Advisory migration accepts the current enquiry event');
assertNotIncludes(files.advisoryMigration, 'insert into public.orders', 'Advisory migration cannot create orders');
assertNotIncludes(files.advisoryMigration, 'insert into public.reports', 'Advisory migration cannot create reports');

assertIncludes(files.migration, 'add column if not exists request_reference text', 'Migration adds request reference');
assertIncludes(files.migration, 'data_requests_request_reference_uidx', 'Migration adds unique request reference index');
assertIncludes(files.migration, 'data_requests_active_personalised_report_uidx', 'Migration adds active enquiry uniqueness guard');
assertIncludes(files.migration, 'revoke all on table public.data_requests from anon, authenticated', 'Migration keeps Data API exposure closed');
assertIncludes(files.migration, 'manual_eft_only', 'Migration records manual EFT boundary');
assertIncludes(files.migration, 'R5,000 including VAT', 'Historical migration note records the superseded Essential offer');
assertIncludes(files.migration, 'From R50,000 including VAT', 'Historical migration note records the superseded personalised offer');
assertNotIncludes(files.migration, 'score_runs', 'Migration must not touch score_runs');
assertNotIncludes(files.migration, 'score_domain_results', 'Migration must not touch score_domain_results');
assertNotIncludes(files.migration, 'methodology_versions', 'Migration must not touch methodology versions');
assertNotIncludes(files.migration, 'insert into public.orders', 'Migration must not create orders');
assertNotIncludes(files.migration, 'insert into public.reports', 'Migration must not create reports');

assertIncludes(files.adminShell, 'MK Advisory enquiries', 'Admin nav includes current MK Advisory enquiries');
assertIncludes(files.adminList, 'requireAdmin', 'Admin enquiry list requires admin before read');
assertSourceOrder(files.adminList, 'requireAdmin', 'getAdminPersonalisedEnquiryList', 'Admin list authenticates before service-role read');
assertIncludes(files.adminDetail, 'requireAdmin', 'Admin enquiry detail requires admin before read');
assertSourceOrder(files.adminDetail, 'requireAdmin', 'getAdminPersonalisedEnquiryDetail', 'Admin detail authenticates before service-role read');
assertIncludes(files.adminDetail, 'recordPersonalisedEnquiryOpened', 'Admin detail records audit event when opened');
assertIncludes(files.adminDetail, 'No order, payment obligation or report is created automatically', 'Admin detail preserves R50 boundary');
assertNotIncludes(files.adminDetail, 'Executive Fraud Readiness Advisory', 'Admin detail must not use rejected product name');
assertIncludes(files.adminHelper, 'unstable_noStore', 'Admin enquiry reads are no-store');
assertIncludes(files.adminHelper, "'personalised_enquiry_opened'", 'Admin enquiry opened audit action remains available for historical enquiries');
// The action is now selected across three enquiry types, so the assertion pins the branch that
// matters rather than the whole expression: an Advisory enquiry still audits as Advisory.
assertIncludes(files.adminHelper, 'enquiry.request_type === ADVISORY_REQUEST_TYPE', 'Admin enquiry audit branches on the current Advisory type');
assertIncludes(files.adminHelper, "? 'advisory_enquiry_opened'", 'Admin enquiry audit labels current Advisory requests');
assertIncludes(files.adminHelper, 'LEGACY_PERSONALISED_REQUEST_TYPE', 'Admin enquiry reader retains historical request type compatibility');

assertIncludes(files.startForm, 'authorised to submit this information for the organisation', 'Start consent restored to approved authority confirmation');
assertIncludes(files.startForm, 'benchmarking once sufficient data exists', 'Start research copy restored to approved wording');
assertNotIncludes(files.startForm, 'enough knowledge of the organisation to answer meaningfully', 'Unapproved start-form rewrite must be reverted');
assertNotIncludes(files.startForm, 'does not ask you to upload documents', 'Unapproved start-form privacy block must be reverted');

const packageJson = JSON.parse(read(files.packageJson));
assert(packageJson.scripts?.['phase13:test-conversion'] === 'node scripts/phase13-customer-commercial-conversion-tests.mjs', 'package.json must expose phase13:test-conversion.');
assert(/^[^0-9]*15\./.test(String(packageJson.dependencies?.next ?? '')), 'Phase 13 conversion must keep the patched Next 15.x line.');
assertIncludes(files.workflow, 'npm run phase13:test-conversion', 'V1 workflow runs Phase 13 conversion tests');

const customerSources = [files.snapshot, files.snapshotPage, files.productChoice, files.advisoryPage, files.advisoryForm].map(read).join('\n');
assert(!/PayFast|Stitch|card payment|proof upload|Download report|client portal|respondent dashboard|subscription|peer average|public benchmark|live AI|instant customer download|automated report release/i.test(customerSources), 'Customer-facing Phase 13 snapshot sources must stay inside no-go boundaries.');

console.log('Phase 13 customer commercial conversion tests passed. Controller correction cases, deterministic commercial insight behavior, approved copy, token-scoped events, R5 manual EFT selection, R50 controlled enquiry flow, admin visibility, migration boundaries and no-go boundaries are covered.');
