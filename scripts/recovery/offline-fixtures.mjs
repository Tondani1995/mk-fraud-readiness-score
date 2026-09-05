// Offline fixtures adapted from the existing V1.2 productionisation contracts.
import { syntheticOrgFixture } from '../../src/lib/reports/evidence-model/__fixtures__/synthetic-org-fixture.ts';
import { buildBlueprintMarkdownSkeleton } from '../../src/lib/reports/narrative/blueprint-text.ts';
const directAssessmentId = '00000000-0000-4000-8000-000000000102';
const directOrganisationId = '00000000-0000-4000-8000-000000000103';
const directScoreRunId = '00000000-0000-4000-8000-000000000104';

function directQuery(response) {
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return query; },
    limit() { return query; },
    async maybeSingle() {
      return typeof response === 'function' ? response() : response;
    },
    then(resolve, reject) {
      try {
        return Promise.resolve(typeof response === 'function' ? response() : response).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    }
  };
  return query;
}

function buildDirectAssembly(overrides = {}) {
  const source = syntheticOrgFixture;
  const traces = source.questionTraces.map((trace) => ({ ...trace }));
  const domainResults = source.domainResults.map((domain, index) => ({
    ...domain,
    weightedContribution: domain.rawScore * (domain.weightPct / 100),
    coveragePct: 100,
    criticalGapCount: index === 7 ? 1 : 0
  }));
  const lockedAt = '2026-08-26T10:00:00.000Z';
  const scoreRun = {
    ...source.scoreRun,
    ...(overrides.scoreRun ?? {}),
    id: directScoreRunId,
    assessmentId: directAssessmentId
  };
  return {
    ...source,
    ...overrides,
    orderId: null,
    orderReference: null,
    orderAssessmentId: directAssessmentId,
    assessmentId: directAssessmentId,
    organisationId: directOrganisationId,
    currentScoreRunId: directScoreRunId,
    orderVerifiedAt: null,
    orderVerifiedBy: null,
    respondentName: 'Provider-Free Direct Tester',
    customerEmail: 'provider-free-respondent@example.test',
    assessmentReference: 'MK-COMP-PROVIDER-FREE',
    reportReference: 'RPT-MK-ESS-PROVIDER-FREE-V1',
    generatedAt: lockedAt,
    packageName: 'Essential Fraud Readiness Report',
    productCode: 'essential_self_assessment',
    orderStatus: null,
    amountCents: null,
    currency: 'ZAR',
    productPriceCents: 750000,
    productCurrency: 'ZAR',
    productId: '00000000-0000-4000-8000-000000000105',
    orderCreatedAt: null,
    productPriceVersionId: null,
    productPriceVersions: [],
    paymentVerification: { status: 'not_required' },
    requiresPaymentVerification: false,
    deliveryMode: 'mk_controlled_pdf',
    productActive: true,
    scoreRun: {
      ...scoreRun,
      status: scoreRun.status ?? 'completed',
      lockedAt: Object.prototype.hasOwnProperty.call(overrides.scoreRun ?? {}, 'lockedAt') ? scoreRun.lockedAt : lockedAt,
      inputHash: Object.prototype.hasOwnProperty.call(overrides.scoreRun ?? {}, 'inputHash') ? scoreRun.inputHash : 'a'.repeat(64)
    },
    domainResults,
    questionTraces: traces,
    expectedDomainResultCount: domainResults.length,
    actualDomainResultCount: domainResults.length,
    expectedQuestionTraceCount: traces.length,
    actualQuestionTraceCount: traces.length,
    adaptiveScope: null,
    adaptiveGatewayAnswers: {},
  };
}

