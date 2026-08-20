import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { submitComprehensiveEvidence } from '@/lib/comprehensive/evidence-service';
import { EVIDENCE_MAX_BYTES } from '@/lib/commercial/evidence-policy';

/**
 * Comprehensive client-evidence intake.
 *
 * A focused upload surface, not a client portal: it accepts one file per request, binds it to the
 * engagement resolved FROM the token-validated assessment, and returns metadata only. No public URL
 * and no signed URL is produced, and the file never becomes readable by anon or authenticated.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function deny(errors: string[], status: number) {
  return NextResponse.json({ ok: false, errors }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('assessment_write');
  if (frozen) return frozen;

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return deny(['Evidence must be submitted as a multipart form upload.'], 415);
  }

  // Reject on the declared length before reading the body, so an oversized upload is not buffered.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > EVIDENCE_MAX_BYTES + 8_192) {
    return deny(['The evidence file is larger than the accepted limit.'], 413);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return deny(['The evidence upload could not be read.'], 400);

  const snapshotToken = form.get('snapshotToken');
  if (typeof snapshotToken !== 'string' || !snapshotToken) {
    return deny(['Private snapshot link required.'], 403);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return deny(['An evidence file is required.'], 400);

  const validation = await validateSnapshotToken({
    assessmentReference: params.assessmentRef,
    rawToken: snapshotToken,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    consume: false
  });

  if (!validation.ok) return deny(['Private snapshot link required.'], 403);

  const buffer = await file.arrayBuffer();

  const result = await submitComprehensiveEvidence({
    assessment: validation.assessment,
    respondent: validation.respondent,
    filename: file.name,
    contentType: file.type,
    sizeBytes: buffer.byteLength,
    evidenceLabel: form.get('evidenceLabel'),
    fileBody: buffer
  });

  if (!result.ok) {
    const status = result.reason === 'rejected_by_policy'
      ? 400
      : result.reason === 'engagement_not_found'
        ? 404
        : result.reason === 'engagement_not_accepting_evidence'
          ? 409
          : 500;
    return NextResponse.json(
      { ok: false, reason: result.reason, errors: [result.message] },
      { status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      evidence: {
        id: result.evidence.id,
        originalFilename: result.evidence.originalFilename,
        evidenceLabel: result.evidence.evidenceLabel,
        contentType: result.evidence.contentType,
        sizeBytes: result.evidence.sizeBytes,
        uploadedAt: result.evidence.uploadedAt,
        validationStatus: result.evidence.validationStatus
      },
      message: 'Evidence received. It is stored privately and will be validated by the named reviewer. Supplying evidence does not by itself validate a control.'
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
