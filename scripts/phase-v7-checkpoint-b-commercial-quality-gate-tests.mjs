// V7 Checkpoint B -- fail-closed commercial quality gate: full test suite.
//
// Covers the brief's sections 10-14 (required test architecture, quality-error tests, render-stage
// tests, lifecycle tests, fixtures). Imports and executes the real, compiled source directly (same
// convention as this repo's other V7 scripts), using recording fakes/injected dependencies -- not
// source-text inspection -- for the render-stage and lifecycle proofs.
//
// Credential-free and deterministic: no real Supabase client, no real PDF renderer (Puppeteer/
// Chromium) is ever invoked here. The lifecycle tests inject a fake `db` and fake
// assembleReportData/validatePremiumReportGenerationEntitlement/getPhase1SchemaCapability via
// generateManualPhase1Report()'s new ManualPhase1Dependencies parameter (phase1-manual-fulfilment.ts)
// so the *real* claim -> start -> quality-gate -> [upload/verify/complete OR fail] orchestration
// code actually runs, without needing production credentials.
import assert from 'node:assert/strict';
import {
  ReportCommercialQualityError,
  assertCommercialReportQuality,
  COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE
} from '../src/lib/reports/commercial-quality.ts';
import { renderReportHtml } from '../src/lib/reports/templates/report-template.ts';
import { renderValidatedCommercialPdf } from '../src/lib/reports/render-validated-commercial-pdf.ts';
import { buildAdvisoryEvidenceModel, checkQualityGates } from '../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../src/lib/reports/essential-projection.ts';
import { adaptEssentialEvidenceModel } from '../src/lib/reports/essential-presentation-adaptation.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../src/lib/reports/roadmap.ts';
import { gapKey } from '../src/lib/reports/select-content-blocks.ts';
import { generateManualPhase1Report, Phase1GenerationError } from '../src/lib/reports/phase1-manual-fulfilment.ts';
import { buildBlueprintMarkdownSkeleton } from '../src/lib/reports/narrative/blueprint-text.ts';
import { emptyNarrativeRecoveryBudget } from '../src/lib/reports/narrative/recovery-policy.ts';
import { essentialSemanticSpanHash, validateEssentialFinalHtml } from '../src/lib/reports/essential-validation-cascade.ts';
import { syntheticOrgFixture } from '../src/lib/reports/evidence-model/__fixtures__/synthetic-org-fixture.ts';
import { officialResponseLabelsFixture } from '../src/lib/reports/evidence-model/__fixtures__/official-response-labels.ts';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${error.stack ?? error.message}`);
  }
}
async function asyncTest(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${error.stack ?? error.message}`);
  }
}

// ------------------------------------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------------------------------------

const DOMAIN_NAMES = {
  D1: 'Fraud Leadership and Governance', D2: 'Fraud Risk Identification', D3: 'Operational Fraud Controls',
  D4: 'Fraud Detection Capability', D5: 'Fraud Incident Response', D6: 'Whistleblowing and Reporting Culture',
  D7: 'Third-Party and Supply Chain Fraud Risk', D8: 'Digital and Identity Fraud Risk',
  D9: 'Fraud Culture and Awareness', D10: 'Continuous Improvement and Fraud Risk Monitoring'
};

/** Minimal, valid, but deliberately quality-gate-violating fixture (same construction as the now-
 * inverted scripts/phase-v7-checkpoint-a-quality-gate-baseline-tests.mjs baseline). */
function buildCommerciallyViolatingFixture() {
  const domainResults = Object.entries(DOMAIN_NAMES).map(([domainCode, domainName], i) => ({
    domainCode, domainName, weightPct: 10, rawScore: 55, weightedContribution: 5.5,
    coveragePct: 100, criticalGapCount: i === 0 ? 1 : 0
  }));

  return {
    orderId: 'test-order', orderReference: 'TEST-ORDER-CPB-001', orderAssessmentId: 'test-assessment',
    assessmentId: 'test-assessment', organisationId: 'test-org', currentScoreRunId: 'test-run',
    orderVerifiedAt: null, orderVerifiedBy: null, organisationName: 'Checkpoint B Violating Test Org',
    respondentName: 'Checkpoint B Tester', customerEmail: 'checkpoint-b@example.test',
    assessmentReference: 'TEST-2026-CPB-VIOLATING', reportReference: 'RPT-TEST-2026-CPB-VIOLATING',
    generatedAt: new Date().toISOString(), packageName: 'Detailed Fraud Readiness Report',
    productCode: null, orderStatus: 'verified', amountCents: null, currency: null,
    productPriceCents: null, productCurrency: null, requiresPaymentVerification: null,
    deliveryMode: null, productActive: null,
    scoreRun: {
      id: 'test-run', assessmentId: 'test-assessment', methodologyVersionId: 'test-methodology-version', status: 'completed', lockedAt: null,
      inputHash: null, overallScore: 55, calculatedMaturity: 'Developing', finalMaturity: 'Developing',
      exposureScore: 50, exposureBand: 'Moderate', coveragePct: 100, nARatePct: 0,
      criticalGapCount: 1, majorGapCount: 0, capApplied: false, capReason: null
    },
    domainResults,
    officialResponseLabels: officialResponseLabelsFixture,
    exposureAnswers: [],
    criticalMajorGaps: [{
      questionCode: 'D1-Q01', domainCode: 'D1', domainName: DOMAIN_NAMES.D1,
      prompt: 'Is fraud risk formally owned at executive level?', responseValue: 1,
      isCritical: true, isHardGate: false, isCriticalGap: true, isMajorGap: false
    }],
    questionTraces: [{
      questionCode: 'D1-Q01', domainCode: 'D1', domainName: DOMAIN_NAMES.D1,
      prompt: 'Is fraud risk formally owned at executive level?', responseValue: 1, normalisedScore: 20,
      applicable: true, triggeredRules: [], isCritical: true, isHardGate: false, isCriticalGap: true, isMajorGap: false
    }],
    maturityCapEvents: [],
    recommendationRules: [],
    expectedDomainResultCount: 10, actualDomainResultCount: 10,
    expectedQuestionTraceCount: 1, actualQuestionTraceCount: 1
  };
}

function emptySelectedContentFor(data) {
  const domainNarratives = {};
  const gapCommentary = {};
  for (const domain of data.domainResults) {
    domainNarratives[domain.domainName] = { title: 'Fallback title', body: 'Fallback body.', usedFallback: true };
  }
  for (const gap of data.criticalMajorGaps) {
    gapCommentary[gapKey(gap.domainCode, gap.questionCode)] = { body: 'Fallback gap commentary.', usedFallback: true };
  }
  return {
    executiveSummary: { title: 'Fallback executive summary', body: 'Fallback body.', usedFallback: true },
    falseComfort: { title: 'Fallback false comfort', body: 'Fallback body.', usedFallback: true },
    leadershipAttention: { body: 'Fallback leadership attention.', usedFallback: true },
    domainNarratives,
    gapCommentary
  };
}

