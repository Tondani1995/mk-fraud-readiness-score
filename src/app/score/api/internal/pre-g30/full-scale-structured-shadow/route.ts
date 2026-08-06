import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleReportData } from '@/lib/reports/assemble-report-data';
import { selectContent } from '@/lib/reports/select-content-blocks';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { validatePremiumReportGenerationEntitlement } from '@/lib/reports/report-entitlement';
import {
  buildPremiumReportEvidencePack,
  evidenceChecksum,
  scanForPromptInjection,
  validatePremiumReportEvidencePack
} from '@/lib/reports/automation/evidence';
import {
  assertPremiumReportNarrativeBrief,
  buildPremiumReportNarrativeBrief
} from '@/lib/reports/automation/narrative-brief';
import { PREMIUM_REPORT_PROMPT_VERSION, PREMIUM_REPORT_SCHEMA_VERSION } from '@/lib/reports/automation/types';
import { createAiSdkPremiumReportNarrativeGenerator } from '@/lib/reports/automation/ai-sdk-generator';
import { validatePremiumReportAiEditorialPlan } from '@/lib/reports/automation/ai-plan-validation';
import { aiPlanToNarrative } from '@/lib/reports/automation/content';
import { validatePremiumReportNarrative } from '@/lib/reports/automation/validation';
import { authorizePremiumReportAiRoute } from '@/lib/reports/automation/ai-route-policy';
import {
  evaluateFullScaleShadowFence,
  PRE_G30_SHADOW_ASSESSMENT,
  PRE_G30_SHADOW_MODEL,
  PRE_G30_SHADOW_OPERATION,
  PRE_G30_SHADOW_ORDER,
  PRE_G30_SHADOW_PR_NUMBER,
  PRE_G30_SHADOW_PROJECT_ID,
  PRE_G30_SHADOW_PROVIDER,
  PRE_G30_SHADOW_SUPABASE_PROJECT,
  reconcileFullScaleShadowOutput
} from '@/lib/reports/automation/full-scale-shadow';
import { StructuredOutputGenerationError } from '@/lib/reports/automation/structured-output-diagnostics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabaseProjectFromUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1]?.toLowerCase() ?? '';
}

function runtimePullRequest() {
  return (process.env.VERCEL_GIT_PULL_REQUEST_ID
    ?? process.env.MK_RELEASE_PR_NUMBER
    ?? process.env.GITHUB_PR_NUMBER
    ?? '').trim();
}

