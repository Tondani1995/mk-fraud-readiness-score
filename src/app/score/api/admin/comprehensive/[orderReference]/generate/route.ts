import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { getAdminSession } from '@/lib/auth/admin-route';
import { generateComprehensivePackage } from '@/lib/comprehensive/generation-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('quality_review');
  if (frozen) return frozen;
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  let presentation;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const file = form?.get('executivePresentation');
    if (file && typeof file !== 'string') {
      const bytes = new Uint8Array(await file.arrayBuffer());
      presentation = {
        bytes,
        fileName: file.name,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' as const
      };
    }
  }
  const result = await generateComprehensivePackage({ orderReference: params.orderReference, actor: { id: admin.id, role: admin.role }, executivePresentation: presentation });
  if (!result.ok) {
    const status = result.reason === 'forbidden' ? 403 : result.reason === 'engagement_not_found' ? 404 : result.reason === 'presentation_upload_required' || result.reason === 'review_incomplete' || result.reason === 'manuscript_approval_required' ? 409 : 500;
    return NextResponse.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
