import { NextResponse } from 'next/server';
import { assertPremiumReportDevelopmentMode } from '@/lib/reports/email/premium-report-development-mode';
import { createAiSdkPremiumReportNarrativeGenerator } from '@/lib/reports/automation/ai-sdk-generator';
import { StructuredOutputGenerationError } from '@/lib/reports/automation/structured-output-diagnostics';
import { PREMIUM_REPORT_PROMPT_VERSION, PREMIUM_REPORT_SCHEMA_VERSION } from '@/lib/reports/automation/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

const section = (sectionId: string) => ({
  sectionId,
  purpose: 'Non-commercial structured-output probe.',
  requiredEvidenceRefs: ['probe:e1'],
  allowedEvidenceRefs: ['probe:e1'],
  requiredThemes: ['grounded wording only'],
  prohibitedThemes: ['invented facts'],
  maxCharacters: 2000
});

export async function POST(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  try {
    assertPremiumReportDevelopmentMode();
    const body = await request.json().catch(() => ({}));
    if (body?.probe !== 'pre-g30-structured-output') {
      return NextResponse.json({ ok: false, error: 'probe_marker_required' }, { status: 400 });
    }
    const result = await createAiSdkPremiumReportNarrativeGenerator('openai/gpt-5.5').generate({
      evidence: {
        schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
        assessmentReference: 'PRE-G30-NONCOMMERCIAL',
        organisationName: 'Non-commercial Preview probe',
        packageName: 'Probe',
        scoreRunId: 'probe-score-run',
        methodologyAuthority: 'deterministic',
        items: [{ id: 'probe:e1', kind: 'assessment_limitation', label: 'Probe limitation', value: { statement: 'Probe evidence only.' } }]
      },
      evidenceChecksum: '0'.repeat(64),
      narrativeBrief: {
        version: 'mk-essential-narrative-brief-v1',
        executive: section('executive'),
        falseComfort: section('falseComfort'),
        leadership: section('leadership'),
        domains: {},
        gaps: {}
      },
      promptVersion: PREMIUM_REPORT_PROMPT_VERSION,
      schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION
    });
    return NextResponse.json({
      ok: true,
      probe: 'pre-g30-structured-output',
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
      gatewayGenerationId: result.gateway?.generationId ?? null,
      gatewayIdentitySource: result.gateway?.identitySource ?? null,
      commercialSideEffects: false
    });
  } catch (error) {
    if (error instanceof StructuredOutputGenerationError) {
      return NextResponse.json({
        ok: false,
        error: error.diagnostics.status,
        diagnostics: error.diagnostics,
        provider: error.provider,
        model: error.model,
        usage: error.usage,
        gatewayGenerationId: error.gateway?.generationId ?? null,
        commercialSideEffects: false
      }, { status: 502 });
    }
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.name : 'probe_failed',
      safeMessage: 'Probe failed before a structured-output diagnostic was available.',
      commercialSideEffects: false
    }, { status: 502 });
  }
}
