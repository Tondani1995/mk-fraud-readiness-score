export type ReportEmailTransportInput = {
  from: string;
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  attachment: {
    filename: string;
    contentBase64: string;
  };
  idempotencyKey: string;
  tags?: Array<{ name: string; value: string }>;
};

export type ReportEmailTransportResult = {
  provider: 'resend';
  messageId: string;
};

export type ReportEmailTransport = (
  input: ReportEmailTransportInput
) => Promise<ReportEmailTransportResult>;

export type ReportEmailReconciliationResult = {
  state: 'accepted' | 'not_found' | 'pending' | 'unknown';
  messageId: string | null;
  detail?: string | null;
};

export type ReportEmailReconciler = (input: {
  providerMessageId: string | null;
  providerRequestKey: string;
}) => Promise<ReportEmailReconciliationResult>;

type ResendResponse = {
  id?: string;
  message?: string;
  name?: string;
};

// M7: both Resend calls are bounded by an explicit client-side timeout. A timeout on the SEND
// call is the textbook "lost response" case H4 exists to handle: Resend may have already
// accepted the message before our client gave up waiting for the HTTP response. sendReportEmailWithResend
// therefore does not (and must not) swallow or reclassify an abort -- it lets the AbortError
// propagate as an ordinary thrown error, exactly like any other network failure. The caller
// (executeClaimedReportDelivery in delivery-dispatch.ts) already treats any throw from transport()
// that happens after dispatch was marked started as ambiguous, not as a definitive failure, and
// routes it to markReconciliationRequired -- never to an automatic resend. A timeout on the
// RECONCILE call is handled the same way: it is surfaced as a thrown error (not a synthesized
// 'not_found'/'accepted' state), so a slow provider can never be misread as a definitive answer.
const DEFAULT_RESEND_SEND_TIMEOUT_MS = 15_000;
const DEFAULT_RESEND_RECONCILE_TIMEOUT_MS = 10_000;

function resolveTimeoutMs(envVar: string, fallbackMs: number) {
  const raw = Number(process.env[envVar]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallbackMs;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, timeoutLabel: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') {
      throw new Error(`${timeoutLabel}_timed_out_after_${timeoutMs}ms`);
    }
    throw caught;
  } finally {
    clearTimeout(timer);
  }
}

export const sendReportEmailWithResend: ReportEmailTransport = async (input) => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');

  const timeoutMs = resolveTimeoutMs('RESEND_SEND_TIMEOUT_MS', DEFAULT_RESEND_SEND_TIMEOUT_MS);
  const response = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      reply_to: input.replyTo || undefined,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: [{
        filename: input.attachment.filename,
        content: input.attachment.contentBase64
      }],
      tags: input.tags
    })
  }, timeoutMs, 'resend_send');

  const payload = await response.json().catch(() => ({})) as ResendResponse;
  if (!response.ok || !payload.id) {
    throw new Error(`Resend send failed (${response.status}): ${payload.message ?? payload.name ?? 'unknown provider error'}`);
  }

  return { provider: 'resend', messageId: payload.id };
};

export const reconcileReportEmailWithResend: ReportEmailReconciler = async (input) => {
  if (!input.providerMessageId) {
    return { state: 'unknown', messageId: null, detail: 'Resend cannot be queried by idempotency key; wait for a webhook or reconcile in the provider console.' };
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');
  const timeoutMs = resolveTimeoutMs('RESEND_RECONCILE_TIMEOUT_MS', DEFAULT_RESEND_RECONCILE_TIMEOUT_MS);
  const response = await fetchWithTimeout(`https://api.resend.com/emails/${encodeURIComponent(input.providerMessageId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  }, timeoutMs, 'resend_reconcile');
  if (response.status === 404) return { state: 'not_found', messageId: input.providerMessageId };
  const payload = await response.json().catch(() => ({})) as { id?: string; last_event?: string; message?: string };
  if (!response.ok || !payload.id) {
    throw new Error(`Resend reconciliation failed (${response.status}): ${payload.message ?? 'unknown provider error'}`);
  }
  return {
    state: payload.last_event ? 'accepted' : 'pending',
    messageId: payload.id,
    detail: payload.last_event ?? null
  };
};
