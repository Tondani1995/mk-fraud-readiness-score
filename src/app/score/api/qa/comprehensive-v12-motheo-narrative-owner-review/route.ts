import { NextResponse } from 'next/server';

import { buildV12ProfileAssembled } from '@/lib/qa/comprehensive-v12-quality-profiles';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { generateComprehensiveNarrativeReport } from '@/lib/reports/comprehensive/narrative-generation';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const QA_BRANCH = 'qa/comprehensive-motheo-owner-review-20260901';

/**
 * Synthetic owner-review evidence capture for the manuscript-first Comprehensive
 * renderer. Preview-only and branch-locked. No database, storage, order mutation
 * or email. The JSON envelope exists only so the exact accepted PDF and manuscript
 * can be preserved as QA evidence without binary corruption through the connector.
 */
export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== QA_BRANCH) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data } = buildV12ProfileAssembled('motheo');
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const result = await generateComprehensiveNarrativeReport({ assembled: data, evidenceModel });
  const meta = result.narrativeRun.writerMetadata;
  const semanticCalls = result.semanticSafety?.totalProviderCalls ?? 0;
  const writerCalls = meta.recovery?.totalCalls ?? 1;
  const endToEndProviderCalls = Math.max(writerCalls, semanticCalls || writerCalls);

  const accounting = {
    architecture: meta.architecture,
    model: meta.model,
    provider: meta.provider,
    writerCalls,
    semanticCalls,
    endToEndProviderCalls,
    targetedRepairs: meta.recovery?.targetedRepairCount ?? 0,
    coherencePasses: meta.recovery?.coherenceCount ?? 0,
    semanticSafety: result.semanticSafety,
    totalTokens: meta.totalTokens ?? null,
    writerCostMicros: meta.providerCostMicros ?? null,
    pdfBytes: result.pdf.length
  };

  console.info('comprehensive_v12_motheo_manuscript_owner_review_capture', {
    organisation: data.organisationName,
    score: data.scoreRun.overallScore,
    maturity: data.scoreRun.finalMaturity,
    ...accounting
  });

  return NextResponse.json({
    schemaVersion: 'mk-comprehensive-v12-owner-review-capture-v1',
    organisation: data.organisationName,
    assessmentReference: data.assessmentReference,
    score: data.scoreRun.overallScore,
    maturity: data.scoreRun.finalMaturity,
    accounting,
    manuscriptMarkdown: result.narrativeRun.markdown,
    html: result.html,
    pdfBase64: result.pdf.toString('base64')
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-MK-Architecture': String(meta.architecture),
      'X-MK-Model': String(meta.model),
      'X-MK-End-To-End-Provider-Calls': String(endToEndProviderCalls)
    }
  });
}
