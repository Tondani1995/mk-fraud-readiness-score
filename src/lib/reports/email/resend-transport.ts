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
