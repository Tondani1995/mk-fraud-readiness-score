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
  snapshot: 'src/components/assessment/FreeSnapshot.tsx',
  snapshotPage: 'src/app/score/snapshot/[assessmentRef]/page.tsx',
  commercialEventRoute: 'src/app/score/api/assessments/[assessmentRef]/commercial-event/route.ts',
  reportRequestRoute: 'src/app/score/api/assessments/[assessmentRef]/report-request/route.ts',
  personalisedRoute: 'src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts',
  freeSnapshot: 'src/lib/snapshot/free-snapshot.ts',
  migration: 'supabase/migrations/0014_phase13_customer_commercial_conversion.sql',
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
    assessmentReference: 'MFRS-PH13-TEST',
    organisationName: 'Phase 13 Test Organisation',
    respondentName: 'Phase 13 Respondent',
    respondentEmail: 'phase13@example.test',
    scoreRunId: 'score-run-phase13',
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

assertIncludes(files.freeSnapshot, 'respondentEmail: string | null', 'Free snapshot can prepopulate respondent contact context');
assertIncludes(files.freeSnapshot, 'respondentEmail: respondent?.email ?? null', 'Free snapshot loads respondent email from server-side relationship');

assertIncludes(files.snapshot, 'Assessment complete', 'Snapshot uses approved result eyebrow');
assertIncludes(files.snapshot, 'Your organisation&apos;s fraud readiness position', 'Snapshot uses approved result heading');
assertIncludes(files.snapshot, 'Your assessment has been scored using the MK Fraud Readiness methodology across ten control domains and your organisation&apos;s fraud-exposure profile.', 'Snapshot uses approved result support copy');
assertIncludes(files.snapshot, '68 controlled questions', 'Snapshot trust strip includes question count');
assertIncludes(files.snapshot, '10 fraud-readiness domains', 'Snapshot trust strip includes domain count');
assertIncludes(files.snapshot, 'Exposure profile included', 'Snapshot trust strip includes exposure profile');
assertIncludes(files.snapshot, 'Deterministic scoring', 'Snapshot trust strip includes deterministic scoring');
assertIncludes(files.snapshot, 'Executive interpretation', 'Snapshot has executive interpretation section');
assertIncludes(files.snapshot, 'Priority areas for management focus', 'Snapshot has approved priority heading');
assertIncludes(files.snapshot, 'Foundations you can build on', 'Snapshot has approved strength heading');
assertIncludes(files.snapshot, 'Your snapshot identifies the position. The detailed report explains what to do next.', 'Snapshot uses approved free-vs-paid heading');
assertIncludes(files.snapshot, 'Full MK Fraud Readiness Report', 'Snapshot shows approved R5 product name');
assertIncludes(files.snapshot, 'R5,000 including VAT', 'Snapshot shows R5 VAT wording');
assertIncludes(files.snapshot, 'Advanced Personalised Fraud Readiness Report', 'Snapshot shows approved personalised product name');
assertIncludes(files.snapshot, 'From R50,000 including VAT', 'Snapshot shows personalised VAT wording');
assertIncludes(files.snapshot, 'Order the full report', 'Snapshot uses approved R5 button');
assertIncludes(files.snapshot, 'Confirm your report order', 'R5 path shows order summary before order creation');
assertIncludes(files.snapshot, 'Continue to EFT instructions', 'R5 order creation is behind EFT continuation');
assertIncludes(files.snapshot, 'Request a personalised proposal', 'Snapshot uses approved personalised button');
assertIncludes(files.snapshot, 'Tell us what your organisation needs', 'Personalised form heading is approved');
assertIncludes(files.snapshot, 'By submitting this request, you consent to MK Fraud Insights contacting you about the personalised fraud-readiness review. Submission does not create a payment obligation or confirm a final scope.', 'R50 consent copy is approved');
assertIncludes(files.snapshot, 'IntersectionObserver', 'Snapshot view events use IntersectionObserver');
assertIncludes(files.snapshot, 'threshold: [0.5]', 'Snapshot observes real section at 50% threshold');
assertIncludes(files.snapshot, 'eventType="executive_summary_viewed"', 'Executive summary view event is emitted at section visibility');
assertIncludes(files.snapshot, 'eventType="report_options_opened"', 'Report options view event is emitted at section visibility');
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
const selectFullReportBlock = snapshotSource.slice(snapshotSource.indexOf('async function selectFullReport'), snapshotSource.indexOf('async function selectPersonalisedReport'));
const selectPersonalisedReportBlock = snapshotSource.slice(snapshotSource.indexOf('async function selectPersonalisedReport'), snapshotSource.indexOf('async function requestDetailedReport'));
assertIncludes(files.snapshot, 'setSelectedOption(COMMERCIAL_OPTION_CODES.fullReport)', 'R5 selection is a distinct option step');
assertNotMatchesSource(selectFullReportBlock, /report-request|requestDetailedReport|createOrGetOrder/i, 'R5 selection must not create an order');
assertMatchesSource(selectFullReportBlock, /full_report_5000_selected/, 'R5 selection emits approved selection event');
assertMatchesSource(selectPersonalisedReportBlock, /report_option_selected/, 'R50 card selection emits only generic option analytics');
assertNotMatchesSource(selectPersonalisedReportBlock, /personalised_report_50000_selected/, 'R50 card selection does not emit specific event or notification');
assertIncludes(files.snapshot, 'onConfirm={requestDetailedReport}', 'Only order-summary confirmation calls the order route');
assertSourceOrder(files.snapshot, 'buttonLabel="Order the full report"', 'onConfirm={requestDetailedReport}', 'R5 option selection appears before order confirmation action');

