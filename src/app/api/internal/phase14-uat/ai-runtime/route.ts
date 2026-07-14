import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { createAiNarrativeGenerator } from '@/lib/reports/automation/ai-sdk-generator';
import { getPremiumReportAutomationFlags } from '@/lib/reports/automation/feature-flags';
import type {
  NarrativeGenerationInput,
  NarrativeGenerationResult,
  PremiumReportNarrativeGenerator
} from '@/lib/reports/automation/types';
import { generatePremiumReport } from '@/lib/reports/premium-report-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 300;

const EXPECTED_BRANCH = 'phase14/autonomous-premium-report-engine';
const EXPECTED_UAT_REF = 'nlukprffbrqmvjcmygyr';
const EXPECTED_ASSESSMENT_ID = 'f6f03b0a-72df-45bb-ac84-3a56615f8d73';
const EXPECTED_SCORE_RUN_ID = '8540d731-afe9-444b-8850-c59060381677';
const AUTHORISATION_KEY = 'phase14_uat_ai_runtime';

const SCENARIOS = {
  success: {
    orderReference: 'MKORD-UAT-AI-SUCCESS',
    fulfilmentId: 'e8da46ea-d8b0-4c0e-92f2-48d9bc7108db',
    expectedMode: 'ai'
  },
  repair: {
    orderReference: 'MKORD-UAT-AI-REPAIR',
    fulfilmentId: '75b9e966-374a-4e91-a7f2-675e47af8b2a',
    expectedMode: 'ai_repair'
  },
  fallback: {
    orderReference: 'MKORD-UAT-AI-FALLBACK',
    fulfilmentId: 'b5012a55-4ee3-4756-a3b5-63936bdc176a',
    expectedMode: 'deterministic_fallback'
  }
} as const;

type Scenario = keyof typeof SCENARIOS;

function respond(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}

function fail(reason: string, status = 409, detail?: string) {
  return respond({ ok: false, reason, ...(detail ? { detail } : {}) }, status);
}

function invalidFirstPassGenerator(live: PremiumReportNarrativeGenerator): PremiumReportNarrativeGenerator {
  return {
    provider: live.provider,
    model: live.model,
    async generate(): Promise<NarrativeGenerationResult> {
      return {
        provider: live.provider,
        model: live.model,
        latencyMs: 0,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        output: {
          executiveDiagnosis: {
            title: 'Invalid controller-injected first pass',
            body: 'The industry benchmark is 99 percent and the organisation is fully compliant.',
            evidenceRefs: ['unknown:evidence']
          },
          falseComfort: {
            title: '',
            body: '',
            evidenceRefs: []
          },
          leadershipAttention: {
            body: '',
            evidenceRefs: []
          },
          domainNarratives: [],
          gapCommentary: []
        }
      };
    },
    repair(input: NarrativeGenerationInput) {
      return live.repair(input);
    }
  };
}