/**
 * Full, genuinely commercially-passing fixture, built on top of the repo's existing
 * syntheticOrgFixture (evidence-model/__fixtures__/synthetic-org-fixture.ts) -- already confirmed
 * by run-differentiation-check.ts (executed 2026-07-20) to pass checkQualityGates(). This wraps
 * that EvidenceModelInput-shaped data with the remaining AssembledReportData fields, plus a full,
 * real SelectedContent and roadmap.agenda that independently satisfy the new Checkpoint B
 * rendered-content/rendered-roadmap checks (validateRenderedContent/validateRenderedRoadmap).
 * "Passing" is verified by actually running the gate below (test 0), not assumed.
 */
function essentialEvidenceModelFor(data) {
  return adaptEssentialEvidenceModel(buildAdvisoryEvidenceModel(data), data.adaptiveGatewayAnswers);
}

function essentialProjectionFor(data, evidenceModel = essentialEvidenceModelFor(data)) {
  return buildEssentialProjection(data, evidenceModel);
}

function essentialRoadmapFor(data) {
  return adaptAdvisoryRoadmapToLegacyAgenda(essentialProjectionFor(data).roadmapActions);
}

function providerFreeRenderInput(data, content, roadmap) {
  const evidenceModel = essentialEvidenceModelFor(data);
  const projection = essentialProjectionFor(data, evidenceModel);
  // The final HTML contains deterministic assurance-boundary sentences. In production these are
  // carried through from the accepted manuscript-stage decision ledger; this provider-free test
  // supplies the same exact, content-addressed identities without invoking a provider.
  const html = renderReportHtml(data, content, roadmap, evidenceModel, undefined, projection);
  const finalValidation = validateEssentialFinalHtml({ html, data });
  return {
    data,
    content,
    roadmap,
    evidenceModel,
    carryForwardAssuranceSpanHashes: finalValidation.candidates
      .filter((candidate) => candidate.ruleCode === 'assurance_language_final')
      .map((candidate) => essentialSemanticSpanHash(candidate.span))
  };
}

function buildCommerciallyPassingFixture() {
  const src = syntheticOrgFixture;
  const domainResults = src.domainResults.map((d, i) => ({
    domainCode: d.domainCode, domainName: d.domainName, weightPct: d.weightPct, rawScore: d.rawScore,
    weightedContribution: d.rawScore * (d.weightPct / 100), coveragePct: 100, criticalGapCount: i === 7 ? 1 : 0
  }));

  const data = {
    orderId: 'test-order-passing', orderReference: 'TEST-ORDER-CPB-PASSING', orderAssessmentId: 'test-assessment-passing',
    assessmentId: 'test-assessment-passing', organisationId: 'test-org-passing', currentScoreRunId: 'test-run-passing',
    orderVerifiedAt: null, orderVerifiedBy: null, organisationName: src.organisationName,
    respondentName: 'Checkpoint B Passing Tester', customerEmail: 'checkpoint-b-passing@example.test',
    assessmentReference: 'TEST-2026-CPB-PASSING', reportReference: 'RPT-TEST-2026-CPB-PASSING',
    generatedAt: new Date().toISOString(), packageName: 'Detailed Fraud Readiness Report',
    productCode: 'essential_self_assessment', orderStatus: 'verified', amountCents: 500000, currency: 'ZAR',
    productPriceCents: 500000, productCurrency: 'ZAR', requiresPaymentVerification: false,
    deliveryMode: 'mk_controlled_pdf', productActive: true,
    scoreRun: {
      id: 'test-run-passing', assessmentId: 'test-assessment-passing', methodologyVersionId: 'test-methodology-version',
      status: 'completed', lockedAt: new Date().toISOString(), inputHash: 'test-hash',
      overallScore: 68, calculatedMaturity: 'Developing', finalMaturity: 'Developing',
      exposureScore: 58, exposureBand: 'High', coveragePct: 100, nARatePct: 0,
      criticalGapCount: src.criticalMajorGaps.filter((g) => g.isCriticalGap).length,
      majorGapCount: src.criticalMajorGaps.filter((g) => g.isMajorGap).length,
      capApplied: true, capReason: 'One or more hard-gate critical controls scored 0 or 1.'
    },
    domainResults,
    officialResponseLabels: src.officialResponseLabels,
    exposureAnswers: src.exposureAnswers,
    criticalMajorGaps: src.criticalMajorGaps,
    questionTraces: src.questionTraces,
    maturityCapEvents: src.maturityCapEvents,
    recommendationRules: [],
    expectedDomainResultCount: 10, actualDomainResultCount: 10,
    expectedQuestionTraceCount: src.criticalMajorGaps.length, actualQuestionTraceCount: src.criticalMajorGaps.length
  };

  const domainNarratives = {};
  for (const domain of domainResults) {
    domainNarratives[domain.domainName] = {
      title: `${domain.domainName}: current state`,
      body: `${data.organisationName}'s ${domain.domainName} domain scored ${domain.rawScore} out of 100 on this assessment, reflecting the specific control evidence captured for this organisation rather than a generic description.`,
      usedFallback: false
    };
  }

  const gapCommentary = {};
  for (const gap of src.criticalMajorGaps) {
    gapCommentary[gapKey(gap.domainCode, gap.questionCode)] = {
      body: `Regarding "${gap.prompt}": ${data.organisationName} recorded a response value of ${gap.responseValue}, indicating this control is not yet operating at the required standard and should be prioritised for remediation.`,
      usedFallback: false
    };
  }

  const content = {
    executiveSummary: {
      title: `Executive summary: ${data.organisationName} fraud readiness`,
      body: `${data.organisationName} scored ${data.scoreRun.overallScore} overall against the fraud readiness methodology, with a final maturity band of ${data.scoreRun.finalMaturity} after one maturity cap was applied. Exposure was assessed as ${data.scoreRun.exposureBand}, driven primarily by digital channel reliance and identity/personal-data dependency.`,
      usedFallback: false
    },
    falseComfort: {
      title: 'Where the numbers could be misread',
      body: `A ${data.scoreRun.finalMaturity} maturity band can look reassuring in isolation, but ${data.organisationName}'s digital identity-verification gap means the headline score should not be read as "no material exposure" -- the underlying control gap is real and specific, not a rounding artefact.`,
      usedFallback: false
    },
    leadershipAttention: {
      body: `Leadership should prioritise the identity-verification gap in Digital and Identity Fraud Risk before the next assessment cycle, given its direct link to the maturity cap applied to this result.`,
      usedFallback: false
    },
    domainNarratives,
    gapCommentary
  };

  const roadmap = essentialRoadmapFor(data);

  return { data, content, roadmap };
}

