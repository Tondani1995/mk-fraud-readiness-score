import { NextResponse } from 'next/server';

import { buildV12ProfileAssembled } from '@/lib/qa/comprehensive-v12-quality-profiles';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { buildEssentialProjection } from '@/lib/reports/essential-projection';
import { buildEssentialNarrativeFactPack } from '@/lib/reports/narrative/fact-pack';
import { assembleComprehensive } from '@/lib/reports/comprehensive/assembly';
import { buildComprehensiveManagementModel } from '@/lib/reports/comprehensive/management-model';
import {
  adaptComprehensiveEvidenceModel,
  adaptComprehensiveScenarioFacts
} from '@/lib/reports/comprehensive/customer-visible-adaptation';
import { comprehensiveAssessmentScopeFromData } from '@/lib/reports/comprehensive/assessment-scope';
import {
  buildInterpretationBrief,
  generateComprehensiveInterpretation,
  assertComprehensiveInterpretationAccepted,
  ComprehensiveInterpretationAcceptanceError
} from '@/lib/reports/comprehensive/interpretation';
import { getMaturityBand } from '@/lib/scoring/maturity-band';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const QA_BRANCH = 'work/comprehensive-report-quality-20260901';
const MODEL = 'openai/gpt-5.6-luna';

/**
 * Owner-authorised one-call QA route.
 *
 * It is deliberately impossible to execute in Production and does not import,
 * initialise or call Supabase, storage or fulfilment code. It uses only the
 * synthetic Motheo V1.2 profile and the frozen Comprehensive interpretation
 * contract. Zero repair calls are permitted.
 */
export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== QA_BRANCH) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data, score, profile } = buildV12ProfileAssembled('motheo');
  const assessmentScope = comprehensiveAssessmentScopeFromData(data);
  const evidence = buildAdvisoryEvidenceModel(data);
  const customerEvidence = adaptComprehensiveEvidenceModel(evidence);
  const projection = buildEssentialProjection(data, customerEvidence);
  const pack = buildEssentialNarrativeFactPack(data, customerEvidence, projection);
  const domains = pack.domains
    .filter((domain) => typeof domain.score === 'number')
    .map((domain) => ({
      name: domain.name,
      score: domain.score as number,
      band: getMaturityBand(domain.score as number)
    }));

  const model = buildComprehensiveManagementModel(
    assembleComprehensive(customerEvidence, {
      scenarioFacts: adaptComprehensiveScenarioFacts(pack.scenarios),
      domains
    })
  );

  if (model.narrativeMode !== 'SUSTAINMENT') {
    return NextResponse.json({
      status: 'PRE_PROVIDER_REJECTED',
      reason: 'Motheo no longer resolves to SUSTAINMENT.',
      providerCalls: 0,
      repairs: 0
    }, { status: 409 });
  }

  const brief = buildInterpretationBrief({
    model,
    organisationName: pack.organisation.name,
    score: pack.assessment.score as number,
    maturity: pack.assessment.maturity,
    assessmentScope,
    domains
  });

  const run = await generateComprehensiveInterpretation(brief, {
    model: MODEL,
    maxRepairsPerSlot: 0,
    timeoutMs: 55_000
  });

  let accepted = true;
  let acceptanceIssueCodes: string[] = [];
  try {
    assertComprehensiveInterpretationAccepted(run, { maxCalls: 1, maxRepairs: 0 });
  } catch (error) {
    accepted = false;
    if (error instanceof ComprehensiveInterpretationAcceptanceError) {
      acceptanceIssueCodes = error.issueCodes;
    } else {
      throw error;
    }
  }

  return NextResponse.json({
    status: accepted ? 'ACCEPTED' : 'REJECTED',
    profile: 'motheo',
    organisation: profile.organisationName,
    model: MODEL,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    narrativeMode: model.narrativeMode,
    resultStatus: score.resultStatus,
    assessmentScope,
    providerCallsAuthorised: 1,
    repairsAuthorised: 0,
    databaseReads: 0,
    databaseWrites: 0,
    storageWrites: 0,
    accounting: run.accounting,
    issues: run.issues,
    acceptanceIssueCodes,
    interpretation: run.interpretation
  }, { status: accepted ? 200 : 422 });
}
