import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildMateriallyWeakDecisionFixture,
  buildModerateDecisionFixture,
  buildCleanAssuranceFixture
} from '../src/lib/reports/evidence-model/__fixtures__/decision-fixtures.ts';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../src/lib/reports/roadmap.ts';
import { selectContent } from '../src/lib/reports/select-content-blocks.ts';
import {
  buildPremiumReportEvidencePack,
  evidenceChecksum
} from '../src/lib/reports/automation/evidence.ts';
import {
  assertPremiumReportNarrativeBrief,
  buildPremiumReportNarrativeBrief
} from '../src/lib/reports/automation/narrative-brief.ts';
import {
  buildPremiumReportGenerationPrompt,
  buildPremiumReportRepairPrompt,
  PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS
} from '../src/lib/reports/automation/prompt.ts';
import { validatePremiumReportAiEditorialPlan } from '../src/lib/reports/automation/ai-plan-validation.ts';
import { validatePremiumReportNarrative } from '../src/lib/reports/automation/validation.ts';
import { aiPlanToNarrative } from '../src/lib/reports/automation/content.ts';
import { preparePremiumReportNarrative } from '../src/lib/reports/automation/narrative-pipeline.ts';
import {
  PREMIUM_REPORT_AI_MAX_INPUT_BYTES,
  PREMIUM_REPORT_AI_MAX_ESTIMATED_INPUT_TOKENS,
  PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS
} from '../src/lib/reports/automation/durable-ai-attempts.ts';
import { PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS } from '../src/lib/reports/automation/ai-sdk-generator.ts';
import {
  PREMIUM_REPORT_PROMPT_VERSION,
  PREMIUM_REPORT_SCHEMA_VERSION
} from '../src/lib/reports/automation/types.ts';
import { generateManualPhase1Report } from '../src/lib/reports/phase1-manual-fulfilment.ts';
import { renderValidatedCommercialPdf } from '../src/lib/reports/render-validated-commercial-pdf.ts';
import { renderReportHtml } from '../src/lib/reports/templates/report-template.ts';
import { persistManualNarrativeProvenance } from '../src/lib/reports/automation/manual-narrative-provenance.ts';
import { isReportCommercialQualityError } from '../src/lib/reports/commercial-quality.ts';

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL - ${name}`);
    console.error(error.stack ?? error.message);
  }
}

const ENABLED_FLAGS = Object.freeze({
  securityGateSatisfied: true,
  securityGateVersion: 1,
  autoFulfilmentEnabled: false,
  aiNarrativeEnabled: true,
  autoEmailEnabled: false,
  manualDeliveryEnabled: true,
  testRecipientOverrideEnabled: false,
  testRecipientOverride: null,
  model: 'openai/checkpoint-e-test-model',
  promptVersion: PREMIUM_REPORT_PROMPT_VERSION,
  schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION
});

const DISABLED_FLAGS = Object.freeze({ ...ENABLED_FLAGS, aiNarrativeEnabled: false });

const DOMAIN_FOCUS = {
  D1: 'executive mandate, role separation and governance challenge',
  D2: 'process risk mapping, scenario identification and exposure ownership',
  D3: 'transaction approval, exception handling and preventive operation',
  D4: 'detection logic, alert review and investigative escalation',
  D5: 'incident triage, response authority and evidence preservation',
  D6: 'speak-up access, retaliation protection and case oversight',
  D7: 'supplier onboarding, invoice integrity and bank-detail verification',
  D8: 'identity assurance, privileged access and digital impersonation defence',
  D9: 'workforce awareness, behavioural reinforcement and accountability culture',
  D10: 'control testing, lessons learned and continuous monitoring cadence'
};

function buildContext(data) {
  const advisoryModel = buildAdvisoryEvidenceModel(data);
  const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(advisoryModel.roadmapActions);
  const deterministicContent = selectContent(data, []);
  const evidence = buildPremiumReportEvidencePack(data, advisoryModel, PREMIUM_REPORT_SCHEMA_VERSION);
  const brief = buildPremiumReportNarrativeBrief(evidence);
  return { data, advisoryModel, roadmap, deterministicContent, evidence, brief };
}

function validV4Plan(context, voice) {
  const { data, brief } = context;
  const clean = data.criticalMajorGaps.length === 0;
  const domainByCode = new Map(data.domainResults.map((domain) => [domain.domainCode, domain]));
  const gapByCode = new Map(data.criticalMajorGaps.map((gap) => [gap.questionCode, gap]));
  const riskPhrase = clean
    ? 'The strongest reported controls remain assurance priorities until their operating evidence is independently examined.'
    : 'The cited material risks and control conditions explain why leadership attention must extend beyond the headline result.';
  const falseComfortBody = clean
    ? `${voice} presents a strong self-reported position, but self-assessment alone does not establish independent operating effectiveness. The cited assurance and evidence requirements identify what leadership should validate before relying on the reported strength.`
    : `${voice} should not treat the headline result as sufficient assurance because the cited gaps, maturity constraints and exposure evidence reveal material conditions beneath it. Independent operating evidence is needed before control effectiveness can be relied upon.`;

  return {
    executiveEvidenceRefs: [...brief.executive.requiredEvidenceRefs],
    executiveBody: `${voice} recorded an overall score of ${data.scoreRun.overallScore}, with ${data.scoreRun.finalMaturity} final maturity and ${data.scoreRun.exposureBand} exposure. ${riskPhrase} This remains a self-assessment and has not been independently verified.`,
    falseComfortEvidenceRefs: [...brief.falseComfort.requiredEvidenceRefs],
    falseComfortBody,
    leadershipEvidenceRefs: [...brief.leadership.requiredEvidenceRefs],
    leadershipBody: `${voice} leadership must make the cited decisions in dependency order, assign the identified accountability categories and require the specified operating evidence. Delay would prolong the risk and assurance conditions already identified by the deterministic advisory model.`,
    domainEvidence: Object.entries(brief.domains).map(([domainCode, sectionBrief]) => {
      const domain = domainByCode.get(domainCode);
      return {
        domainCode,
        evidenceRefs: [...sectionBrief.requiredEvidenceRefs],
        body: `${domain.domainName} has a distinct self-reported position concerning ${DOMAIN_FOCUS[domainCode] ?? domain.domainName.toLowerCase()}. The cited domain, question and advisory evidence should be evaluated through its linked operating records rather than inferred from the aggregate result.`
      };
    }),
    gapEvidence: Object.entries(brief.gaps).map(([questionCode, sectionBrief]) => {
      const gap = gapByCode.get(questionCode);
      return {
        questionCode,
        evidenceRefs: [...sectionBrief.requiredEvidenceRefs],
        body: `${gap.prompt} is the precise control condition recorded by the self-assessment. The cited risk pathway shows how weak operation can enable concealment or delayed escalation, making the linked control treatment and evidence test the immediate priority.`
      };
    })
  };
}

function generationResult(output) {
  return {
    output,
    provider: 'openai',
    model: 'checkpoint-e-test-model',
    latencyMs: 12,
    usage: { inputTokens: 1200, outputTokens: 700, totalTokens: 1900, estimatedCostMicros: 4200 }
  };
}

function recordingGenerator(first, repair = first) {
  const calls = { generate: 0, repair: 0 };
  const inputs = { generate: [], repair: [] };
  return {
    calls,
    inputs,
    generator: {
      provider: 'openai',
      model: 'checkpoint-e-test-model',
      async generate(input) { calls.generate += 1; inputs.generate.push(input); return generationResult(first); },
      async repair(input) { calls.repair += 1; inputs.repair.push(input); return generationResult(repair); }
    }
  };
}

function recordingAttemptStore() {
  const calls = { authorize: 0, find: 0, count: 0, claim: 0, settle: 0 };
  const attempts = [];
  return {
    calls,
    attempts,
    store: {
      async authorize() { calls.authorize += 1; return { authorised: true }; },
      async findReusableAttempt(fingerprint, kind) {
        calls.find += 1;
        return attempts.filter((attempt) => attempt.kind === kind && attempt.fingerprint.generationIdentity === fingerprint.generationIdentity)
          .at(-1) ?? null;
      },
      async countChargeableAttempts() {
        calls.count += 1;
        return attempts.filter((attempt) => attempt.status !== 'failed_before_provider').length;
      },
      async claimAttempt(payload) {
        calls.claim += 1;
        const attempt = {
          id: `ai-attempt-${calls.claim}`,
          status: 'started',
          output_json: null,
          attempt_number: calls.claim,
          accounting_status: 'unverified',
          kind: payload.attempt_kind,
          fingerprint: { generationIdentity: payload.generation_identity },
          payload
        };
        attempts.push(attempt);
        return attempt;
      },
      async settleAttempt(id, result) {
        calls.settle += 1;
        const attempt = attempts.find((entry) => entry.id === id);
        attempt.status = result.status;
        attempt.accounting_status = result.accounting_status;
        attempt.output_json = result.output_json;
        return attempt;
      }
    }
  };
}

function makeQueryBuilder(response) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    neq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(response),
    then: (resolve, reject) => Promise.resolve(response).then(resolve, reject)
  };
  return builder;
}

function recordingManualDb({ payment = false, replayOnSecondClaim = false } = {}) {
  const calls = { rpc: [], upload: [], download: [], remove: [], claimCount: 0 };
  let uploadedBytes = null;
  const db = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (name === 'claim_manual_report_generation' || name === 'claim_payment_report_generation') {
        calls.claimCount += 1;
        if (replayOnSecondClaim && calls.claimCount > 1) {
          return { data: { claimed: false, reason: 'idempotent_replay', attempt: { id: 'manual-attempt-1', status: 'REPORT_READY', output_report_id: 'report-1' } }, error: null };
        }
        return { data: { claimed: true, attempt: { id: 'manual-attempt-1', report_version: 1, request_id: 'manual-request-1', retry_count: 0 } }, error: null };
      }
      if (name === 'start_manual_report_generation') return { data: { ok: true }, error: null };
      if (name === 'record_manual_report_narrative_provenance') return { data: { id: 'manual-attempt-1', ...args.p_provenance }, error: null };
      if (name === 'complete_manual_report_generation') return { data: { report: { id: 'report-1', report_reference: 'RPT-CHECKPOINT-E-V1', version_number: 1 }, superseded_report_id: null }, error: null };
      if (name === 'fail_manual_report_generation') return { data: { updated: true }, error: null };
      throw new Error(`Unstubbed RPC ${name}`);
    },
    from: (table) => {
      if (table === 'report_templates') return makeQueryBuilder({ data: { id: 'template-1', template_code: 'essential-v1', version_number: 1 }, error: null });
      if (table === 'report_content_blocks') return makeQueryBuilder({ data: [], error: null });
      if (table === 'reports') return makeQueryBuilder({ data: { id: 'report-1', report_reference: 'RPT-CHECKPOINT-E-V1', version_number: 1, supersedes_report_id: null }, error: null });
      return makeQueryBuilder({ data: null, error: new Error(`Unstubbed table ${table}`) });
    },
    storage: {
      from: (bucket) => ({
        upload: async (path, bytes) => { uploadedBytes = Buffer.from(bytes); calls.upload.push({ bucket, path }); return { error: null }; },
        download: async (path) => { calls.download.push({ bucket, path }); return { data: { arrayBuffer: async () => uploadedBytes.buffer.slice(uploadedBytes.byteOffset, uploadedBytes.byteOffset + uploadedBytes.byteLength) }, error: null }; },
        remove: async (paths) => { calls.remove.push({ bucket, paths }); return { error: null }; }
      })
    }
  };
  return { db, calls, payment };
}

function manualDependencies(context, options) {
  const html = [];
  const pdf = Buffer.from(`%PDF-1.7\n${'E'.repeat(1800)}`);
  return {
    html,
    dependencies: {
      db: options.db,
      assembleReportData: async () => structuredClone(context.data),
      validatePremiumReportGenerationEntitlement: () => 'essential_self_assessment',
      getPhase1SchemaCapability: async () => ({ status: 'available', schemaVersion: '0023', message: null, checks: {} }),
      getPremiumReportAutomationFlags: async () => options.flags,
      narrativeGenerator: options.generator,
      attemptStore: options.attemptStore,
      renderValidatedCommercialPdf: async (input) => renderValidatedCommercialPdf(input, {
        renderHtml: (...args) => { const rendered = renderReportHtml(...args); html.push(rendered); return rendered; },
        renderPdf: async () => pdf
      })
    }
  };
}

async function runManual(context, { flags = ENABLED_FLAGS, plan, repairPlan = plan, action = 'admin_generate', dbOptions = {} } = {}) {
  const dbState = recordingManualDb(dbOptions);
  const generatorState = recordingGenerator(plan ?? validV4Plan(context, context.data.organisationName), repairPlan ?? plan ?? validV4Plan(context, context.data.organisationName));
  const storeState = recordingAttemptStore();
  const wired = manualDependencies(context, { db: dbState.db, flags, generator: generatorState.generator, attemptStore: storeState.store });
  const result = await generateManualPhase1Report({
    orderReference: context.data.orderReference,
    requestedBy: action === 'payment_confirmation' ? null : 'admin-1',
    requestKey: `${action}:checkpoint-e`,
    action
  }, wired.dependencies);
  return { result, html: wired.html, dbState, generatorState, storeState };
}

function pipelineInput(context, generatorState, storeState, generationIdentity) {
  return {
    assembled: context.data,
    deterministicContent: context.deterministicContent,
    roadmap: context.roadmap,
    advisoryModel: context.advisoryModel,
    flags: ENABLED_FLAGS,
    generator: generatorState.generator,
    generationIdentity,
    attemptStore: storeState.store
  };
}

function renameAuthoritativeEvidenceId(evidence, collection, index, prefix, replacementId) {
  const entry = evidence.advisoryModel[collection][index];
  const oldEvidenceId = `${prefix}:${entry.id}`;
  const item = evidence.items.find((candidate) => candidate.id === oldEvidenceId);
  assert.ok(item, `${oldEvidenceId} fixture evidence was not found`);
  entry.id = replacementId;
  item.id = `${prefix}:${replacementId}`;
  if (item.value && typeof item.value === 'object') item.value.id = replacementId;
}

console.log('V7 Checkpoint E -- active-path AI narrative integration suite');

const weak = buildContext(buildMateriallyWeakDecisionFixture());
const moderate = buildContext(buildModerateDecisionFixture());
const clean = buildContext(buildCleanAssuranceFixture());
const weakPlan = validV4Plan(weak, 'Weak Decision Organisation');
const moderatePlan = validV4Plan(moderate, 'Moderate Decision Organisation');
const cleanPlan = validV4Plan(clean, 'Clean Assurance Organisation');

await test('E1: V4 prompt/schema versions and deterministic briefs are explicit and fixture-specific', () => {
  assert.equal(PREMIUM_REPORT_PROMPT_VERSION, 'mk-essential-report-v4-advisory-editor');
  assert.equal(PREMIUM_REPORT_SCHEMA_VERSION, 'mk-essential-ai-advisory-editor-v4');
  assert.notDeepEqual(weak.brief, moderate.brief);
  assert.notDeepEqual(moderate.brief, clean.brief);
  assert.equal(Object.keys(weak.brief.domains).length, weak.data.domainResults.length);
  assert.equal(Object.keys(weak.brief.gaps).length, weak.data.criticalMajorGaps.length);
});

await test('E2: weak, moderate and clean V4 outputs pass section-scoped structural and factual validation', () => {
  for (const [context, plan] of [[weak, weakPlan], [moderate, moderatePlan], [clean, cleanPlan]]) {
    const structural = validatePremiumReportAiEditorialPlan(plan, context.evidence, context.brief);
    assert.equal(structural.ok, true);
    const narrative = aiPlanToNarrative(context.data, context.deterministicContent, plan);
    const factual = validatePremiumReportNarrative(narrative, context.evidence);
    assert.equal(factual.ok, true);
  }
  assert.notEqual(weakPlan.executiveBody, cleanPlan.executiveBody);
});

await test('E3: generation and repair prompts remain within byte/token limits for all required fixtures', () => {
  for (const [context, plan] of [[weak, weakPlan], [moderate, moderatePlan], [clean, cleanPlan]]) {
    const input = { evidence: context.evidence, evidenceChecksum: 'a'.repeat(64), narrativeBrief: context.brief, promptVersion: PREMIUM_REPORT_PROMPT_VERSION, schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION };
    const prompts = [buildPremiumReportGenerationPrompt(input), buildPremiumReportRepairPrompt({ ...input, previousOutput: plan, validationIssues: [{ code: 'test', path: 'executiveBody', message: 'test', blocking: true }] })];
    for (const prompt of prompts) {
      const bytes = Buffer.byteLength(`${PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS}\n${prompt}`, 'utf8');
      const estimatedTokens = Math.ceil(bytes / 4);
      const estimatedCostMicros = estimatedTokens * 10 + PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS * 20;
      assert.ok(bytes < PREMIUM_REPORT_AI_MAX_INPUT_BYTES, `${context.data.assessmentReference} prompt ${bytes} exceeded byte limit ${PREMIUM_REPORT_AI_MAX_INPUT_BYTES}`);
      assert.ok(estimatedTokens < PREMIUM_REPORT_AI_MAX_ESTIMATED_INPUT_TOKENS, `${context.data.assessmentReference} prompt exceeded token estimate`);
      assert.ok(estimatedCostMicros < PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS, `${context.data.assessmentReference} prompt exceeded cost estimate`);
      assert.doesNotMatch(prompt, /customerEmail|respondentName|@example\.test/);
    }
  }
});

await test('E4: administrator Phase 1 AI mode reaches the real shared pipeline, HTML, PDF and provenance', async () => {
  const run = await runManual(weak, { plan: weakPlan });
  assert.equal(run.result.generationMode, 'ai');
  assert.equal(run.generatorState.calls.generate, 1);
  assert.equal(run.generatorState.calls.repair, 0);
  assert.equal(run.storeState.calls.authorize, 1);
  assert.equal(run.storeState.calls.claim, 1);
  assert.equal(run.storeState.calls.settle, 1);
  assert.equal(run.html.length, 1);
  assert.ok(run.html[0].includes(weakPlan.executiveBody));
  assert.ok(run.dbState.calls.upload.length === 1 && run.dbState.calls.download.length === 1);
  const provenance = run.dbState.calls.rpc.find((call) => call.name === 'record_manual_report_narrative_provenance');
  assert.equal(provenance.args.p_provenance.generation_mode, 'ai');
  assert.equal(provenance.args.p_provenance.final_narrative.executiveDiagnosis.body, weakPlan.executiveBody);
});

await test('E5: administrator retry and regenerate actions use the same shared contract', async () => {
  for (const action of ['admin_retry', 'admin_regenerate']) {
    const run = await runManual(moderate, { plan: moderatePlan, action });
    assert.equal(run.result.generationMode, 'ai');
    assert.ok(run.html[0].includes(moderatePlan.leadershipBody));
  }
});

await test('E6: payment-confirmation generation uses the same shared narrative and durable attempt boundary', async () => {
  const run = await runManual(moderate, { plan: moderatePlan, action: 'payment_confirmation' });
  assert.equal(run.result.generationMode, 'ai');
  assert.ok(run.dbState.calls.rpc.some((call) => call.name === 'claim_payment_report_generation'));
  assert.equal(run.storeState.calls.claim, 1);
  assert.ok(run.html[0].includes(moderatePlan.executiveBody));
});

await test('E7: one successful repair reaches HTML and persists ai_repair with two combined durable attempts', async () => {
  const invalid = { ...weakPlan, executiveBody: 'The organisation is Strategic overall.' };
  const run = await runManual(weak, { plan: invalid, repairPlan: weakPlan });
  assert.equal(run.result.generationMode, 'ai_repair');
  assert.deepEqual(run.generatorState.calls, { generate: 1, repair: 1 });
  assert.equal(run.storeState.calls.claim, 2);
  assert.ok(run.html[0].includes(weakPlan.executiveBody));
  assert.equal(run.dbState.calls.rpc.find((call) => call.name === 'record_manual_report_narrative_provenance').args.p_provenance.generation_mode, 'ai_repair');
});

await test('E8: failed repair falls back deterministically and never makes a third provider call', async () => {
  const invalid = { ...weakPlan, executiveBody: 'The organisation is Strategic overall.' };
  const run = await runManual(weak, { plan: invalid, repairPlan: invalid });
  assert.equal(run.result.generationMode, 'deterministic_fallback');
  assert.deepEqual(run.generatorState.calls, { generate: 1, repair: 1 });
  assert.equal(run.storeState.calls.claim, 2);
  assert.ok(!run.html[0].includes(invalid.executiveBody));
});

await test('E9: disabled AI makes no provider, authorisation or durable-attempt call and persists fallback', async () => {
  const run = await runManual(clean, { flags: DISABLED_FLAGS, plan: cleanPlan });
  assert.equal(run.result.generationMode, 'deterministic_fallback');
  assert.deepEqual(run.generatorState.calls, { generate: 0, repair: 0 });
  assert.deepEqual(run.storeState.calls, { authorize: 0, find: 0, count: 0, claim: 0, settle: 0 });
  assert.equal(run.dbState.calls.rpc.find((call) => call.name === 'record_manual_report_narrative_provenance').args.p_provenance.generation_mode, 'deterministic_fallback');
});

await test('E10: idempotent replay returns the existing report without a duplicate provider call', async () => {
  const dbState = recordingManualDb({ replayOnSecondClaim: true });
  const generatorState = recordingGenerator(weakPlan);
  const storeState = recordingAttemptStore();
  const wired = manualDependencies(weak, { db: dbState.db, flags: ENABLED_FLAGS, generator: generatorState.generator, attemptStore: storeState.store });
  const input = { orderReference: weak.data.orderReference, requestedBy: 'admin-1', requestKey: 'stable-replay-key', action: 'admin_generate' };
  await generateManualPhase1Report(input, wired.dependencies);
  const replay = await generateManualPhase1Report(input, wired.dependencies);
  assert.equal(replay.reusedExistingReport, true);
  assert.equal(generatorState.calls.generate, 1);
  assert.equal(storeState.calls.claim, 1);
});

await test('E11: Phase 14-style use of the shared pipeline retains durable authorisation, accounting and mode', async () => {
  const generatorState = recordingGenerator(moderatePlan);
  const storeState = recordingAttemptStore();
  const prepared = await preparePremiumReportNarrative({
    assembled: moderate.data,
    deterministicContent: moderate.deterministicContent,
    roadmap: moderate.roadmap,
    advisoryModel: moderate.advisoryModel,
    flags: ENABLED_FLAGS,
    generator: generatorState.generator,
    generationIdentity: 'fulfilment:test:score:test',
    fulfilmentId: 'fulfilment-test',
    workerCapabilityId: 'capability-test',
    attemptStore: storeState.store
  });
  assert.equal(prepared.mode, 'ai');
  assert.equal(storeState.attempts[0].accounting_status, 'verified');
  assert.equal(storeState.attempts[0].output_json.usage.totalTokens, 1900);
});

await test('E12: out-of-scope, missing-required and unknown refs fail with stable structural codes', () => {
  const outOfScope = { ...weakPlan, executiveEvidenceRefs: [...weakPlan.executiveEvidenceRefs, `gap:${weak.data.criticalMajorGaps[0].questionCode}`] };
  const missing = { ...weakPlan, executiveEvidenceRefs: weakPlan.executiveEvidenceRefs.slice(1) };
  const unknown = { ...weakPlan, executiveEvidenceRefs: [...weakPlan.executiveEvidenceRefs, 'risk:does-not-exist'] };
  assert.ok(validatePremiumReportAiEditorialPlan(outOfScope, weak.evidence, weak.brief).issues.some((issue) => issue.code === 'section_evidence_scope_violation'));
  assert.ok(validatePremiumReportAiEditorialPlan(missing, weak.evidence, weak.brief).issues.some((issue) => issue.code === 'missing_required_section_evidence'));
  assert.ok(validatePremiumReportAiEditorialPlan(unknown, weak.evidence, weak.brief).issues.some((issue) => issue.code === 'unknown_evidence_ref'));
});

await test('E13: markdown, generic filler and materially duplicated section prose fail validation', () => {
  const markdown = { ...weakPlan, leadershipBody: '- Assign accountability' };
  assert.ok(validatePremiumReportAiEditorialPlan(markdown, weak.evidence, weak.brief).issues.some((issue) => issue.code === 'ai_body_markdown_forbidden'));
  const generic = { ...weakPlan, leadershipBody: 'A holistic approach will enhance the control environment through a robust framework.' };
  assert.ok(validatePremiumReportAiEditorialPlan(generic, weak.evidence, weak.brief).issues.some((issue) => issue.code === 'generic_narrative_body'));
  const duplicate = structuredClone(weakPlan);
  duplicate.domainEvidence[1].body = duplicate.domainEvidence[0].body;
  assert.ok(validatePremiumReportAiEditorialPlan(duplicate, weak.evidence, weak.brief).issues.some((issue) => issue.code === 'duplicate_narrative_body'));
});

await test('E14: unsupported assurance and allegation language fail factual validation', () => {
  for (const body of ['The organisation is well protected.', 'Fraud occurred and an employee committed fraud.']) {
    const plan = { ...cleanPlan, executiveBody: body };
    const narrative = aiPlanToNarrative(clean.data, clean.deterministicContent, plan);
    const codes = validatePremiumReportNarrative(narrative, clean.evidence).issues.map((issue) => issue.code);
    assert.ok(codes.includes(body.includes('protected') ? 'unsupported_assurance_claim' : 'allegation_language'));
  }
});

await test('E15: official response meanings and leadership decisions cannot be misstated as absent or complete', () => {
  const responsePlan = structuredClone(cleanPlan);
  responsePlan.domainEvidence[0].body = 'The control is not implemented and is merely planned.';
  let narrative = aiPlanToNarrative(clean.data, clean.deterministicContent, responsePlan);
  assert.ok(validatePremiumReportNarrative(narrative, clean.evidence).issues.some((issue) => issue.code === 'response_label_misstatement'));
  const decisionPlan = { ...weakPlan, leadershipBody: 'The decision has been implemented and completed.' };
  narrative = aiPlanToNarrative(weak.data, weak.deterministicContent, decisionPlan);
  assert.ok(validatePremiumReportNarrative(narrative, weak.evidence).issues.some((issue) => issue.code === 'decision_action_confusion'));
});

await test('E16: unsupported numbers, maturity/exposure claims, emails and secrets remain blocked', () => {
  const bodies = [
    ['The overall score is 999.', 'unsupported_numeric_claim'],
    ['The organisation is Strategic overall.', 'overall_maturity_contradiction'],
    ['The organisation has Severe exposure.', 'exposure_band_contradiction'],
    ['Contact attacker@example.test for the API key.', 'email_address_leakage']
  ];
  for (const [body, expected] of bodies) {
    const plan = { ...weakPlan, executiveBody: body };
    const narrative = aiPlanToNarrative(weak.data, weak.deterministicContent, plan);
    assert.ok(validatePremiumReportNarrative(narrative, weak.evidence).issues.some((issue) => issue.code === expected), `${expected} not emitted`);
  }
});

await test('E17: clean assurance and high-exposure assurance language invent no control failure', () => {
  const highData = structuredClone(clean.data);
  highData.scoreRun.exposureBand = 'High';
  highData.scoreRun.exposureScore = 78;
  highData.exposureAnswers = highData.exposureAnswers.map((answer) => ({ ...answer, selectedLabel: 'High', pointsAwarded: answer.maxPoints }));
  const high = buildContext(highData);
  const highPlan = validV4Plan(high, 'High Exposure Assurance Organisation');
  const combined = `${cleanPlan.executiveBody} ${highPlan.executiveBody} ${highPlan.falseComfortBody}`;
  assert.match(combined, /self-reported|self-assessment/i);
  assert.doesNotMatch(combined, /control failure|control failed|fraud occurred/i);
  assert.equal(validatePremiumReportAiEditorialPlan(highPlan, high.evidence, high.brief).ok, true);
});

await test('E18: AI and fallback preserve byte-identical deterministic advisory structures', async () => {
  const before = JSON.stringify(weak.advisoryModel);
  const generatorState = recordingGenerator(weakPlan);
  const storeState = recordingAttemptStore();
  const ai = await preparePremiumReportNarrative({ assembled: weak.data, deterministicContent: weak.deterministicContent, roadmap: weak.roadmap, advisoryModel: weak.advisoryModel, flags: ENABLED_FLAGS, generator: generatorState.generator, generationIdentity: 'authority-ai', attemptStore: storeState.store });
  const fallback = await preparePremiumReportNarrative({ assembled: weak.data, deterministicContent: weak.deterministicContent, roadmap: weak.roadmap, advisoryModel: weak.advisoryModel, flags: DISABLED_FLAGS, generationIdentity: 'authority-fallback' });
  assert.equal(JSON.stringify(weak.advisoryModel), before);
  assert.equal(JSON.stringify(ai.evidence.advisoryModel), JSON.stringify(fallback.evidence.advisoryModel));
  assert.notEqual(ai.selectedContent.executiveSummary.body, fallback.selectedContent.executiveSummary.body);
});

await test('E19: weak AI, weak fallback and clean AI render smoke produces valid HTML and PDF buffers', async () => {
  const cases = [
    [weak, ENABLED_FLAGS, weakPlan, 'weak-ai'],
    [weak, DISABLED_FLAGS, weakPlan, 'weak-fallback'],
    [clean, ENABLED_FLAGS, cleanPlan, 'clean-ai']
  ];
  for (const [context, flags, plan, label] of cases) {
    const generatorState = recordingGenerator(plan);
    const storeState = recordingAttemptStore();
    const prepared = await preparePremiumReportNarrative({ assembled: context.data, deterministicContent: context.deterministicContent, roadmap: context.roadmap, advisoryModel: context.advisoryModel, flags, generator: generatorState.generator, generationIdentity: `render:${label}`, attemptStore: flags.aiNarrativeEnabled ? storeState.store : undefined });
    let html = '';
    const pdf = await renderValidatedCommercialPdf({ data: context.data, content: prepared.selectedContent, roadmap: context.roadmap, evidenceModel: context.advisoryModel }, {
      renderHtml: (...args) => { html = renderReportHtml(...args); return html; },
      renderPdf: async () => Buffer.from(`%PDF-1.7\n${label}${'R'.repeat(1200)}`)
    });
    assert.ok(html.length > 1000);
    assert.equal(pdf.subarray(0, 4).toString('ascii'), '%PDF');
    assert.ok(pdf.length > 1000);
    if (flags.aiNarrativeEnabled) assert.ok(html.includes(plan.executiveBody));
  }
});

await test('E20: migration extends the existing ledger, enforces one parent and changes no activation setting', () => {
  const sql = fs.readFileSync('supabase/migrations/20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql', 'utf8');
  assert.match(sql, /add column if not exists manual_generation_attempt_id/);
  assert.match(sql, /num_nonnulls\(fulfilment_id, manual_generation_attempt_id\) = 1/);
  assert.match(sql, /manual_order_id uuid/);
  assert.match(sql, /manual_assessment_id uuid/);
  assert.match(sql, /manual_score_run_id uuid/);
  assert.match(sql, /status = 'completed'[\s\S]*locked_at is not null/);
  assert.match(sql, /claim_manual_report_ai_attempt/);
  assert.match(sql, /settle_manual_report_ai_attempt/);
  assert.match(sql, /record_manual_report_narrative_provenance/);
  assert.doesNotMatch(sql, /set_phase14_ai_route_policy|premium_report_ai_narrative_enabled[^\n]*true|automatic_fulfilment[^\n]*true/i);
});

await test('E21: the exact pre-Checkpoint E Phase 1 schema remains deterministic-compatible only while AI is disabled', async () => {
  const prepared = await preparePremiumReportNarrative({
    assembled: clean.data,
    deterministicContent: clean.deterministicContent,
    roadmap: clean.roadmap,
    advisoryModel: clean.advisoryModel,
    flags: DISABLED_FLAGS,
    generationIdentity: 'pre-checkpoint-e-compatibility'
  });
  const db = { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find record_manual_report_narrative_provenance in the schema cache.' } }) };
  assert.equal(await persistManualNarrativeProvenance({ db, manualGenerationAttemptId: 'attempt-old-schema', prepared, flags: DISABLED_FLAGS }), null);
  await assert.rejects(
    persistManualNarrativeProvenance({ db, manualGenerationAttemptId: 'attempt-old-schema', prepared, flags: ENABLED_FLAGS }),
    (error) => error?.code === 'PGRST202'
  );
});

await test('E22: the stable quality-error contract survives production chunk boundaries', async () => {
  const crossChunkError = {
    code: 'commercial_quality_failed',
    violations: [{ code: 'QG_SCENARIO_MINIMUM_NOT_MET', severity: 'violation', message: 'Safe fixture violation.' }],
    warnings: [],
    safeMessage: 'Safe fixture message.'
  };
  assert.equal(isReportCommercialQualityError(crossChunkError), true);
  assert.equal(isReportCommercialQualityError({ ...crossChunkError, violations: null }), false);
  assert.equal(isReportCommercialQualityError(new Error('commercial_quality_failed')), false);
});

await test('E23: deterministic narrative grounding defects fail through the commercial-quality lifecycle', async () => {
  const invalidDeterministicContent = {
    ...clean.deterministicContent,
    executiveSummary: {
      ...clean.deterministicContent.executiveSummary,
      body: `${clean.deterministicContent.executiveSummary.body} Unsupported fixture number 999999.`
    }
  };
  await assert.rejects(
    preparePremiumReportNarrative({
      assembled: clean.data,
      deterministicContent: invalidDeterministicContent,
      roadmap: clean.roadmap,
      advisoryModel: clean.advisoryModel,
      flags: DISABLED_FLAGS,
      generationIdentity: 'deterministic-grounding-defect'
    }),
    (error) => isReportCommercialQualityError(error)
      && error.violations.every((issue) => issue.code === 'QG_QUALITY_EVALUATION_FAILED')
  );
});

await test('E24: advisory ordering, evidence shuffle invariance and checksum stability are explicit', () => {
  const evidence = structuredClone(weak.evidence);
  renameAuthoritativeEvidenceId(evidence, 'riskRegister', 0, 'risk', 'ZZZ-CRITICAL-RISK');
  renameAuthoritativeEvidenceId(evidence, 'riskRegister', evidence.advisoryModel.riskRegister.length - 1, 'risk', 'AAA-LOWER-RISK');
  renameAuthoritativeEvidenceId(evidence, 'contradictions', 0, 'contradiction', 'ZZZ-MOST-MATERIAL-CONTRADICTION');
  renameAuthoritativeEvidenceId(evidence, 'contradictions', 1, 'contradiction', 'AAA-LESS-MATERIAL-CONTRADICTION');
  renameAuthoritativeEvidenceId(evidence, 'leadershipDecisions', 0, 'decision', 'ZZZ-FIRST-DECISION');
  renameAuthoritativeEvidenceId(evidence, 'leadershipDecisions', 1, 'decision', 'AAA-SECOND-DECISION');
  renameAuthoritativeEvidenceId(evidence, 'roadmapActions', 0, 'roadmap', 'ZZZ-FIRST-ROADMAP-ACTION');
  renameAuthoritativeEvidenceId(evidence, 'roadmapActions', 1, 'roadmap', 'AAA-SECOND-ROADMAP-ACTION');

  const checksumBefore = evidenceChecksum(evidence);
  const brief = buildPremiumReportNarrativeBrief(evidence);
  assert.equal(evidenceChecksum(evidence), checksumBefore);

  const executiveRisks = brief.executive.requiredEvidenceRefs.filter((ref) => ref.startsWith('risk:'));
  assert.equal(executiveRisks[0], 'risk:ZZZ-CRITICAL-RISK');
  assert.ok(!executiveRisks.includes('risk:AAA-LOWER-RISK'));
  assert.equal(
    brief.falseComfort.requiredEvidenceRefs.find((ref) => ref.startsWith('contradiction:')),
    'contradiction:ZZZ-MOST-MATERIAL-CONTRADICTION'
  );
  assert.deepEqual(
    brief.leadership.requiredEvidenceRefs.filter((ref) => ref.startsWith('decision:')),
    evidence.advisoryModel.leadershipDecisions.slice(0, 3).map((entry) => `decision:${entry.id}`)
  );
  assert.deepEqual(
    brief.leadership.requiredEvidenceRefs.filter((ref) => ref.startsWith('roadmap:')),
    evidence.advisoryModel.roadmapActions.slice(0, 3).map((entry) => `roadmap:${entry.id}`)
  );

  const shuffled = { ...evidence, items: [...evidence.items].reverse() };
  assert.deepEqual(buildPremiumReportNarrativeBrief(shuffled), brief);

  const unresolved = structuredClone(evidence);
  unresolved.items = unresolved.items.filter((item) => item.id !== 'risk:ZZZ-CRITICAL-RISK');
  assert.throws(
    () => buildPremiumReportNarrativeBrief(unresolved),
    (error) => isReportCommercialQualityError(error)
      && error.violations.some((issue) => issue.code === 'QG_AI_NARRATIVE_BRIEF_INVALID')
  );
});

await test('E25: invalid narrative briefs fail commercially before every AI and provenance side effect', async () => {
  const invalidBrief = structuredClone(weak.brief);
  invalidBrief.executive.requiredEvidenceRefs = ['risk:does-not-exist'];
  assert.throws(
    () => assertPremiumReportNarrativeBrief(weak.evidence, invalidBrief),
    (error) => isReportCommercialQualityError(error)
      && error.violations.every((issue) => issue.code === 'QG_AI_NARRATIVE_BRIEF_INVALID')
  );

  const dbState = recordingManualDb();
  const generatorState = recordingGenerator(weakPlan);
  const storeState = recordingAttemptStore();
  const wired = manualDependencies(weak, {
    db: dbState.db,
    flags: ENABLED_FLAGS,
    generator: generatorState.generator,
    attemptStore: storeState.store
  });
  let provenanceCalls = 0;
  wired.dependencies.preparePremiumReportNarrative = (input) => preparePremiumReportNarrative(input, {
    buildNarrativeBrief: () => invalidBrief
  });
  wired.dependencies.persistManualNarrativeProvenance = async () => {
    provenanceCalls += 1;
    throw new Error('Invalid briefs must never reach provenance persistence.');
  };

  await assert.rejects(
    generateManualPhase1Report({
      orderReference: weak.data.orderReference,
      requestedBy: 'admin-1',
      requestKey: 'invalid-brief-no-side-effects',
      action: 'admin_generate'
    }, wired.dependencies),
    (error) => error?.reason === 'commercial_quality_failed'
  );
  assert.deepEqual(generatorState.calls, { generate: 0, repair: 0 });
  assert.deepEqual(storeState.calls, { authorize: 0, find: 0, count: 0, claim: 0, settle: 0 });
  assert.equal(provenanceCalls, 0);
});

await test('E26: executive, domain and gap bodies obey their exact section limits', () => {
  const cases = [
    {
      label: 'executive',
      brief: (() => {
        const value = structuredClone(weak.brief);
        value.executive.maxCharacters = 100;
        return value;
      })(),
      plan: { ...weakPlan, executiveBody: 'x'.repeat(101) },
      path: 'executiveBody'
    },
    {
      label: 'domain',
      brief: (() => {
        const value = structuredClone(weak.brief);
        value.domains[weakPlan.domainEvidence[0].domainCode].maxCharacters = 100;
        return value;
      })(),
      plan: (() => {
        const value = structuredClone(weakPlan);
        value.domainEvidence[0].body = 'x'.repeat(101);
        return value;
      })(),
      path: 'domainEvidence[0].body'
    },
    {
      label: 'gap',
      brief: weak.brief,
      plan: (() => {
        const value = structuredClone(weakPlan);
        value.gapEvidence[0].body = 'x'.repeat(1201);
        return value;
      })(),
      path: 'gapEvidence[0].body'
    }
  ];
  for (const fixture of cases) {
    const issue = validatePremiumReportAiEditorialPlan(fixture.plan, weak.evidence, fixture.brief).issues
      .find((candidate) => candidate.code === 'ai_section_body_too_long' && candidate.path === fixture.path);
    assert.ok(issue, `${fixture.label} section limit was not enforced at ${fixture.path}`);
  }
});

await test('E27: repair scope preserves every compliant byte and rejects ref, object or order drift after two calls', async () => {
  const invalid = { ...weakPlan, executiveBody: 'The organisation is Strategic overall.' };
  const successfulGenerator = recordingGenerator(invalid, weakPlan);
  const successfulStore = recordingAttemptStore();
  const successful = await preparePremiumReportNarrative(
    pipelineInput(weak, successfulGenerator, successfulStore, 'repair-scope-success')
  );
  assert.equal(successful.mode, 'ai_repair');
  assert.deepEqual(successfulGenerator.calls, { generate: 1, repair: 1 });
  assert.deepEqual(successfulGenerator.inputs.repair[0].repairScope.failedSectionIds, ['executive']);
  assert.deepEqual(successful.generation.output.domainEvidence, successful.repairGeneration.output.domainEvidence);
  assert.deepEqual(successful.generation.output.gapEvidence, successful.repairGeneration.output.gapEvidence);
  assert.equal(successful.generation.output.falseComfortBody, successful.repairGeneration.output.falseComfortBody);
  assert.deepEqual(successful.generation.output.falseComfortEvidenceRefs, successful.repairGeneration.output.falseComfortEvidenceRefs);
  assert.equal(successful.generation.output.leadershipBody, successful.repairGeneration.output.leadershipBody);
  assert.deepEqual(successful.generation.output.leadershipEvidenceRefs, successful.repairGeneration.output.leadershipEvidenceRefs);

  const repairPrompt = buildPremiumReportRepairPrompt(successfulGenerator.inputs.repair[0]);
  assert.match(repairPrompt, /EXACT FAILED SECTION IDS\n\["executive"\]/);
  assert.ok(repairPrompt.includes(JSON.stringify(invalid)));
  assert.match(repairPrompt, /byte-for-byte/);

  const changedDomain = structuredClone(weakPlan);
  changedDomain.domainEvidence[0].body = `${changedDomain.domainEvidence[0].body} Its existing evidence remains subject to executive review.`;

  const changedRefs = structuredClone(weakPlan);
  const changedDomainCode = changedRefs.domainEvidence[0].domainCode;
  const allowedNewRef = weak.brief.domains[changedDomainCode].allowedEvidenceRefs
    .find((ref) => !changedRefs.domainEvidence[0].evidenceRefs.includes(ref));
  assert.ok(allowedNewRef);
  changedRefs.domainEvidence[0].evidenceRefs.push(allowedNewRef);

  const reorderedDomains = structuredClone(weakPlan);
  [reorderedDomains.domainEvidence[0], reorderedDomains.domainEvidence[1]] =
    [reorderedDomains.domainEvidence[1], reorderedDomains.domainEvidence[0]];

  const reorderedGaps = structuredClone(weakPlan);
  [reorderedGaps.gapEvidence[0], reorderedGaps.gapEvidence[1]] =
    [reorderedGaps.gapEvidence[1], reorderedGaps.gapEvidence[0]];

  const failedSectionRefOnCompliantDomain = structuredClone(weakPlan);
  const executiveOnlyRef = weak.brief.executive.requiredEvidenceRefs.find(
    (ref) => !weak.brief.domains[changedDomainCode].allowedEvidenceRefs.includes(ref)
  );
  assert.ok(executiveOnlyRef);
  failedSectionRefOnCompliantDomain.domainEvidence[0].evidenceRefs.push(executiveOnlyRef);

  for (const [label, repairedPlan] of [
    ['domain body', changedDomain],
    ['compliant refs', changedRefs],
    ['domain order', reorderedDomains],
    ['gap order', reorderedGaps],
    ['failed-section evidence on a compliant section', failedSectionRefOnCompliantDomain]
  ]) {
    const generatorState = recordingGenerator(invalid, repairedPlan);
    const storeState = recordingAttemptStore();
    const prepared = await preparePremiumReportNarrative(
      pipelineInput(weak, generatorState, storeState, `repair-preservation-${label}`)
    );
    assert.equal(prepared.mode, 'deterministic_fallback', `${label} was accepted`);
    assert.equal(prepared.fallbackReason, 'ai_repair_preservation_failed');
    assert.ok(prepared.repairValidation.issues.some((issue) => issue.code === 'repair_modified_compliant_section'));
    assert.deepEqual(generatorState.calls, { generate: 1, repair: 1 });
    assert.equal(storeState.calls.claim, 2);
  }
});

await test('E28: official response-state validation distinguishes values 0 through 5', () => {
  const questionCode = weakPlan.gapEvidence[0].questionCode;
  function responseIssues(responseValue, body) {
    const evidence = structuredClone(weak.evidence);
    evidence.items
      .filter((item) => item.questionCode === questionCode && (item.kind === 'gap' || item.kind === 'question_response'))
      .forEach((item) => { item.value.responseValue = responseValue; });
    const plan = structuredClone(weakPlan);
    plan.gapEvidence[0].body = body;
    const narrative = aiPlanToNarrative(weak.data, weak.deterministicContent, plan);
    return validatePremiumReportNarrative(narrative, evidence).issues
      .filter((issue) => issue.code === 'response_label_misstatement');
  }

  const matrix = [
    [0, 'The control is implemented and in use.', true],
    [2, 'The process is operating.', true],
    [3, 'The control is consistently operating.', true],
    [4, 'The control is embedded and continuously improved.', true],
    [5, 'The control is embedded and improved.', false],
    [3, 'The control is implemented and in use.', false],
    [4, 'The control is consistently operating.', false]
  ];
  for (const [responseValue, body, shouldFail] of matrix) {
    assert.equal(responseIssues(responseValue, body).length > 0, shouldFail, `response ${responseValue}: ${body}`);
  }
  for (const responseValue of [3, 4, 5]) {
    assert.ok(
      responseIssues(responseValue, 'The control is absent, not implemented and merely planned.').length > 0,
      `response ${responseValue} was allowed to be described as absent`
    );
  }

  const mixedEvidence = structuredClone(weak.evidence);
  const domainEntry = weakPlan.domainEvidence.find((entry) => {
    const citedResponses = mixedEvidence.items.filter(
      (item) => entry.evidenceRefs.includes(item.id) && item.kind === 'question_response'
    );
    return citedResponses.length > 1;
  });
  assert.ok(domainEntry);
  const citedDomainResponses = mixedEvidence.items.filter(
    (item) => domainEntry.evidenceRefs.includes(item.id) && item.kind === 'question_response'
  );
  citedDomainResponses.forEach((item, index) => { item.value.responseValue = index % 2 === 0 ? 3 : 5; });
  const mixedPlan = structuredClone(weakPlan);
  mixedPlan.domainEvidence.find((entry) => entry.domainCode === domainEntry.domainCode).body =
    'The controls in this domain are embedded and improved.';
  const mixedNarrative = aiPlanToNarrative(weak.data, weak.deterministicContent, mixedPlan);
  assert.ok(
    validatePremiumReportNarrative(mixedNarrative, mixedEvidence).issues
      .some((issue) => issue.code === 'response_label_misstatement'),
    'A mixed-state domain was allowed to claim one blanket operating state.'
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