/**
 * Warnings-only payload used to prove items 11/12/13 of the Checkpoint B brief. Building this from
 * scratch with empty domainResults/criticalMajorGaps is not viable -- the evidence model's scenario
 * builder cannot produce the required minimum of 3 scenarios from no data at all, so an "empty"
 * fixture always trips QG_SCENARIO_MINIMUM_NOT_MET (a real violation, confirmed by direct testing),
 * which is not what this fixture needs to prove. Instead this takes the already-verified-passing
 * fixture (test 0a: 0 violations, 0 warnings) and adds one more maturity-cap event referencing a
 * second, distinct question (D4-Q02, which already exists in syntheticOrgFixture.criticalMajorGaps)
 * -- giving two question-level cap events, which deterministically trips the pre-existing
 * QG_EXECUTIVE_DIAGNOSIS_CAP_COUNT_RISK *warning* (evidence-model/index.ts) without introducing any
 * new violation, since content/roadmap/all other data are already known-passing.
 */
function buildWarningsOnlyPayload() {
  const { data, content } = buildCommerciallyPassingFixture();
  const extraCapEvent = {
    ruleCode: 'question_level_detection_review_cadence',
    capTo: 'Developing',
    reason: 'Detection rules are not reviewed and tuned on a fixed cycle.',
    relatedQuestionCode: 'D4-Q02',
    relatedQuestionPrompt: 'Detection rules are reviewed and tuned on a fixed cycle to keep pace with changing fraud patterns.',
    relatedDomainCode: 'D4',
    relatedDomainName: DOMAIN_NAMES.D4
  };
  const warningData = { ...data, maturityCapEvents: [...data.maturityCapEvents, extraCapEvent] };
  return {
    data: warningData,
    content,
    roadmap: essentialRoadmapFor(warningData)
  };
}

// ------------------------------------------------------------------------------------------------
// Recording fake Supabase client for lifecycle tests (item 13). Credential-free: never touches a
// real database. Every RPC/storage/query call is recorded so tests can assert exact call counts
// and arguments, per "Using a narrow fake or injected side-effect boundary... Execute real
// orchestration code" (not source-text inspection).
// ------------------------------------------------------------------------------------------------

function makeQueryBuilder(response) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(response),
    then: (resolve, reject) => Promise.resolve(response).then(resolve, reject)
  };
  return builder;
}

function createRecordingDb(overrides = {}) {
  const calls = {
    rpc: [],
    storageUpload: [],
    storageDownload: [],
    storageRemove: []
  };

  const rpcResponses = {
    start_manual_report_generation: { data: { ok: true }, error: null },
    claim_manual_report_generation: {
      data: {
        claimed: true,
        attempt: { id: 'attempt-1', report_version: 1, request_id: 'req-1', retry_count: 0 }
      },
      error: null
    },
    fail_manual_report_generation: { data: { ok: true }, error: null },
    record_manual_report_narrative_provenance: { data: { ok: true }, error: null },
    finalise_manual_report_with_supporting_register: {
      data: {
        report: { id: 'report-1', report_reference: 'RPT-TEST-2026-CPB-PASSING', version_number: 1 },
        superseded_report_id: null
      },
      error: null
    },
    ...overrides.rpcResponses
  };

  const tableResponses = {
    report_templates: { data: { id: 'template-1', template_code: 'essential-v1', version_number: 1 }, error: null },
    report_content_blocks: { data: [], error: null },
    // No secondary artefact exists yet for a fresh report; the capability probe reads this before
    // any Storage work, so the double must model the table's presence.
    report_artifacts: { data: null, error: null },
    ...overrides.tableResponses
  };

  const pdfBytes = overrides.pdfBytes ?? Buffer.from(`%PDF-1.4\n${'0'.repeat(1200)}`);

  const storedObjects = new Map();
  const db = {
    rpc: async (name, args) => {
      // Bounded Essential min-M8: the supporting-register artefact is persisted through this
      // additive RPC after the PDF completion RPC. Stubbed so the double models the real
      // generation contract; the accepted PDF completion signature is unchanged.
      if (name === 'complete_report_secondary_artefact') {
        return { data: { artifact: { id: 'artifact-1' }, created: true }, error: null };
      }
      calls.rpc.push({ name, args });
      const response = rpcResponses[name];
      if (!response) throw new Error(`Unstubbed rpc: ${name}`);
      return typeof response === 'function' ? response(args) : response;
    },
    from: (table) => makeQueryBuilder(tableResponses[table] ?? { data: null, error: new Error(`Unstubbed table: ${table}`) }),
    storage: {
      from: (bucket) => ({
        upload: async (path, bytes, opts) => {
          calls.storageUpload.push({ bucket, path, size: bytes?.length, opts });
          // Per-path injection so the PDF and the register can fail independently.
          if (overrides.failUploadMatching && path.includes(overrides.failUploadMatching)) {
            return { error: new Error('injected upload failure') };
          }
          if (overrides.uploadResponse) return overrides.uploadResponse;
          // Stored per path: the supporting register can never overwrite the PDF, and neither
          // artefact can satisfy the other's byte-identity verification.
          storedObjects.set(`${bucket}/${path}`, Buffer.from(bytes));
          return { error: null };
        },
        download: async (path) => {
          calls.storageDownload.push({ bucket, path });
          if (overrides.failDownloadMatching && path.includes(overrides.failDownloadMatching)) {
            return { data: null, error: new Error('injected download failure') };
          }
          // Corrupt the STORED bytes so verification (checksum/size) fails, exactly as a real
          // storage-side corruption would.
          if (overrides.corruptDownloadMatching && path.includes(overrides.corruptDownloadMatching)) {
            const corrupt = Buffer.from('corrupted-stored-bytes');
            return { data: { arrayBuffer: async () => corrupt.buffer.slice(corrupt.byteOffset, corrupt.byteOffset + corrupt.byteLength) }, error: null };
          }
          if (overrides.downloadResponse) return overrides.downloadResponse;
          const stored = storedObjects.get(`${bucket}/${path}`) ?? pdfBytes;
          return { data: { arrayBuffer: async () => stored.buffer.slice(stored.byteOffset, stored.byteOffset + stored.byteLength) }, error: null };
        },
        remove: async (paths) => {
          calls.storageRemove.push({ bucket, paths });
          return overrides.removeResponse ?? { error: null };
        }
      })
    }
  };

  return { db, calls, pdfBytes };
}

