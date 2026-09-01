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
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const QA_BRANCH = 'work/comprehensive-report-quality-20260901';

/**
 * Owner-authorised synthetic live-quality proof.
 *
 * Preview-only and branch-locked. It imports no Supabase, storage, payment,
 * order or fulfilment service. Provider calls are governed exclusively by the
 * same bounded recovery policy now used by Comprehensive manual fulfilment.
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
      providerCalls: 0
    }, { status: 409 });
  }
  if (typeof pack.assessment.score !== 'number' || !pack.assessment.maturity) {
    return NextResponse.json({
      status: 'PRE_PROVIDER_REJECTED',
      reason: 'Motheo fact pack lost its scored assessment position.',
      providerCalls: 0
    }, { status: 409 });
  }

  const brief = buildInterpretationBrief({
    model,
    organisationName: pack.organisation.name,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    assessmentScope,
    domains
  });

  const run = await generateComprehensiveInterpretation(brief);

  let accepted = true;
  let acceptanceIssueCodes: string[] = [];
  try {
    assertComprehensiveInterpretationAccepted(run);
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
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    narrativeMode: model.narrativeMode,
    resultStatus: score.resultStatus,
    assessmentScope,
    providerPolicy: 'Essential-aligned bounded recovery',
    databaseReads: 0,
    databaseWrites: 0,
    storageWrites: 0,
    accounting: run.accounting,
    issues: run.issues,
    acceptanceIssueCodes,
    interpretation: run.interpretation
  }, {
    status: accepted ? 200 : 422,
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}
