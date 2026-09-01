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
  interpretationToCommentary
} from '@/lib/reports/comprehensive/interpretation';
import { renderComprehensiveManagementReportHtml } from '@/lib/reports/comprehensive/render-comprehensive-html';
import { renderHtmlToPdfBuffer } from '@/lib/reports/render-pdf';
import { getMaturityBand } from '@/lib/scoring/maturity-band';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const QA_BRANCH = 'work/comprehensive-report-quality-20260901';

/**
 * Synthetic owner-review PDF. Preview-only, branch-locked, no DB/storage/order
 * imports. The exact customer-facing Comprehensive renderer is used.
 */
export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== QA_BRANCH) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data } = buildV12ProfileAssembled('motheo');
  const assessmentScope = comprehensiveAssessmentScopeFromData(data);
  const evidence = buildAdvisoryEvidenceModel(data);
  const customerEvidence = adaptComprehensiveEvidenceModel(evidence);
  const pack = buildEssentialNarrativeFactPack(
    data,
    customerEvidence,
    buildEssentialProjection(data, customerEvidence)
  );
  if (typeof pack.assessment.score !== 'number' || !pack.assessment.maturity) {
    return NextResponse.json({ error: 'unscored_assessment' }, { status: 409 });
  }

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
  const brief = buildInterpretationBrief({
    model,
    organisationName: pack.organisation.name,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    assessmentScope,
    domains
  });

  const run = await generateComprehensiveInterpretation(brief);
  assertComprehensiveInterpretationAccepted(run);

  const html = renderComprehensiveManagementReportHtml({
    model,
    organisationName: pack.organisation.name,
    assessmentReference: pack.assessment.reference,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    assessmentScope,
    domains: domains.map((domain) => ({
      title: domain.name,
      score: domain.score,
      band: domain.band
    })),
    commentary: interpretationToCommentary(run.interpretation)
  });

  const pdf = await renderHtmlToPdfBuffer(html, {
    footerLabel: `MK Fraud Readiness Comprehensive: ${pack.organisation.name}`
  });

  console.info('comprehensive_v12_owner_review_pdf', {
    organisation: pack.organisation.name,
    score: pack.assessment.score,
    maturity: pack.assessment.maturity,
    mode: model.narrativeMode,
    calls: run.accounting.calls,
    repairs: run.accounting.repairs,
    model: run.accounting.model,
    totalTokens: run.accounting.totalTokens,
    costMicros: run.accounting.costMicros,
    issues: run.issues.length,
    bytes: pdf.length
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="MK-Comprehensive-V12-Motheo-Owner-Review.pdf"',
      'Cache-Control': 'no-store, max-age=0',
      'X-MK-Provider-Calls': String(run.accounting.calls),
      'X-MK-Provider-Repairs': String(run.accounting.repairs),
      'X-MK-Validation-Issues': String(run.issues.length)
    }
  });
}