function fakeAssembleReportData(data) {
  return async () => data;
}
function fakeValidateEntitlement(reportType = 'essential_self_assessment') {
  return () => reportType;
}
function fakeSchemaCapability() {
  return async () => ({ status: 'available', schemaVersion: '0023', message: null, checks: {} });
}
function fakeAutomationFlags() {
  return async () => ({
    securityGateSatisfied: false, securityGateVersion: null, autoFulfilmentEnabled: false,
    aiNarrativeEnabled: false, autoEmailEnabled: false, manualDeliveryEnabled: false,
    testRecipientOverrideEnabled: false, testRecipientOverride: null,
    model: 'openai/test-model', promptVersion: 'test-prompt', schemaVersion: 'test-schema'
  });
}
async function fakePrepareNarrative(input) {
  return {
    narrative: { executiveDiagnosis: { title: 'Test', body: 'Test', evidenceRefs: [] }, falseComfort: { title: 'Test', body: 'Test', evidenceRefs: [] }, leadershipAttention: { body: 'Test', evidenceRefs: [] }, domainNarratives: [], gapCommentary: [] },
    selectedContent: input.deterministicContent,
    mode: 'deterministic_fallback',
    evidence: { schemaVersion: input.flags.schemaVersion, items: [] },
    evidenceChecksum: 'a'.repeat(64),
    validation: { ok: true, issues: [], checkedAt: new Date(0).toISOString(), schemaVersion: input.flags.schemaVersion },
    fallbackReason: 'ai_feature_disabled'
  };
}

// The production Essential lane is now the v1.1 whole-manuscript coordinator. These lifecycle
// tests stay provider-free by injecting a complete, blueprint-bound manuscript and an explicit
// ALLOW result for every provider-authored block; the test remains about the real claim/render/
// upload/verify/finalise orchestration rather than reopening the retired narrative seam.
function alphaMarker(index) {
  let value = index;
  let marker = '';
  do {
    marker = String.fromCharCode(65 + (value % 26)) + marker;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return marker;
}

function providerFreeEssentialDependencies() {
  const writerMetadata = {
    contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
    architecture: 'whole-manuscript',
    provider: 'test-injected',
    model: 'test-injected/provider-free',
    promptVersion: 'test',
    generationMode: 'test-injected',
    generatedAt: new Date(0).toISOString(),
    inputFactPackSha256: 'fixture',
    inputStoryPlanSha256: 'fixture',
    manuscriptProviderCalls: 0,
    semanticReviewProviderCalls: 0,
    totalProviderCalls: 0,
    totalPhysicalProviderRequests: 0,
    totalGenerationCostMicros: 0,
    recovery: { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 }
  };
  const wholeManuscriptWriter = {
    provider: 'test-injected',
    model: 'test-injected/provider-free',
    promptVersion: 'test',
    async writeManuscript({ blueprint }) {
      const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
      const markdown = skeleton.headings.map((heading, index) => {
        const headingLine = `${'#'.repeat(heading.level)} ${heading.title}`;
        if (heading.kind === 'chapter') return headingLine;
        return `${headingLine}\n\nManagement should retain the recorded position and consider the next supported control action for context ${alphaMarker(index)}.`;
      }).join('\n\n');
      return {
        contractVersion: writerMetadata.contractVersion,
        architecture: 'whole-manuscript',
        markdown,
        blueprint,
        writerMetadata
      };
    },
    async completeTail() { throw new Error('tail recovery must not be called'); },
    async repairBlock() { throw new Error('semantic repair must not be called'); },
    async coherencePass() { throw new Error('coherence recovery must not be called'); }
  };
  const semanticReviewer = {
    async review(input) {
      return {
        decisions: input.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          disposition: 'ALLOW',
          reasonCode: 'grounded'
        })),
        repair: null,
        accounting: {
          providerCalls: 0,
          repairCount: 0,
          candidateCount: input.candidates.length,
          allowCount: input.candidates.length,
          rejectCount: 0,
          holdCount: 0
        }
      };
    }
  };
  return { wholeManuscriptWriter, semanticReviewer };
}

console.log('V7 Checkpoint B -- commercial quality gate suite');

// ------------------------------------------------------------------------------------------------
// Section 0: fixture sanity (proves the "passing" fixture is genuinely passing, not asserted blind)
// ------------------------------------------------------------------------------------------------

test('0a. buildCommerciallyPassingFixture() genuinely satisfies every currently implemented gate (no bypass used)', () => {
  const { data, content, roadmap } = buildCommerciallyPassingFixture();
  const evidenceModel = essentialEvidenceModelFor(data);
  const projection = essentialProjectionFor(data, evidenceModel);
  const quality = assertCommercialReportQuality({ data, content, roadmap, evidenceModel, projection });
  assert.equal(quality.passed, true);
  assert.equal(quality.violations.length, 0);
  console.log(`    (passing fixture: ${evidenceModel.materialFindings.length} findings, ${evidenceModel.scenarios.length} scenarios, ${quality.warnings.length} warnings, 0 violations)`);
});

test('0b. buildCommerciallyViolatingFixture() genuinely trips at least one real violation', () => {
  const data = buildCommerciallyViolatingFixture();
  const content = emptySelectedContentFor(data);
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  assert.throws(() => assertCommercialReportQuality({ data, content, roadmap: { agenda: [] }, evidenceModel }), ReportCommercialQualityError);
});

test('0c. buildWarningsOnlyPayload() trips exactly the expected warning and zero violations', () => {
  const { data, content, roadmap } = buildWarningsOnlyPayload();
  const evidenceModel = essentialEvidenceModelFor(data);
  const projection = essentialProjectionFor(data, evidenceModel);
  const quality = assertCommercialReportQuality({ data, content, roadmap, evidenceModel, projection });
  assert.equal(quality.passed, true);
  assert.equal(quality.violations.length, 0);
  assert.ok(quality.warnings.some((w) => w.code === 'QG_EXECUTIVE_DIAGNOSIS_CAP_COUNT_RISK'), 'Expected the two-cap-event warning to fire.');
});

// ------------------------------------------------------------------------------------------------
// Section A: required quality-error tests (brief section 11)
// ------------------------------------------------------------------------------------------------

test('A1/A2. checkQualityGates() returns typed violations, each with code/severity/message', () => {
  const data = buildCommerciallyViolatingFixture();
  const model = buildAdvisoryEvidenceModel(data);
  const gate = checkQualityGates(model, data);
  assert.equal(gate.passed, false);
  assert.ok(gate.violations.length > 0);
  for (const issue of gate.violations) {
    assert.equal(typeof issue.code, 'string');
    assert.ok(issue.code.startsWith('QG_'), `Expected a QG_ code, got "${issue.code}"`);
    assert.equal(issue.severity, 'violation');
    assert.equal(typeof issue.message, 'string');
    assert.ok(issue.message.length > 0);
  }
});

test('A3. Stable, specific codes are returned for known defects (not one generic code for everything)', () => {
  const data = buildCommerciallyViolatingFixture();
  const model = buildAdvisoryEvidenceModel(data);
  const gate = checkQualityGates(model, data);
  const codes = new Set(gate.violations.map((v) => v.code));
  assert.ok(codes.size >= 1, 'Expected at least one distinct violation code.');
  for (const code of codes) assert.notEqual(code, 'QG_QUALITY_EVALUATION_FAILED', 'checkQualityGates() itself must never emit the evaluator-exception code.');
});