assertIncludes(files.reportRequestRoute, 'validateSnapshotToken', 'R5 report request route requires snapshot token');
assertNotIncludes(files.reportRequestRoute, 'consentContact', 'R5 report request route must not require consentContact');
assertIncludes(files.reportRequestRoute, 'createOrGetOrderForReportRequest', 'R5 confirmation uses existing order engine');

assertIncludes(files.commercialEventRoute, 'validateSnapshotToken', 'Commercial event route validates snapshot token');
assertIncludes(files.commercialEventRoute, "'executive_summary_viewed'", 'Commercial event route accepts executive summary view');
assertIncludes(files.commercialEventRoute, "'report_options_opened'", 'Commercial event route accepts report options open');
assertIncludes(files.commercialEventRoute, "'report_option_selected'", 'Commercial event route accepts generic option selected');
assertIncludes(files.commercialEventRoute, "'full_report_5000_selected'", 'Commercial event route accepts R5 selected');
assertNotIncludes(files.commercialEventRoute, "'personalised_report_50000_selected'", 'Commercial event route must not accept pre-enquiry R50 specific event');
assertNotIncludes(files.commercialEventRoute, "notificationType: 'report_options_opened'", 'Report options open must not queue internal notification');
assertIncludes(files.commercialEventRoute, "notificationType: 'full_report_5000_selected'", 'R5 selected queues internal notification');
assertNotIncludes(files.commercialEventRoute, "notificationType: 'personalised_report_50000_selected'", 'Commercial event route must not queue R50 notification before data request exists');
assertNotIncludes(files.commercialEventRoute, 'snapshotToken:', 'Commercial event route must not write snapshot token into event metadata');

const personalisedSource = read(files.personalisedRoute);
assertIncludes(files.personalisedRoute, "request_type: 'personalised_report_50000'", 'R50 endpoint persists controlled request type');
assertIncludes(files.personalisedRoute, 'request_reference: makeRequestReference()', 'R50 endpoint generates public enquiry reference');
assertIncludes(files.personalisedRoute, '.in(\'status\', ACTIVE_STATUSES)', 'R50 endpoint reuses active enquiries');
assertIncludes(files.personalisedRoute, 'validateChoice', 'R50 endpoint validates choices');
assertIncludes(files.personalisedRoute, 'validateFocusAreas', 'R50 endpoint validates focus areas');
assertIncludes(files.personalisedRoute, '{ status: 400 }', 'R50 endpoint rejects invalid enum values with 400');
assertIncludes(files.personalisedRoute, 'At least one approved focus area is required.', 'R50 endpoint requires a focus area');
assertIncludes(files.personalisedRoute, 'selectActivePersonalisedRequest(db, input.assessment.id)', 'R50 endpoint recovers duplicate active request races');
assertIncludes(files.personalisedRoute, "eventType: 'personalised_report_50000_selected'", 'R50 endpoint tracks one specific high-value event after persistence');
assertEqual(countOccurrences(personalisedSource, "eventType: 'personalised_report_50000_selected'"), 1, 'R50 endpoint tracks one specific event per persisted enquiry path');
assertNotIncludes(files.personalisedRoute, "eventType: 'report_option_selected'", 'R50 endpoint does not duplicate generic option analytics after persistence');
assertIncludes(files.personalisedRoute, "notificationType: 'personalised_report_50000_selected'", 'R50 endpoint queues high-priority notification after persistence');
assertEqual(countOccurrences(personalisedSource, "notificationType: 'personalised_report_50000_selected'"), 1, 'R50 endpoint queues one specific notification per persisted enquiry path');
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

