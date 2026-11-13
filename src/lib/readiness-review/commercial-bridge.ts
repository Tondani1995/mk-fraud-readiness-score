import { canonicalDigest } from './canonical';
import { buildStagedReportInput, STAGED_REPORT_INPUT_CONTRACT } from './report-input';
import { sessionForCommercialBinding } from './service';
import { requireRevisedCommercial } from './commercial-environment';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { createSnapshotTokenForAssessment } from '@/lib/respondent/tokens';
import { FRAUD_READINESS_TERMS_VERSION, PRIVACY_NOTICE_VERSION as FRAUD_READINESS_PRIVACY_NOTICE_VERSION } from '@/lib/legal/fraud-readiness-terms';

/**
 * B5: a completed revised assessment becomes an ordinary assessment record that the existing paid-order route,
 * payment confirmation, report generation, storage and customer download accept unchanged. The customer does not
 * answer again: the binding cites the stored answer log by digest and position, and every report is rebuilt from it.
 */

export type BindingRequest = {
  organisationLegalName: string;
  contactName: string;
  contactEmail: string;
  contactRole?: string;
  acceptTerms: boolean;
  ipAddress?: string | null;
};

export type BindingResult = {
  created: boolean;
  assessmentReference: string;
  snapshotToken: string;
  snapshotTokenExpiresAt: string;
  inputDigest: string;
  logDigest: string;
  actionCount: number;
  outstanding: number;
};

export class BindingRefused extends Error {
  readonly code: 'invalid_request' | 'interview_not_complete' | 'not_staged' | 'answers_changed' | 'disabled';
  readonly status: number;
  constructor(code: BindingRefused['code'], message: string, status = 409) {
    super(message);
    this.name = 'BindingRefused';
    this.code = code;
    this.status = status;
  }
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseBindingRequest(body: Record<string, unknown>, ipAddress: string | null): BindingRequest {
  const request: BindingRequest = {
    organisationLegalName: clean(body.organisationLegalName, 160),
    contactName: clean(body.contactName, 120),
    contactEmail: clean(body.contactEmail, 254).toLowerCase(),
    contactRole: clean(body.contactRole, 120) || undefined,
    acceptTerms: body.acceptTerms === true,
    ipAddress
  };
  if (request.organisationLegalName.length < 2) throw new BindingRefused('invalid_request', 'Enter the organisation\'s legal name.', 400);
  if (request.contactName.length < 2) throw new BindingRefused('invalid_request', 'Enter the contact person\'s name.', 400);
  if (!EMAIL.test(request.contactEmail)) throw new BindingRefused('invalid_request', 'Enter a valid email address.', 400);
  if (!request.acceptTerms) throw new BindingRefused('invalid_request', 'Accept the assessment terms and privacy notice to continue.', 400);
  return request;
}

export async function bindSessionForPaidReport(token: string, request: BindingRequest): Promise<BindingResult> {
  requireRevisedCommercial();
  const { live, actionCount } = await sessionForCommercialBinding(token);
  let input: ReturnType<typeof buildStagedReportInput>;
  try {
    input = buildStagedReportInput(live);
  } catch {
    throw new BindingRefused('not_staged', 'Paid reports are produced only from a staged assessment (build 1.6).');
  }
  const interview = input.assessmentStatus.facets.find((f) => f.key === 'interview');
  if (interview?.settled !== true) {
    throw new BindingRefused('interview_not_complete', 'Finish the assessment interview before requesting a paid report.');
  }
  const inputDigest = canonicalDigest(input);
  const logDigest = input.lineage.logDigest;
  const controls = input.domains.reduce((n: number, d: any) => n + d.controls.length, 0);
  const outstanding = Number(input.assessmentStatus.outstanding?.total ?? 0);
  const coverage = controls > 0 ? Math.round((1000 * (controls - outstanding)) / controls) / 10 : 0;
  const acceptedAt = new Date().toISOString();

  const db = createSupabaseServiceClient() as any;
  const { data, error } = await db.rpc('review_bind_commercial_assessment', {
    p: {
      session_id: input.lineage.sessionId,
      action_count: actionCount,
      input_contract: STAGED_REPORT_INPUT_CONTRACT.name,
      input_version: STAGED_REPORT_INPUT_CONTRACT.version,
      input_digest: inputDigest,
      log_digest: logDigest,
      engine_build: input.staged.build,
      outstanding_total: outstanding,
      interview_complete: true,
      completion_percentage: 100,
      coverage_pct: coverage,
      terms_version: FRAUD_READINESS_TERMS_VERSION,
      privacy_notice_version: FRAUD_READINESS_PRIVACY_NOTICE_VERSION,
      terms_accepted_at: acceptedAt,
      organisation: { legal_name: request.organisationLegalName, country: 'South Africa' },
      respondent: { full_name: request.contactName, email: request.contactEmail, role_title: request.contactRole ?? null }
    }
  });
  if (error) {
    const message = String(error.message ?? '');
    if (message.includes('review_commercial_bridge_disabled')) throw new BindingRefused('disabled', 'Paid reports from the revised assessment are not enabled on this database.', 503);
    if (message.includes('review_log_moved') || message.includes('review_binding_exists_for_other_answers')) {
      throw new BindingRefused('answers_changed', 'The answers changed after this assessment was submitted for a paid report. Contact MK to reopen it.');
    }
    throw error;
  }
  const snapshot = await createSnapshotTokenForAssessment({
    assessmentId: data.assessment_id,
    assessmentReference: data.assessment_reference,
    revokeExisting: false,
    ipAddress: request.ipAddress ?? null
  });
  return {
    created: Boolean(data.created),
    assessmentReference: data.assessment_reference,
    snapshotToken: snapshot.rawToken,
    snapshotTokenExpiresAt: snapshot.expiresAt,
    inputDigest,
    logDigest,
    actionCount,
    outstanding
  };
}