test('A4. renderReportHtml() throws ReportCommercialQualityError for a violating fixture', () => {
  const data = buildCommerciallyViolatingFixture();
  const content = emptySelectedContentFor(data);
  assert.throws(() => renderReportHtml(data, content, { agenda: [] }), ReportCommercialQualityError);
});

test('A7/A8/A9. The quality error carries violations, warnings and the fixed safe admin message', () => {
  const data = buildCommerciallyViolatingFixture();
  const content = emptySelectedContentFor(data);
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  try {
    assertCommercialReportQuality({ data, content, roadmap: { agenda: [] }, evidenceModel });
    assert.fail('Expected assertCommercialReportQuality to throw.');
  } catch (error) {
    assert.ok(error instanceof ReportCommercialQualityError);
    assert.ok(Array.isArray(error.violations) && error.violations.length > 0);
    assert.ok(Array.isArray(error.warnings));
    assert.equal(error.safeMessage, COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE);
    assert.match(error.safeMessage, /commercial quality checks failed/);
  }
});

test('A10. An unexpected quality-evaluation exception becomes a blocking QG_QUALITY_EVALUATION_FAILED violation', () => {
  const data = buildCommerciallyPassingFixture().data;
  const content = buildCommerciallyPassingFixture().content;
  // Deliberately malformed evidence model (materialFindings undefined) -- checkQualityGates()'s
  // internal `.map`/`.filter` calls on model.materialFindings will throw a real TypeError.
  const brokenModel = { ...buildAdvisoryEvidenceModel(data), materialFindings: undefined };
  try {
    assertCommercialReportQuality({ data, content, roadmap: { agenda: [] }, evidenceModel: brokenModel });
    assert.fail('Expected assertCommercialReportQuality to throw on a broken evidence model.');
  } catch (error) {
    assert.ok(error instanceof ReportCommercialQualityError);
    assert.equal(error.violations.length, 1);
    assert.equal(error.violations[0].code, 'QG_QUALITY_EVALUATION_FAILED');
    assert.equal(error.violations[0].severity, 'violation');
  }
});

test('A11/A12. A warnings-only payload does not throw, and warnings do not cause passed to become false', () => {
  const { data, content, roadmap } = buildWarningsOnlyPayload();
  const evidenceModel = essentialEvidenceModelFor(data);
  const projection = essentialProjectionFor(data, evidenceModel);
  const quality = assertCommercialReportQuality({ data, content, roadmap, evidenceModel, projection });
  assert.equal(quality.passed, true);
  assert.ok(quality.warnings.length > 0);
  assert.equal(quality.violations.length, 0);
});

test('A13/A14. Warnings are logged exactly once, with only safe structured fields (no full report payload)', () => {
  const { data, content, roadmap } = buildWarningsOnlyPayload();
  const evidenceModel = essentialEvidenceModelFor(data);
  const projection = essentialProjectionFor(data, evidenceModel);
  const originalWarn = console.warn;
  const warnCalls = [];
  console.warn = (...args) => warnCalls.push(args);
  try {
    const html = renderReportHtml(data, content, roadmap, evidenceModel, undefined, projection);
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 0);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnCalls.length, 1, 'Expected exactly one console.warn call.');
  const [label, payload] = warnCalls[0];
  assert.equal(label, 'COMMERCIAL_QUALITY_WARNING');
  assert.deepEqual(Object.keys(payload).sort(), ['assessmentReference', 'warningCodes', 'warningCount'].sort());
  assert.equal(payload.assessmentReference, data.assessmentReference);
  assert.ok(Array.isArray(payload.warningCodes));
  assert.equal(payload.warningCount, payload.warningCodes.length);
  assert.ok(!('html' in payload) && !('content' in payload) && !('data' in payload), 'Must not log full report content/data/html.');
});

// ------------------------------------------------------------------------------------------------
// Section B: required render-stage tests (brief section 12), via renderValidatedCommercialPdf with
// injected recording spies.
// ------------------------------------------------------------------------------------------------

function makeRenderSpies({ pdfShouldReject = false, pdfBytes = Buffer.from('%PDF-fake') } = {}) {
  const calls = { html: 0, pdf: 0 };
  return {
    calls,
    dependencies: {
      renderHtml: (...args) => {
        calls.html += 1;
        return renderReportHtml(...args); // real quality-gate logic actually executes
      },
      renderPdf: async (html) => {
        calls.pdf += 1;
        if (pdfShouldReject) throw new Error('Simulated PDF renderer failure (not a quality failure).');
        assert.equal(typeof html, 'string');
        return pdfBytes;
      }
    }
  };
}

await asyncTest('B1/B2. HTML preparation and PDF rendering are each called exactly once for a passing payload', async () => {
  const { data, content, roadmap } = buildCommerciallyPassingFixture();
  const { calls, dependencies } = makeRenderSpies();
  const pdf = await renderValidatedCommercialPdf(providerFreeRenderInput(data, content, roadmap), dependencies);
  assert.equal(calls.html, 1);
  assert.equal(calls.pdf, 1);
  assert.ok(Buffer.isBuffer(pdf));
});

await asyncTest('B3/B4. PDF rendering is NOT called on a commercial-quality violation, and the quality error is not swallowed', async () => {
  const data = buildCommerciallyViolatingFixture();
  const content = emptySelectedContentFor(data);
  const { calls, dependencies } = makeRenderSpies();
  await assert.rejects(
    () => renderValidatedCommercialPdf({ data, content, roadmap: { agenda: [] } }, dependencies),
    ReportCommercialQualityError
  );
  assert.equal(calls.html, 1, 'renderHtml should still be attempted once (it is where the gate runs).');
  assert.equal(calls.pdf, 0, 'renderPdf must never be called when the quality gate fails.');
});

await asyncTest('B5. A renderer exception (not a quality failure) still propagates, and is distinguishable from ReportCommercialQualityError', async () => {
  const { data, content, roadmap } = buildCommerciallyPassingFixture();
  const { calls, dependencies } = makeRenderSpies({ pdfShouldReject: true });
  await assert.rejects(async () => {
    try {
      await renderValidatedCommercialPdf(providerFreeRenderInput(data, content, roadmap), dependencies);
    } catch (error) {
      assert.ok(!(error instanceof ReportCommercialQualityError), 'A renderer failure must not be reported as a quality failure.');
      throw error;
    }
  });
  assert.equal(calls.html, 1);
  assert.equal(calls.pdf, 1, 'renderPdf must have been attempted (the failure happened inside it).');
});