assertIncludes(files.migration, 'add column if not exists request_reference text', 'Migration adds request reference');
assertIncludes(files.migration, 'data_requests_request_reference_uidx', 'Migration adds unique request reference index');
assertIncludes(files.migration, 'data_requests_active_personalised_report_uidx', 'Migration adds active enquiry uniqueness guard');
assertIncludes(files.migration, 'revoke all on table public.data_requests from anon, authenticated', 'Migration keeps Data API exposure closed');
assertIncludes(files.migration, 'manual_eft_only', 'Migration records manual EFT boundary');
assertIncludes(files.migration, 'R5,000 including VAT', 'Migration note records approved R5 offer');
assertIncludes(files.migration, 'From R50,000 including VAT', 'Migration note records approved personalised offer');
assertNotIncludes(files.migration, 'score_runs', 'Migration must not touch score_runs');
assertNotIncludes(files.migration, 'score_domain_results', 'Migration must not touch score_domain_results');
assertNotIncludes(files.migration, 'methodology_versions', 'Migration must not touch methodology versions');
assertNotIncludes(files.migration, 'insert into public.orders', 'Migration must not create orders');
assertNotIncludes(files.migration, 'insert into public.reports', 'Migration must not create reports');

assertIncludes(files.adminShell, 'Personalised enquiries', 'Admin nav includes personalised enquiries');
assertIncludes(files.adminList, 'requireAdmin', 'Admin enquiry list requires admin before read');
assertSourceOrder(files.adminList, 'requireAdmin', 'getAdminPersonalisedEnquiryList', 'Admin list authenticates before service-role read');
assertIncludes(files.adminDetail, 'requireAdmin', 'Admin enquiry detail requires admin before read');
assertSourceOrder(files.adminDetail, 'requireAdmin', 'getAdminPersonalisedEnquiryDetail', 'Admin detail authenticates before service-role read');
assertIncludes(files.adminDetail, 'recordPersonalisedEnquiryOpened', 'Admin detail records audit event when opened');
assertIncludes(files.adminDetail, 'No order, payment obligation or report is created automatically', 'Admin detail preserves R50 boundary');
assertNotIncludes(files.adminDetail, 'Executive Fraud Readiness Advisory', 'Admin detail must not use rejected product name');
assertIncludes(files.adminHelper, 'unstable_noStore', 'Admin enquiry reads are no-store');
assertIncludes(files.adminHelper, "action: 'personalised_enquiry_opened'", 'Admin enquiry opened audit action exists');

assertIncludes(files.startForm, 'authorised to submit this information for the organisation', 'Start consent restored to approved authority confirmation');
assertIncludes(files.startForm, 'benchmarking once sufficient data exists', 'Start research copy restored to approved wording');
assertNotIncludes(files.startForm, 'enough knowledge of the organisation to answer meaningfully', 'Unapproved start-form rewrite must be reverted');
assertNotIncludes(files.startForm, 'does not ask you to upload documents', 'Unapproved start-form privacy block must be reverted');

const packageJson = JSON.parse(read(files.packageJson));
assert(packageJson.scripts?.['phase13:test-conversion'] === 'node scripts/phase13-customer-commercial-conversion-tests.mjs', 'package.json must expose phase13:test-conversion.');
assert(String(packageJson.dependencies?.next ?? '').startsWith('^14.'), 'Phase 13 conversion must keep Next 14.x.');
assertIncludes(files.workflow, 'npm run phase13:test-conversion', 'V1 workflow runs Phase 13 conversion tests');

const customerSources = [files.snapshot, files.snapshotPage].map(read).join('\n');
assert(!/PayFast|Stitch|card payment|proof upload|Download report|client portal|respondent dashboard|subscription|peer average|public benchmark|live AI|instant customer download|automated report release/i.test(customerSources), 'Customer-facing Phase 13 snapshot sources must stay inside no-go boundaries.');

console.log('Phase 13 customer commercial conversion tests passed. Controller correction cases, deterministic commercial insight behavior, approved copy, token-scoped events, R5 manual EFT selection, R50 controlled enquiry flow, admin visibility, migration boundaries and no-go boundaries are covered.');
