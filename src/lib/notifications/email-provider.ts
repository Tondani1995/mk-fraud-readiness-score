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

// `test` mode never contacts a real customer -- callers are responsible for only invoking this
// with an explicitly designated MK test mailbox when mode is 'test' (see the runbook). This
// function does not and cannot verify the recipient is a test address; that discipline lives at
// the call site and in the external-resource decision gate (docs/safe-launch/15-...-design.md).
export async function sendEmail(input: ReportEmailTransportInput): Promise<SendEmailResult> {
  const mode = getEmailProviderMode();

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