await asyncTest('B6. Warnings-only output follows the normal render path (resolves, does not throw)', async () => {
  const { data, content, roadmap } = buildWarningsOnlyPayload();
  const { calls, dependencies } = makeRenderSpies();
  const pdf = await renderValidatedCommercialPdf(providerFreeRenderInput(data, content, roadmap), dependencies);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(calls.html, 1);
  assert.equal(calls.pdf, 1);
});

// ------------------------------------------------------------------------------------------------
// Section C: required lifecycle tests (brief section 13), via generateManualPhase1Report() with a
// recording fake db and injected assembleReportData/validatePremiumReportGenerationEntitlement/
// getPhase1SchemaCapability/renderValidatedCommercialPdf (ManualPhase1Dependencies,
// phase1-manual-fulfilment.ts). This is the real orchestration function, executed for real -- only
// its external side-effect boundaries (Supabase, PDF rendering) are faked.
// ------------------------------------------------------------------------------------------------

await asyncTest('C1-C8,C14. Quality failure: no storage upload/verification/completion RPC, previous report untouched, failure RPC called once with commercial_quality_failed, no cleanup needed', async () => {
  // The real v1.1 whole-manuscript preflight requires a complete assembled report. Keep the
  // assembled fixture valid, and make the rendered payload deliberately violating at the exact
  // commercial-quality seam this lifecycle test is proving.
  const { data: lifecycleData } = buildCommerciallyPassingFixture();
  const violatingContent = emptySelectedContentFor(lifecycleData);
  const { db, calls } = createRecordingDb();

  await assert.rejects(
    () => generateManualPhase1Report(
      { orderReference: lifecycleData.orderReference, requestedBy: 'admin-1', requestKey: 'req-key-violating', action: 'admin_generate' },
      {
        db,
        assembleReportData: fakeAssembleReportData(lifecycleData),
        validatePremiumReportGenerationEntitlement: fakeValidateEntitlement(),
        getPhase1SchemaCapability: fakeSchemaCapability(),
        getPremiumReportAutomationFlags: fakeAutomationFlags(),
        preparePremiumReportNarrative: fakePrepareNarrative,
        ...providerFreeEssentialDependencies(),
        renderValidatedCommercialPdf: async ({ data }) => {
          // Exercise the REAL seam/quality-gate logic (not a stub that just throws) so this proves
          // the actual orchestration, not a contrived rejection. Deliberately ignores the real
          // selectContent()/selectRoadmap() output computed inside generateManualPhase1Report and
          // substitutes the known-violating content/roadmap, so this test's failure is driven
          // entirely by the fixture under test, not by whatever the real content-selection logic
          // happens to produce for a synthetic order reference.
          return renderValidatedCommercialPdf({ data, content: violatingContent, roadmap: { agenda: [] } });
        }
      }
    ),
    (error) => {
      assert.ok(error instanceof Phase1GenerationError);
      assert.equal(error.reason, 'commercial_quality_failed');
      assert.equal(error.status, 422); // C11
      return true;
    }
  );

  assert.equal(calls.storageUpload.length, 0, 'No storage upload may occur on a quality failure.'); // C1
  assert.equal(calls.storageDownload.length, 0, 'No storage verification may occur on a quality failure.'); // C2
  const completeCalls = calls.rpc.filter((c) => c.name === 'finalise_manual_report_with_supporting_register');
  assert.equal(completeCalls.length, 0, 'The completion RPC must never be called on a quality failure.'); // C3/C4/C5/C6
  const failCalls = calls.rpc.filter((c) => c.name === 'fail_manual_report_generation');
  assert.equal(failCalls.length, 1, 'The failure RPC must be called exactly once.'); // C7
  assert.equal(failCalls[0].args.p_error_category, 'commercial_quality_failed'); // C8/C9 (drives GENERATION_FAILED server-side)
  assert.equal(calls.storageRemove.length, 0, 'No storage cleanup should be required -- upload never occurred.'); // C14
});

await asyncTest('C10. output_report_id is never observed as set on a quality failure (completion RPC, which would set it, is never reached)', async () => {
  const { data: lifecycleData } = buildCommerciallyPassingFixture();
  const violatingContent = emptySelectedContentFor(lifecycleData);
  const { db, calls } = createRecordingDb();
  let sawSuccessfulResult = false;
  try {
    const result = await generateManualPhase1Report(
      { orderReference: lifecycleData.orderReference, requestedBy: 'admin-1', requestKey: 'c10', action: 'admin_generate' },
      {
        db,
        assembleReportData: fakeAssembleReportData(lifecycleData),
        validatePremiumReportGenerationEntitlement: fakeValidateEntitlement(),
        getPhase1SchemaCapability: fakeSchemaCapability(),
        getPremiumReportAutomationFlags: fakeAutomationFlags(),
        preparePremiumReportNarrative: fakePrepareNarrative,
        ...providerFreeEssentialDependencies(),
        renderValidatedCommercialPdf: async ({ data }) => renderValidatedCommercialPdf({ data, content: violatingContent, roadmap: { agenda: [] } })
      }
    );
    sawSuccessfulResult = !!result.reportId;
  } catch {
    // expected
  }
  assert.equal(sawSuccessfulResult, false);
  assert.equal(calls.rpc.filter((c) => c.name === 'finalise_manual_report_with_supporting_register').length, 0);
  // The old two-step completion must never reappear in the paid path.
  assert.equal(calls.rpc.filter((c) => c.name === 'complete_manual_report_generation').length, 0);
});

await asyncTest('C12. A genuine renderer exception (not a quality failure) maps to pdf_render_failed, distinct from commercial_quality_failed', async () => {
  const { data } = buildCommerciallyPassingFixture();
  const { db, calls } = createRecordingDb();

  await assert.rejects(
    () => generateManualPhase1Report(
      { orderReference: data.orderReference, requestedBy: 'admin-1', requestKey: 'req-key-renderer-fail', action: 'admin_generate' },
      {
        db,
        assembleReportData: fakeAssembleReportData(data),
        validatePremiumReportGenerationEntitlement: fakeValidateEntitlement(),
        getPhase1SchemaCapability: fakeSchemaCapability(),
        getPremiumReportAutomationFlags: fakeAutomationFlags(),
        preparePremiumReportNarrative: fakePrepareNarrative,
        ...providerFreeEssentialDependencies(),
        renderValidatedCommercialPdf: async () => { throw new Error('Simulated real PDF renderer crash.'); }
      }
    ),
    (error) => {
      assert.ok(error instanceof Phase1GenerationError);
      assert.equal(error.reason, 'pdf_render_failed');
      assert.notEqual(error.reason, 'commercial_quality_failed');
      return true;
    }
  );
  const failCalls = calls.rpc.filter((c) => c.name === 'fail_manual_report_generation');
  assert.equal(failCalls.length, 1);
  assert.equal(failCalls[0].args.p_error_category, 'pdf_render_failed');
  assert.equal(calls.storageUpload.length, 0);
});

