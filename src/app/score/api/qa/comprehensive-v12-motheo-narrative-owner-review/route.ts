import { NextResponse } from 'next/server';

import { buildV12ProfileAssembled } from '@/lib/qa/comprehensive-v12-quality-profiles';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { generateComprehensiveNarrativeReport } from '@/lib/reports/comprehensive/narrative-generation';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const QA_BRANCH = 'qa/comprehensive-motheo-owner-review-20260901';

/**
 * Synthetic owner-review proof for the manuscript-first Comprehensive renderer.
 * Preview-only and branch-locked. No database, storage, order mutation or email.
 */
export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== QA_BRANCH) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data } = buildV12ProfileAssembled('motheo');
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const result = await generateComprehensiveNarrativeReport({ assembled: data, evidenceModel });
  const meta = result.narrativeRun.writerMetadata;

  console.info('comprehensive_v12_motheo_manuscript_owner_review', {
    organisation: data.organisationName,
    score: data.scoreRun.overallScore,
    maturity: data.scoreRun.finalMaturity,
    architecture: meta.architecture,
    model: meta.model,
    provider: meta.provider,
    totalCalls: meta.recovery?.totalCalls ?? 1,
    targetedRepairs: meta.recovery?.targetedRepairCount ?? 0,
    coherencePasses: meta.recovery?.coherenceCount ?? 0,
    semanticSafety: result.semanticSafety,
    totalTokens: meta.totalTokens,
    costMicros: meta.providerCostMicros,
    bytes: result.pdf.length
  });

  return new Response(new Uint8Array(result.pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="MK-Comprehensive-V12-Motheo-Narrative-Owner-Review.pdf"',
      'Cache-Control': 'no-store, max-age=0',
      'X-MK-Architecture': String(meta.architecture),
      'X-MK-Model': String(meta.model),
      'X-MK-Provider-Calls': String(meta.recovery?.totalCalls ?? 1),
      'X-MK-Targeted-Repairs': String(meta.recovery?.targetedRepairCount ?? 0)
    }
  });
}
