import crypto from 'node:crypto';

export type ResendWebhookPayload = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    [key: string]: unknown;
  };
};

function safeEqualBase64(expected: string, actual: string) {
  try {
    const expectedBuffer = Buffer.from(expected, 'base64');
    const actualBuffer = Buffer.from(actual, 'base64');
    return expectedBuffer.length === actualBuffer.length
      && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}

export function verifyResendWebhook(input: {
  payload: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret?: string | null;
  nowMs?: number;
}): ResendWebhookPayload {
  const secret = input.secret?.trim() || process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret || !secret.startsWith('whsec_')) throw new Error('Resend webhook secret is not configured.');
  if (!input.id || !input.timestamp || !input.signature) throw new Error('Required webhook signature headers are missing.');

  const timestampSeconds = Number(input.timestamp);
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > 300) {
    throw new Error('Webhook timestamp is outside the accepted replay window.');
  }

  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const signedContent = `${input.id}.${input.timestamp}.${input.payload}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');
  const signatures = input.signature
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.startsWith('v1,') ? item.slice(3) : item);

  if (!signatures.some((signature) => safeEqualBase64(expected, signature))) {
    throw new Error('Webhook signature is invalid.');
  }

  const parsed = JSON.parse(input.payload) as ResendWebhookPayload;
  if (!parsed || typeof parsed.type !== 'string' || !parsed.data?.email_id) {
    throw new Error('Webhook payload does not contain a supported email event.');
  }
  return parsed;
}

export function mapResendEventStatus(type: string) {
  switch (type) {
    case 'email.delivered': return 'delivered';
    case 'email.bounced': return 'bounced';
    case 'email.failed': return 'delivery_failed';
    case 'email.suppressed': return 'suppressed';
    case 'email.complained': return 'complained';
    case 'email.delivery_delayed': return 'delivery_delayed';
    case 'email.sent': return 'sent';
    default: return null;
  }
}