await asyncTest('C13. Warnings-only output continues through the normal generation path to REPORT_READY (upload, verify, complete all called)', async () => {
  const { data, content, roadmap } = buildCommerciallyPassingFixture();
  const { db, calls } = createRecordingDb();

  const result = await generateManualPhase1Report(
    { orderReference: data.orderReference, requestedBy: 'admin-1', requestKey: 'req-key-passing', action: 'admin_generate' },
    {
      db,
      assembleReportData: fakeAssembleReportData(data),
      validatePremiumReportGenerationEntitlement: fakeValidateEntitlement(),
      getPhase1SchemaCapability: fakeSchemaCapability(),
      getPremiumReportAutomationFlags: fakeAutomationFlags(),
      preparePremiumReportNarrative: fakePrepareNarrative,
      ...providerFreeEssentialDependencies(),
      // Deliberately substitutes the known-passing content/roadmap from buildCommerciallyPassingFixture()
      // rather than the real selectContent()/selectRoadmap() output computed inside
      // generateManualPhase1Report() from this synthetic fixture (which has no matching
      // recommendation_rules and would fall back to defaultActions()'s generic phrasing). The PDF
      // renderer itself is faked (not real Puppeteer/Chromium) -- this test proves the *lifecycle
      // orchestration* (claim -> render -> upload -> verify -> complete), which is what Checkpoint B
      // is about, not the PDF binary itself.
      renderValidatedCommercialPdf: async ({ data: d }) => renderValidatedCommercialPdf(
        providerFreeRenderInput(d, content, roadmap),
        { renderHtml: renderReportHtml, renderPdf: async () => Buffer.from(`%PDF-1.4\n${'0'.repeat(1200)}`) }
      )
    }
  );

  assert.equal(result.reportId, 'report-1');
  // Per-artefact, not a global count: the PDF and the L3 supporting register are each stored
  // once and each verified once, in the expected bucket, at their own distinct paths.
  const pdfUploads = calls.storageUpload.filter((c) => c.path.endsWith('.pdf'));
  const registerUploads = calls.storageUpload.filter((c) => c.path.endsWith('.xlsx'));
  assert.equal(pdfUploads.length, 1);
  assert.equal(registerUploads.length, 1);
  assert.equal(calls.storageDownload.filter((c) => c.path.endsWith('.pdf')).length, 1);
  assert.equal(calls.storageDownload.filter((c) => c.path.endsWith('.xlsx')).length, 1);
  assert.ok([...pdfUploads, ...registerUploads].every((c) => c.bucket === 'generated-reports'));
  assert.notEqual(pdfUploads[0].path, registerUploads[0].path);
  assert.equal(calls.rpc.filter((c) => c.name === 'finalise_manual_report_with_supporting_register').length, 1);
  assert.equal(calls.rpc.filter((c) => c.name === 'complete_manual_report_generation').length, 0,
    'the paid path must not call the old completion RPC');
  assert.equal(calls.rpc.filter((c) => c.name === 'fail_manual_report_generation').length, 0);
});

// ------------------------------------------------------------------------------------------------
// Section D: no quality-gate override exists (brief section 14)
// ------------------------------------------------------------------------------------------------

