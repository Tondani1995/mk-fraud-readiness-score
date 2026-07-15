import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-route';
import { scoreSubmittedAssessment } from '@/lib/scoring/score-assessment';

export async function POST(_request: Request, context: { params: { assessmentRef: string } }) {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver']);
  const result = await scoreSubmittedAssessment(context.params.assessmentRef, {
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