function createProviderFreeWholeWriter() {
  const calls = { write: 0, tail: 0, repair: 0, coherence: 0 };
  const writer = {
    provider: 'test-injected',
    model: 'test-injected-model',
    promptVersion: 'test-injected-prompt',
    async writeManuscript(input) {
      calls.write += 1;
      const skeleton = buildBlueprintMarkdownSkeleton(input.blueprint);
      const markdown = skeleton.headings.map((heading) =>
        `${'#'.repeat(heading.level)} ${heading.title}\n\nThis section records a bounded management implication grounded in the persisted assessment evidence.`
      ).join('\n\n');
      return {
        contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
        architecture: 'whole-manuscript',
        markdown,
        blueprint: input.blueprint,
        writerMetadata: {
          contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
          architecture: 'whole-manuscript',
          provider: 'test-injected',
          model: 'test-injected-model',
          promptVersion: 'test-injected-prompt',
          generationMode: 'test-injected',
          generatedAt: '2026-08-26T10:00:00.000Z',
          inputFactPackSha256: 'b'.repeat(64),
          inputStoryPlanSha256: 'c'.repeat(64),
          inputBlueprintSha256: 'd'.repeat(64),
          recovery: {
            initialGenerationCount: 1,
            targetedRepairCount: 0,
            fullRegenerationCount: 0,
            qualityEscalationCount: 0,
            coherenceCount: 0,
            technicalFallbackCount: 0,
            truncationContinuationCount: 0,
            totalCalls: 1,
            totalTokens: 0,
            totalProviderCostMicros: 0
          }
        }
      };
    },
    async completeTail() { calls.tail += 1; throw new Error('tail completion must not be used by a complete manuscript'); },
    async repairBlock() { calls.repair += 1; throw new Error('targeted repair must not be used by a complete manuscript'); },
    async coherencePass() { calls.coherence += 1; throw new Error('coherence pass must not be used by a complete manuscript'); }
  };
  return { writer, calls };
}

function createDirectGenerationDb(overrides = {}) {
  const calls = { rpc: [], from: [], storageUpload: [], storageDownload: [], storageRemove: [] };
  const pdfBytes = Buffer.from(`%PDF-1.7\n${'0'.repeat(1200)}`);
  const rpcResponses = {
    claim_assessment_manual_report_generation: {
      data: {
        claimed: true,
        generation_started: false,
        attempt: { id: '00000000-0000-4000-8000-000000000106', report_version: 1, request_id: 'direct-request', retry_count: 0, order_id: null }
      },
      error: null
    },
    start_assessment_manual_report_generation: { data: { ok: true }, error: null },
    record_assessment_manual_report_generation_diagnostics: { data: { ok: true }, error: null },
    fail_assessment_manual_report_generation: { data: { ok: true }, error: null },
    complete_assessment_manual_report_generation: {
      data: {
        report: { id: '00000000-0000-4000-8000-000000000107', report_reference: 'RPT-MK-ESS-PROVIDER-FREE-V1', version_number: 1 },
        superseded_report_id: null
      },
      error: null
    },
    ...overrides.rpcResponses
  };
  const storedObjects = new Map();
  const db = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      const response = rpcResponses[name];
      if (!response) throw new Error(`Unexpected provider-free RPC: ${name}`);
      return typeof response === 'function' ? response(args) : response;
    },
    from(table) {
      calls.from.push(table);
      if (table === 'report_templates') {
        return directQuery({ data: { id: '00000000-0000-4000-8000-000000000108', template_code: 'essential-v1', version_number: 1 }, error: null });
      }
      if (table === 'report_content_blocks') return directQuery({ data: [], error: null });
      throw new Error(`Unexpected provider-free table: ${table}`);
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, bytes, opts) {
            calls.storageUpload.push({ bucket, path, bytes: Buffer.from(bytes), opts });
            if (overrides.uploadError) return { error: new Error(overrides.uploadError) };
            storedObjects.set(`${bucket}/${path}`, Buffer.from(bytes));
            return { error: null };
          },
          async download(path) {
            calls.storageDownload.push({ bucket, path });
            if (overrides.downloadError) return { data: null, error: new Error(overrides.downloadError) };
            const bytes = overrides.corruptDownload
              ? Buffer.from('%PDF-1.7\ncorrupt-stored-object')
              : (storedObjects.get(`${bucket}/${path}`) ?? pdfBytes);
            return { data: new Blob([bytes], { type: 'application/pdf' }), error: null };
          },
          async remove(paths) {
            calls.storageRemove.push({ bucket, paths });
            return { error: null };
          }
        };
      }
    }
  };
  return { db, calls, pdfBytes };
}

function providerFreeFlags() {
  return async () => ({
    securityGateSatisfied: false,
    securityGateVersion: null,
    autoFulfilmentEnabled: false,
    aiNarrativeEnabled: false,
    autoEmailEnabled: false,
    manualDeliveryEnabled: false,
    testRecipientOverrideEnabled: false,
    testRecipientOverride: null,
    model: 'test-injected-model',
    promptVersion: 'test-injected-prompt',
    schemaVersion: 'test-injected-schema'
  });
}


export { buildDirectAssembly, createProviderFreeWholeWriter, createDirectGenerationDb, providerFreeFlags };
