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

export const sendReportEmailWithResend: ReportEmailTransport = async (input) => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');

  const response = await fetch('https://api.resend.com/emails', {
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
  });

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
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(input.providerMessageId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
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
