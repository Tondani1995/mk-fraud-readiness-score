import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { createOrGetOrderForReportRequest } from '@/lib/orders/manual-eft-orders';
import { validateSnapshotToken } from '@/lib/respondent/tokens';

export async function POST(request: Request, { params }: { params: { assessmentRef: string } }) {
  const service = createSupabaseServiceClient() as any;
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!body?.snapshotToken) {
    return NextResponse.json({ ok: false, errors: ['Private snapshot link required to request a detailed report.'] }, { status: 403 });
  }

  if (body?.consentContact !== true) {
    return NextResponse.json({ ok: false, errors: ['Consent is required before MK can deliver the report or follow up on this report request.'] }, { status: 400 });
  }

  const snapshotValidation = await validateSnapshotToken({
    assessmentReference: params.assessmentRef,
    rawToken: body.snapshotToken,
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    consume: false
  });

  if (!snapshotValidation.ok) {
    return NextResponse.json({ ok: false, errors: ['Private snapshot link required to request a detailed report.'] }, { status: 403 });
  }

  const assessment = snapshotValidation.assessment;

  const [{ data: organisation }, { data: respondent }] = await Promise.all([
    service.from('organisations').select('legal_name,trading_name').eq('id', assessment.organisation_id).maybeSingle(),
    assessment.primary_respondent_id
      ? service.from('respondents').select('id,email,full_name').eq('id', assessment.primary_respondent_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const email = body?.email ?? respondent?.email ?? null;

  const { data: existingRequest } = await service
    .from('data_requests')
    .select('id,status,requested_by_email,created_at')
    .eq('assessment_id', assessment.id)
    .eq('request_type', 'detailed_report_request')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let dataRequest = existingRequest;

  if (!dataRequest) {
    const { data: insertedRequest, error: requestError } = await service
      .from('data_requests')
      .insert({
        assessment_id: assessment.id,
        organisation_id: assessment.organisation_id,
        respondent_id: assessment.primary_respondent_id,
        request_type: 'detailed_report_request',
        status: 'received',
        requested_by_email: email,
        notes: `Detailed report requested from free snapshot for ${organisation?.legal_name ?? organisation?.trading_name ?? 'organisation'}.`
      })
      .select('id,status,requested_by_email,created_at')
      .single();

    if (requestError) return NextResponse.json({ ok: false, errors: [requestError.message] }, { status: 500 });
    dataRequest = insertedRequest;
  }

  await service
    .from('assessments')
    .update({ status: 'report_requested' })
    .eq('id', assessment.id)
    .in('status', ['scored', 'snapshot_available', 'report_requested']);

  const order = await createOrGetOrderForReportRequest({
    assessment,
    dataRequest,
    organisation,
    respondent
  });

  if (email) {
    await service.from('email_events').insert({
      assessment_id: assessment.id,
      recipient_email: email,
      template_key: 'detailed_report_request_received',
      status: 'queued'
    });
  }

  await service.from('audit_logs').insert({
    actor_type: 'respondent_token',
    assessment_id: assessment.id,
    entity_table: 'data_requests',
    entity_id: dataRequest?.id ?? assessment.id,
    action: existingRequest ? 'detailed_report_request_reconfirmed' : 'detailed_report_requested',
    after_json: {
      assessment_reference: assessment.assessment_reference,
      requested_by_email: email,
      source: 'free_snapshot',
      consent_contact: true,
      order_reference: order?.orderReference ?? null,
      payment_gateway: false,
      proof_upload: false,
      pdf_generation: false,
      report_unlock: false
    }
  });

  return NextResponse.json({
    ok: true,
    message: 'Your detailed report request has been received. MK Fraud Insights will confirm the next step before any detailed report is released.',
    order,
    manualConfirmationNote: 'Please use your order reference as the payment reference. MK Fraud Insights confirms EFT payments manually before any detailed report is released.'
  });
}