function injectedFailureGenerator(model: string): PremiumReportNarrativeGenerator {
  const failGeneration = async (): Promise<NarrativeGenerationResult> => {
    throw new Error('controller_injected_ai_provider_failure');
  };
  return {
    provider: 'controller-injected-failure',
    model,
    generate: failGeneration,
    repair: failGeneration
  };
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') return fail('preview_only', 403);
  if (process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) return fail('wrong_branch', 403);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!supabaseUrl.includes(`${EXPECTED_UAT_REF}.supabase.co`)) return fail('wrong_supabase_project', 403);

  const scenarioParam = new URL(request.url).searchParams.get('scenario');
  if (!scenarioParam || !(scenarioParam in SCENARIOS)) return fail('invalid_scenario', 400);
  const scenario = scenarioParam as Scenario;
  const fixture = SCENARIOS[scenario];

  const db = createSupabaseServiceClient() as any;
  const flags = await getPremiumReportAutomationFlags();
  if (flags.autoFulfilmentEnabled) return fail('auto_fulfilment_must_remain_disabled');
  if (!flags.aiNarrativeEnabled) return fail('ai_flag_not_enabled');
  if (flags.autoEmailEnabled) return fail('email_must_remain_disabled');
  if (flags.testRecipientOverride !== null) return fail('test_recipient_must_remain_null');

  const { data: rawSetting, error: settingError } = await db
    .from('app_settings')
    .select('value_json')
    .eq('setting_key', AUTHORISATION_KEY)
    .maybeSingle();
  if (settingError || !rawSetting) return fail('authorisation_unavailable', 500);

  const authorisation = rawSetting.value_json ?? {};
  const scenarioStates = authorisation.scenarios && typeof authorisation.scenarios === 'object'
    ? authorisation.scenarios as Record<string, string>
    : {};
  if (authorisation.authorised !== true) return fail('ai_uat_not_authorised', 403);
  if (authorisation.assessment_id !== EXPECTED_ASSESSMENT_ID || authorisation.score_run_id !== EXPECTED_SCORE_RUN_ID) {
    return fail('wrong_authorised_evidence', 403);
  }
  if (typeof authorisation.expires_at !== 'string' || Date.parse(authorisation.expires_at) <= Date.now()) {
    return fail('ai_uat_authorisation_expired', 403);
  }
  if (scenarioStates[scenario] !== 'authorised') return fail('scenario_not_authorised', 403);

  const { data: fixtureState, error: fixtureError } = await db
    .from('report_fulfilments')
    .select('id,status,report_id,score_run_id,assessment_id,orders!inner(order_reference,status,amount_cents,currency,product_id,products!inner(product_code,delivery_mode,requires_payment_verification))')
    .eq('id', fixture.fulfilmentId)
    .eq('orders.order_reference', fixture.orderReference)
    .maybeSingle();
  if (fixtureError || !fixtureState) return fail('fixture_not_found', 404, fixtureError?.message);
  if (
    fixtureState.status !== 'queued'
    || fixtureState.report_id != null
    || fixtureState.score_run_id !== EXPECTED_SCORE_RUN_ID
    || fixtureState.assessment_id !== EXPECTED_ASSESSMENT_ID
  ) return fail('fixture_not_ready');

  const order = Array.isArray(fixtureState.orders) ? fixtureState.orders[0] : fixtureState.orders;
  const product = Array.isArray(order?.products) ? order.products[0] : order?.products;
  if (
    order?.status !== 'payment_received'
    || order?.amount_cents !== 500000
    || order?.currency !== 'ZAR'
    || product?.product_code !== 'essential_self_assessment'
    || product?.delivery_mode !== 'mk_controlled_pdf'
    || product?.requires_payment_verification !== true
  ) return fail('fixture_not_eligible');

  const runningStates = { ...scenarioStates, [scenario]: 'running' };
  const { data: claimed, error: claimError } = await db
    .from('app_settings')
    .update({ value_json: { ...authorisation, scenarios: runningStates } })
    .eq('setting_key', AUTHORISATION_KEY)
    .contains('value_json', { authorised: true, scenarios: { [scenario]: 'authorised' } })
    .select('setting_key')
    .maybeSingle();
  if (claimError || !claimed) return fail('scenario_claim_failed', 409, claimError?.message);

  try {
    const live = createAiNarrativeGenerator(flags.model);
    const generator = scenario === 'success'
      ? live
      : scenario === 'repair'
        ? invalidFirstPassGenerator(live)
        : injectedFailureGenerator(flags.model);

    const result = await generatePremiumReport({
      orderReference: fixture.orderReference,
      fulfilmentId: fixture.fulfilmentId,
      actor: { actorType: 'system', action: 'admin_regenerate' },
      flags,
      generator
    });

    const { data: runs, error: runsError } = await db
      .from('report_generation_runs')
      .select('id,attempt_number,generation_mode,provider,model,status,error_code,input_token_count,output_token_count,total_token_count,latency_ms,validation_result_json,validation_errors_json,report_id')
      .eq('fulfilment_id', fixture.fulfilmentId)
      .order('attempt_number', { ascending: true });
    if (runsError) throw runsError;

    const completedStates = { ...runningStates, [scenario]: 'completed' };
    await db.from('app_settings').update({
      value_json: {
        ...authorisation,
        scenarios: completedStates,
        [`${scenario}_completed_at`]: new Date().toISOString(),
        [`${scenario}_report_id`]: result.reportId,
        [`${scenario}_mode`]: result.generationMode
      }
    }).eq('setting_key', AUTHORISATION_KEY);

    const safeRuns = (runs ?? []).map((run: any) => ({
      id: run.id,
      attemptNumber: run.attempt_number,
      mode: run.generation_mode,
      provider: run.provider,
      model: run.model,
      status: run.status,
      errorCode: run.error_code,
      inputTokens: run.input_token_count,
      outputTokens: run.output_token_count,
      totalTokens: run.total_token_count,
      latencyMs: run.latency_ms,
      validationOk: run.validation_result_json?.ok === true,
      validationIssueCount: Array.isArray(run.validation_errors_json) ? run.validation_errors_json.length : null,
      reportId: run.report_id
    }));

    const modeMatched = result.generationMode === fixture.expectedMode;
    return respond({
      ok: modeMatched,
      scenario,
      expectedMode: fixture.expectedMode,
      actualMode: result.generationMode,
      modeMatched,
      model: flags.model,
      reportId: result.reportId,
      reportReference: result.reportReference,
      versionNumber: result.versionNumber,
      supersededReportId: result.supersededReportId,
      evidenceChecksum: result.evidenceChecksum,
      readyForEmailDelivery: result.readyForEmailDelivery,
      emailEnabled: false,
      runs: safeRuns
    }, modeMatched ? 200 : 409);
  } catch (error) {
    const failedStates = { ...runningStates, [scenario]: 'failed' };
    await db.from('app_settings').update({
      value_json: {
        ...authorisation,
        scenarios: failedStates,
        [`${scenario}_failed_at`]: new Date().toISOString(),
        [`${scenario}_error`]: error instanceof Error ? error.message : 'unknown_error'
      }
    }).eq('setting_key', AUTHORISATION_KEY).catch(() => null);
    return fail('scenario_execution_failed', 500, error instanceof Error ? error.message : 'unknown_error');
  }
}