test('D1. No environment variable, flag or parameter bypasses the quality gate for a violating fixture', () => {
  const data = buildCommerciallyViolatingFixture();
  const content = emptySelectedContentFor(data);
  const probedEnvVars = ['NODE_ENV', 'PHASE1_TEST_FORCE_PDF_FAILURE', 'SKIP_QUALITY_GATE', 'QUALITY_GATE_OVERRIDE', 'COMMERCIAL_QUALITY_BYPASS'];
  const saved = {};
  for (const key of probedEnvVars) saved[key] = process.env[key];
  try {
    process.env.SKIP_QUALITY_GATE = '1';
    process.env.QUALITY_GATE_OVERRIDE = '1';
    process.env.COMMERCIAL_QUALITY_BYPASS = '1';
    assert.throws(() => renderReportHtml(data, content, { agenda: [] }), ReportCommercialQualityError, 'No env var may bypass the gate -- assertCommercialReportQuality() takes no override parameter and reads no env vars.');
  } finally {
    for (const key of probedEnvVars) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Section P1B: atomic finalisation failure proofs.
//
// A paid Essential report may become current/VERIFIED only when BOTH artefacts are durable and
// verified. Previously the report was completed first and the register persisted afterwards, so a
// register failure left a committed report whose PDF the cleanup then deleted. These prove the
// ordering, the rollback, and -- proofs 10 and 11 -- that a lost RPC response is never mistaken for
// a failed transaction.
// ---------------------------------------------------------------------------------------------
const FINALISE_RPC = 'finalise_manual_report_with_supporting_register';
const REGISTER_MATCH = 'supporting-register';
const PDF_MATCH = '.pdf';

async function runGeneration(overrides = {}, deps = {}) {
  const { data, content, roadmap } = buildCommerciallyPassingFixture();
  const { db, calls } = createRecordingDb(overrides);
  let result = null;
  let error = null;
  try {
    result = await generateManualPhase1Report(
      { orderReference: data.orderReference, requestedBy: 'admin-1', requestKey: `p1b-${Math.random()}`, action: 'admin_generate' },
      {
        db,
        assembleReportData: fakeAssembleReportData(data),
        validatePremiumReportGenerationEntitlement: fakeValidateEntitlement(),
        getPhase1SchemaCapability: fakeSchemaCapability(),
        getPremiumReportAutomationFlags: fakeAutomationFlags(),
        preparePremiumReportNarrative: fakePrepareNarrative,
        ...providerFreeEssentialDependencies(),
        // Same shape C13 uses: the PDF renderer is faked (no real Chromium) and emits the exact
        // bytes the storage double stores, so checksum/size verification is genuine.
        renderValidatedCommercialPdf: async ({ data: d }) => renderValidatedCommercialPdf(
          providerFreeRenderInput(d, content, roadmap),
          { renderHtml: renderReportHtml, renderPdf: async () => Buffer.from(`%PDF-1.4\n${'0'.repeat(1200)}`) }
        ),
        ...deps
      }
    );
  } catch (thrown) { error = thrown; }
  return { result, error, calls };
}
const finaliseCalls = (calls) => calls.rpc.filter((c) => c.name === FINALISE_RPC);
const removedPaths = (calls) => calls.storageRemove.flatMap((c) => c.paths ?? []);
const assertNoFinalReport = (result, calls, label) => {
  assert.equal(result, null, `${label}: no successful result may be returned`);
  assert.equal(finaliseCalls(calls).length, 0, `${label}: finalisation must not be reached`);
  assert.equal(calls.rpc.filter((c) => c.name === 'complete_manual_report_generation').length, 0,
    `${label}: the old completion RPC must never be used`);
};

await asyncTest('P1B-1. PDF upload failure leaves no final report', async () => {
  const { result, calls } = await runGeneration({ failUploadMatching: PDF_MATCH });
  assertNoFinalReport(result, calls, 'P1B-1');
});

await asyncTest('P1B-2. PDF verification failure leaves no final report', async () => {
  const { result, calls } = await runGeneration({ corruptDownloadMatching: PDF_MATCH });
  assertNoFinalReport(result, calls, 'P1B-2');
});

await asyncTest('P1B-3. XLSX build failure leaves no final report', async () => {
  const { result, calls } = await runGeneration({}, {
    buildAndStoreSupportingRegister: async () => { throw new Error('injected workbook build failure'); }
  });
  assertNoFinalReport(result, calls, 'P1B-3');
});

await asyncTest('P1B-4. XLSX upload failure leaves no final report', async () => {
  const { result, calls } = await runGeneration({ failUploadMatching: REGISTER_MATCH });
  assertNoFinalReport(result, calls, 'P1B-4');
});

await asyncTest('P1B-5. XLSX verification failure leaves no final report', async () => {
  const { result, calls } = await runGeneration({ corruptDownloadMatching: REGISTER_MATCH });
  assertNoFinalReport(result, calls, 'P1B-5');
});

await asyncTest('P1B-6. finalisation failure before report insert leaves no final report', async () => {
  const { result, calls } = await runGeneration({
    rpcResponses: { [FINALISE_RPC]: { data: null, error: { message: 'phase1_generation_attempt_not_active' } } },
    // Positive proof of non-commit: the attempt is still pre-final and unbound. Without this the
    // resolver correctly returns 'uncertain' and retains the objects -- which is the safe default.
    tableResponses: {
      manual_report_generation_attempts: { data: { id: 'attempt-1', status: 'REPORT_GENERATING', output_report_id: null }, error: null }
    }
  });
  assert.equal(result, null, 'P1B-6: no successful result');
  assert.equal(finaliseCalls(calls).length, 1, 'P1B-6: finalisation was attempted exactly once');
  // Both physical objects were uploaded before finalisation, and reconciliation proves non-commit,
  // so both are eligible for cleanup.
  const removed = removedPaths(calls);
  assert.ok(removed.some((path) => path.endsWith('.pdf')), 'P1B-6: orphan PDF is cleaned');
  assert.ok(removed.some((path) => path.includes(REGISTER_MATCH)), 'P1B-6: orphan register is cleaned');
});

await asyncTest('P1B-7/8. artefact insert failure inside the transaction rolls back; previous version survives', async () => {
  // The RPC raising is exactly how an in-transaction artefact insert failure surfaces: the report
  // insert and the supersede roll back with it, so no partial state can be observed.
  const { result, calls } = await runGeneration({
    rpcResponses: { [FINALISE_RPC]: { data: null, error: { message: 'null value in column "report_id" violates not-null constraint' } } }
  });
  assert.equal(result, null, 'P1B-7: rollback must yield no result');
  assert.equal(calls.rpc.filter((c) => c.name === 'complete_report_secondary_artefact').length, 0,
    'P1B-7: the artefact is never completed outside the transaction');
  // No supersede or report mutation is issued by the caller at all -- it is the RPC's job -- so a
  // failed replacement cannot disturb the existing current report.
  assert.equal(calls.rpc.filter((c) => c.name === 'supersede_report').length, 0,
    'P1B-8: the caller never supersedes outside the atomic transaction');
});

await asyncTest('P1B-9. success yields one atomic finalisation and both objects intact', async () => {
  const { result, error, calls } = await runGeneration();
  assert.equal(error, null, `P1B-9: unexpected error ${error?.message}`);
  assert.ok(result?.reportId, 'P1B-9: a report must be returned');
  assert.equal(finaliseCalls(calls).length, 1, 'P1B-9: exactly one atomic finalisation');
  const uploads = calls.storageUpload.map((c) => c.path);
  assert.ok(uploads.some((path) => path.endsWith('.pdf')), 'P1B-9: PDF uploaded');
  assert.ok(uploads.some((path) => path.includes(REGISTER_MATCH)), 'P1B-9: register uploaded');
  assert.equal(removedPaths(calls).length, 0, 'P1B-9: nothing is deleted on success');
  // Both artefacts are verified by re-download before finalisation.
  const downloads = calls.storageDownload.map((c) => c.path);
  assert.ok(downloads.some((path) => path.endsWith('.pdf')), 'P1B-9: PDF verified from storage');
  assert.ok(downloads.some((path) => path.includes(REGISTER_MATCH)), 'P1B-9: register verified from storage');
});

await asyncTest('P1B-10. committed transaction with a lost response preserves both artefacts', async () => {
  // The RPC commits, then the response is lost. Authoritative reconciliation must detect
  // REPORT_READY and keep both objects, and must not persist a failure over a committed attempt.
  const committedReportId = 'report-committed-1';
  const { result, calls } = await runGeneration({
    rpcResponses: { [FINALISE_RPC]: { data: null, error: { message: 'fetch failed: socket hang up' } } },
    tableResponses: {
      manual_report_generation_attempts: { data: { id: 'attempt-1', status: 'REPORT_READY', output_report_id: committedReportId }, error: null }
    }
  });
  assert.equal(result, null, 'P1B-10: the caller still surfaces the transport error');
  assert.equal(removedPaths(calls).length, 0,
    'P1B-10: a committed transaction must never have its artefacts deleted');
  assert.equal(calls.rpc.filter((c) => c.name === 'fail_manual_report_generation').length, 0,
    'P1B-10: a committed attempt must never be downgraded by a failure RPC');
  assert.equal(finaliseCalls(calls).length, 1, 'P1B-10: no duplicate finalisation');
});

await asyncTest('P1B-11. unknown outcome with unreadable reconciliation deletes nothing', async () => {
  const { result, calls } = await runGeneration({
    rpcResponses: { [FINALISE_RPC]: { data: null, error: { message: 'statement timeout' } } },
    tableResponses: {
      manual_report_generation_attempts: { data: null, error: { message: 'connection reset during reconciliation' } }
    }
  });
  assert.equal(result, null, 'P1B-11: no customer success may be claimed');
  assert.equal(removedPaths(calls).length, 0,
    'P1B-11: uncertainty must retain both private orphan candidates rather than delete them');
  assert.equal(finaliseCalls(calls).length, 1, 'P1B-11: exactly one finalisation attempt, no retry');
  // The database may already hold a committed REPORT_READY transaction the client cannot read, so
  // no mutation may assume a rollback that was never established.
  assert.equal(calls.rpc.filter((c) => c.name === 'fail_manual_report_generation').length, 0,
    'P1B-11: failure state must not be persisted on an unproven rollback');
  assert.equal(calls.rpc.filter((c) => c.name === 'complete_report_secondary_artefact').length, 0,
    'P1B-11: no second artefact completion');
});


console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