function runtimeSha() {
  return (process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim().toLowerCase();
}

function cronAuthorised(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

function safeFailure(error: unknown) {
  if (error instanceof StructuredOutputGenerationError) {
    return {
      outcome: 'structured_output_failed',
      provider: error.provider,
      model: error.model,
      latencyMs: error.latencyMs,
      usage: error.usage ?? null,
      gateway: error.gateway ?? null,
      gatewayCostMicros: error.gatewayCostMicros ?? null,
      diagnostics: error.diagnostics
    };
  }
  return { outcome: 'shadow_failed', errorCategory: error instanceof Error ? error.name : 'unknown_error' };
}

async function executeShadow() {
  const db = createSupabaseServiceClient() as any;
  const assembled = await assembleReportData(PRE_G30_SHADOW_ORDER);
  if (assembled.assessmentReference !== PRE_G30_SHADOW_ASSESSMENT) throw new Error('retained_assessment_mismatch');
  const reportType = validatePremiumReportGenerationEntitlement(assembled);
  const { data: blocks, error: blockError } = await db
    .from('report_content_blocks')
    .select('block_key,block_type,domain_code,maturity_band,severity,title,body,status')
    .eq('status', 'active');
  if (blockError) throw blockError;
  const deterministicContent = selectContent(assembled, (blocks ?? []).map((block: any) => ({
    blockKey: block.block_key,
    blockType: block.block_type,
    domainCode: block.domain_code,
    maturityBand: block.maturity_band,
    severity: block.severity,
    title: block.title,
    body: block.body,
    status: block.status
  })));
  const advisoryModel = buildAdvisoryEvidenceModel(assembled);
  const evidence = buildPremiumReportEvidencePack(assembled, advisoryModel, PREMIUM_REPORT_SCHEMA_VERSION);
  const evidenceIssues = validatePremiumReportEvidencePack(evidence, [assembled.customerEmail, assembled.respondentName]);
  if (evidenceIssues.length > 0) throw new Error('evidence_pack_invalid');
  const brief = assertPremiumReportNarrativeBrief(evidence, buildPremiumReportNarrativeBrief(evidence));
  const expectedDomainCodes = Object.keys(brief.domains).sort();
  const expectedVisibilityGapCodes = Object.keys(brief.gaps).sort();
  if (expectedDomainCodes.length !== 10 || expectedVisibilityGapCodes.length !== 10) throw new Error('retained_shape_mismatch');
  if (scanForPromptInjection(evidence.organisationName).suspicious) throw new Error('prompt_injection_guard');
  const generator = createAiSdkPremiumReportNarrativeGenerator(PRE_G30_SHADOW_MODEL);
  const generation = await generator.generate({
    evidence,
    evidenceChecksum: evidenceChecksum(evidence),
    narrativeBrief: brief,
    promptVersion: PREMIUM_REPORT_PROMPT_VERSION,
    schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION
  });
  const planValidation = validatePremiumReportAiEditorialPlan(generation.output, evidence, brief);
  const narrative = aiPlanToNarrative(assembled, deterministicContent, generation.output);
  const narrativeValidation = validatePremiumReportNarrative(narrative, evidence);
  const reconciliation = reconcileFullScaleShadowOutput({
    output: generation.output,
    expectedDomainCodes,
    expectedVisibilityGapCodes
  });
  const accountingVerified = Number.isFinite(generation.usage?.inputTokens)
    && Number.isFinite(generation.usage?.outputTokens)
    && Number.isFinite(generation.usage?.totalTokens)
    && Number.isFinite(generation.usage?.estimatedCostMicros)
    && Number(generation.usage?.estimatedCostMicros) <= 500_000;
  const structuredOutputPassed = planValidation.ok && narrativeValidation.ok && reconciliation.complete;
  return {
    ok: Boolean(
      generation.gateway
      && generation.gateway.finalProvider === PRE_G30_SHADOW_PROVIDER
      && generation.gateway.resolvedProviderApiModelId
      && accountingVerified
      && generation.finishReason !== 'length'
      && generation.finishReason !== 'max_tokens'
      && structuredOutputPassed
    ),
    operation: PRE_G30_SHADOW_OPERATION,
    technicalReference: crypto.randomUUID(),
    provider: generation.provider,
    model: generation.model,
    gateway: generation.gateway ?? null,
    responseId: generation.responseId ?? null,
    finishReason: generation.finishReason ?? null,
    rawFinishReason: generation.rawFinishReason ?? null,
    usage: generation.usage ?? null,
    latencyMs: generation.latencyMs,
    rawOutputLength: generation.rawOutputLength ?? null,
    rawOutputSha256: generation.rawOutputSha256 ?? null,
    accountingVerified,
    structuredOutputPassed,
    schemaValidation: {
      plan: planValidation.ok,
      narrative: narrativeValidation.ok,
      issueCodes: [...planValidation.issues, ...narrativeValidation.issues].map((issue) => issue.code).slice(0, 64),
      issuePaths: [...planValidation.issues, ...narrativeValidation.issues].map((issue) => issue.path).slice(0, 64)
    },
    reconciliation,
    sideEffects: {
      commercialMutations: false,
      aiAttemptPersistence: false,
      reportPersistence: false,
      storageMutation: false,
      deliveryMutation: false,
      emailMutation: false
    },
    reportType
  };
}

export async function POST(request: Request) {
  if (!cronAuthorised(request)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const runtime = {
    vercelEnvironment: process.env.VERCEL_ENV ?? '',
    projectId: process.env.VERCEL_PROJECT_ID ?? '',
    supabaseProject: supabaseProjectFromUrl(),
    pullRequest: runtimePullRequest(),
    runtimeSha: runtimeSha(),
    provider: PRE_G30_SHADOW_PROVIDER,
    model: PRE_G30_SHADOW_MODEL
  };
  const fence = evaluateFullScaleShadowFence(runtime);
  if (!fence.allowed) return NextResponse.json({ ok: false, error: 'shadow_scope_refused', checks: fence.checks, reasons: fence.reasons }, { status: 409 });
  if (runtime.projectId !== PRE_G30_SHADOW_PROJECT_ID || runtime.pullRequest !== PRE_G30_SHADOW_PR_NUMBER || runtime.supabaseProject !== PRE_G30_SHADOW_SUPABASE_PROJECT) {
    return NextResponse.json({ ok: false, error: 'shadow_scope_refused' }, { status: 409 });
  }
  const authority = await authorizePremiumReportAiRoute({ provider: PRE_G30_SHADOW_PROVIDER, model: PRE_G30_SHADOW_MODEL });
  if (!authority.allowed) return NextResponse.json({ ok: false, error: 'ai_route_authority_denied', reason: authority.reason ?? 'denied' }, { status: 409 });
  try {
    const result = await executeShadow();
    return NextResponse.json({ ...result, fence: { ...fence.checks, authorityAllowed: true } }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error('pre_g30_full_scale_shadow_failed', { technicalReference: crypto.randomUUID(), ...safeFailure(error) });
    return NextResponse.json({ ok: false, ...safeFailure(error), sideEffects: { commercialMutations: false, aiAttemptPersistence: false, reportPersistence: false, storageMutation: false, deliveryMutation: false, emailMutation: false } }, { status: 502 });
  }
}
