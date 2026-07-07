import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST(request: Request, { params }: { params: { assessmentRef: string } }) {
  const service = createSupabaseServiceClient();
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { data: assessment, error: assessmentError } = await service
    .from('assessments')
    .select('id,assessment_reference,organisation_id,primary_respondent_id,status,current_score_run_id')
    .eq('assessment_reference', params.assessmentRef)
    .maybeSingle();

  if (assessmentError) return NextResponse.json({ ok: false, errors: [assessmentError.message] }, { status: 500 });
  if (!assessment) return NextResponse.json({ ok: false, errors: ['Assessment not found.'] }, { status: 404 });
  if (!assessment.current_score_run_id || !['scored', 'snapshot_available', 'report_requested'].includes(assessment.status)) {
    return NextResponse.json({ ok: false, errors: ['A detailed report can only be requested after the free snapshot is available.'] }, { status: 400 });
  }

  const [{ data: organisation }, { data: respondent }] = await Promise.all([
    service.from('organisations').select('legal_name,trading_name').eq('id', assessment.organisation_id).maybeSingle(),
    assessment.primary_respondent_id
      ? service.from('respondents').select('id,email,full_name').eq('id', assessment.primary_respondent_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const email = body?.email ?? respondent?.email ?? null;

  await service.from('data_requests').insert({
    assessment_id: assessment.id,
    organisation_id: assessment.organisation_id,
    respondent_id: assessment.primary_respondent_id,
    request_type: 'detailed_report_request',
    status: 'received',
    requested_by_email: email,
    notes: `Detailed report requested from free snapshot for ${organisation?.legal_name ?? organisation?.trading_name ?? 'organisation'}.`
  });

  await service
    .from('assessments')
    .update({ status: 'report_requested' })
    .eq('id', assessment.id)
    .in('status', ['scored', 'snapshot_available', 'report_requested']);

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
    entity_id: assessment.id,
    action: 'detailed_report_requested',
    after_json: {
      assessment_reference: assessment.assessment_reference,
      requested_by_email: email,
      source: 'free_snapshot'
    }
  });

  return NextResponse.json({ ok: true, message: 'Thank you. MK Fraud Insights will email the detailed report process and payment instructions to you.' });
}
