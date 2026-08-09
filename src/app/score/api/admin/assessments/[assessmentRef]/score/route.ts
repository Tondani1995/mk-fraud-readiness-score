import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { requireAdmin } from '@/lib/auth/admin-route';
import { scoreSubmittedAssessment } from '@/lib/scoring/score-assessment';

export async function POST(_request: Request, context: { params: Promise<{ assessmentRef: string }> }) {
  const frozen = await getRc1OperationFreezeResponse('assessment_score');
  if (frozen) return frozen;

  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver']);
  const result = await scoreSubmittedAssessment((await context.params).assessmentRef, {
    runType: 'initial',
    createdByAdminId: admin.id
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, errors: result.errors, result: 'result' in result ? result.result : undefined }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    assessmentReference: result.assessmentReference,
    scoreRunId: result.scoreRunId,
    runNumber: result.runNumber,
    summary: result.result.summary
  });
}
