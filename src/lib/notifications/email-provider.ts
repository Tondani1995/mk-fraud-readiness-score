import { sendReportEmailWithResend, type ReportEmailTransportInput, type ReportEmailTransportResult } from '@/lib/reports/email/resend-transport';

// Release C provider abstraction. disabled / test / live, per
// docs/safe-launch/15-email-and-secure-delivery-design.md. This is the ONLY place in Release C
// that decides whether a real HTTP request reaches Resend -- every caller goes through
// sendEmail(), never sendReportEmailWithResend() directly, so provider-mode enforcement cannot
// be bypassed by a call site forgetting to check it.

export type EmailProviderMode = 'disabled' | 'test' | 'live';

export function getEmailProviderMode(): EmailProviderMode {
  const raw = process.env.MK_EMAIL_PROVIDER_MODE?.trim().toLowerCase();
  if (raw === 'test' || raw === 'live') return raw;
  return 'disabled';
}

export type SendEmailResult =
  | { ok: true; mode: 'disabled'; providerMessageId: null }
  | { ok: true; mode: 'test'; providerMessageId: string }
  | { ok: true; mode: 'live'; providerMessageId: string }
  | { ok: false; mode: EmailProviderMode; error: string };

export type InternalEmailTransportInput = ReportEmailTransportInput & { audience: 'internal' };
export type CustomerReportReadyEmailTransportInput = ReportEmailTransportInput & {
  audience: 'customer_report_ready';
};
export type EmailTransportInput =
  | InternalEmailTransportInput
  | CustomerReportReadyEmailTransportInput;

function configuredRecipientAllowlist() {
  const raw = process.env.MK_EMAIL_RECIPIENT_ALLOWLIST?.trim();
  if (!raw) return [];
  return raw.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
}

// `test` mode never contacts a real customer -- callers are responsible for only invoking this
// with an explicitly designated MK test mailbox when mode is 'test' (see the runbook). This
// function does not and cannot verify the recipient is a test address; that discipline lives at
// the call site and in the external-resource decision gate (docs/safe-launch/15-...-design.md).
export async function sendEmail(input: EmailTransportInput | (ReportEmailTransportInput & { audience?: string })): Promise<SendEmailResult> {
  const audience = input.audience;
  if (audience !== 'internal' && audience !== 'customer_report_ready') {
    return { ok: false, mode: getEmailProviderMode(), error: 'Customer transactional email is disabled for V1.2.' };
  }
  const mode = getEmailProviderMode();

  // The only customer-facing send admitted by this boundary is the already-authorised
  // report-ready fulfilment message. Preview/test sends must target the explicitly approved MK
  // mailbox; live mode remains available for the eventual production delivery configuration.
  if (audience === 'customer_report_ready' && mode === 'test') {
    const allowlist = configuredRecipientAllowlist();
    if (!allowlist.includes(input.to.trim().toLowerCase())) {
      return { ok: false, mode, error: 'Report-ready test recipient is not allowlisted.' };
    }
  }

  if (mode === 'disabled') {
    return { ok: true, mode: 'disabled', providerMessageId: null };
  }

  if (mode === 'test') {
    // No real Resend account is assumed to exist yet (per the external-resource decision gate --
    // whether RESEND_API_KEY in .env.example corresponds to a real, funded account is unknown
    // and unconfirmed by the MK owner). If a key IS configured, 'test' mode still uses the real
    // Resend API (Resend's sandbox/test capability is exercised by the caller's choice of
    // recipient, not by this function), which is why callers must only pass a designated MK test
    // mailbox in this mode -- this function has no way to enforce that itself.
    if (!process.env.RESEND_API_KEY?.trim()) {
      return { ok: false, mode: 'test', error: 'RESEND_API_KEY is not configured; cannot exercise test mode.' };
    }
    try {
      const result: ReportEmailTransportResult = await sendReportEmailWithResend(input);
      return { ok: true, mode: 'test', providerMessageId: result.messageId };
    } catch (error) {
      return { ok: false, mode: 'test', error: error instanceof Error ? error.message : String(error) };
    }
  }

  // live
  try {
    const result: ReportEmailTransportResult = await sendReportEmailWithResend(input);
    return { ok: true, mode: 'live', providerMessageId: result.messageId };
  } catch (error) {
    return { ok: false, mode: 'live', error: error instanceof Error ? error.message : String(error) };
  }
}

// Release certification (not enforced automatically -- read at the point production readiness
// is being assessed, per docs/safe-launch/09-release-evidence.md): production must not be
// declared delivery-ready while this returns anything other than 'live'.
export function isCertifiedForProduction(): boolean {
  return getEmailProviderMode() === 'live';
}
