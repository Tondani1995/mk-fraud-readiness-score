import type { RemoteContact, ResendSyncPlan } from '@/lib/marketing/subscription-state';

/**
 * Resend marketing adapter for MK Fraud Signals.
 *
 * Separate from the Fraud Readiness transactional transport on purpose: different credential
 * (MK_MARKETING_RESEND_API_KEY), different mode switch (MK_MARKETING_MODE), different webhook
 * secret, and no code path shared with report delivery.
 *
 * Modes:
 *   disabled (default): no HTTP request reaches Resend. Subscribe requests are refused politely.
 *   test: requests reach Resend only for addresses on MK_MARKETING_TEST_RECIPIENT_ALLOWLIST,
 *                        and contacts are placed in the MK Internal QA segment, never production.
 *   live: production. Requires explicit owner approval to set.
 *
 * Resend API keys are either full access or sending only; there is no contacts-only scope. The
 * marketing key therefore has full access and must be a dedicated key that lives only in the
 * server environment of this project. It is never sent to Attio, ChatGPT or the browser.
 */

export type MarketingMode = 'disabled' | 'test' | 'live';

export function getMarketingMode(): MarketingMode {
  const raw = process.env.MK_MARKETING_MODE?.trim().toLowerCase();
  return raw === 'test' || raw === 'live' ? raw : 'disabled';
}

export type MarketingResendConfig = {
  apiKey: string;
  mode: Exclude<MarketingMode, 'disabled'>;
  topicId: string;
  segmentId: string;
  fromAddress: string;
  replyTo: string;
  testAllowlist: Set<string>;
  fetchImpl?: typeof fetch;
};

export function marketingResendConfigFromEnv(): MarketingResendConfig | null {
  const mode = getMarketingMode();
  if (mode === 'disabled') return null;
  const apiKey = process.env.MK_MARKETING_RESEND_API_KEY?.trim();
  const topicId = process.env.MK_SIGNALS_RESEND_TOPIC_ID?.trim();
  const segmentId = (mode === 'live' ? process.env.MK_SIGNALS_RESEND_SEGMENT_ID : process.env.MK_QA_RESEND_SEGMENT_ID)?.trim();
  if (!apiKey || !topicId || !segmentId) return null;
  return {
    apiKey,
    mode,
    topicId,
    segmentId,
    fromAddress: process.env.MK_SIGNALS_FROM?.trim() || 'MK Fraud Insights | Fraud Signals <signals@send.mkfraud.co.za>',
    replyTo: process.env.MK_SIGNALS_REPLY_TO?.trim() || 'rendani@mkfraud.co.za',
    testAllowlist: new Set(
      (process.env.MK_MARKETING_TEST_RECIPIENT_ALLOWLIST ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  };
}

export class MarketingRecipientNotAllowedError extends Error {
  constructor() {
    super('marketing_test_mode_recipient_not_allowlisted');
  }
}

function assertRecipientAllowed(config: MarketingResendConfig, email: string) {
  if (config.mode === 'test' && !config.testAllowlist.has(email.toLowerCase())) {
    throw new MarketingRecipientNotAllowedError();
  }
}

type ResendResult<T> = { status: number; body: T | null };

async function resend<T>(config: MarketingResendConfig, method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<ResendResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await (config.fetchImpl ?? fetch)(`https://api.resend.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const parsed = await response.json().catch(() => null) as T | null;
    return { status: response.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

function ok(status: number) {
  return status >= 200 && status < 300;
}

/**
 * Read the provider's view of one address. Any unexpected response throws: the caller must treat
 * "could not read" as unknown and fail closed, never as "absent".
 */
export async function readRemoteContact(config: MarketingResendConfig, email: string): Promise<RemoteContact> {
  assertRecipientAllowed(config, email);
  const encoded = encodeURIComponent(email);

  const suppression = await resend<{ id?: string }>(config, 'GET', `/suppressions/${encoded}`);
  if (!ok(suppression.status) && suppression.status !== 404) throw new Error(`resend_suppression_read_${suppression.status}`);
  const suppressed = ok(suppression.status);

  const contact = await resend<{ id?: string; unsubscribed?: boolean }>(config, 'GET', `/contacts/${encoded}`);
  if (contact.status === 404) {
    return { exists: false, contactId: null, unsubscribed: null, topicSubscription: null, inSignalsSegment: false, suppressed };
  }
  if (!ok(contact.status) || !contact.body?.id) throw new Error(`resend_contact_read_${contact.status}`);
  const contactId = contact.body.id;

  const topics = await resend<{ data?: Array<{ id?: string; subscription?: string }> }>(config, 'GET', `/contacts/${contactId}/topics`);
  if (!ok(topics.status) || !Array.isArray(topics.body?.data)) throw new Error(`resend_topics_read_${topics.status}`);
  const signals = topics.body!.data!.find((topic) => topic.id === config.topicId);

  const segments = await resend<{ data?: Array<{ id?: string }> }>(config, 'GET', `/contacts/${contactId}/segments`);
  if (!ok(segments.status) || !Array.isArray(segments.body?.data)) throw new Error(`resend_segments_read_${segments.status}`);

  return {
    exists: true,
    contactId,
    unsubscribed: typeof contact.body.unsubscribed === 'boolean' ? contact.body.unsubscribed : null,
    topicSubscription: signals?.subscription === 'opt_in' ? 'opt_in' : signals?.subscription === 'opt_out' ? 'opt_out' : null,
    inSignalsSegment: segments.body!.data!.some((segment) => segment.id === config.segmentId),
    suppressed
  };
}

/**
 * Execute a sync plan produced by planResendContactSync(). Writes happen in a safe order:
 * withdrawals first (topic opt-out, unsubscribe, segment removal); additions last (contact,
 * topic opt-in, segment add). If a write fails half-way the person ends up LESS reachable, never
 * more, and the next reconciliation retries.
 */
export async function applyResendSyncPlan(config: MarketingResendConfig, email: string, plan: Extract<ResendSyncPlan, { action: 'apply' }>, existingContactId: string | null): Promise<{ contactId: string | null }> {
  assertRecipientAllowed(config, email);
  const encoded = encodeURIComponent(email);
  let contactId = existingContactId;

  const must = (result: ResendResult<unknown>, label: string) => {
    if (!ok(result.status)) throw new Error(`resend_${label}_${result.status}`);
  };

  if (plan.topic === 'opt_out' && contactId) {
    must(await resend(config, 'PATCH', `/contacts/${contactId}/topics`, { topics: [{ id: config.topicId, subscription: 'opt_out' }] }), 'topic_opt_out');
  }
  if (plan.setUnsubscribed === true && contactId) {
    must(await resend(config, 'PATCH', `/contacts/${contactId}`, { unsubscribed: true }), 'unsubscribe');
  }
  if (plan.removeFromSignalsSegment && contactId) {
    const removal = await resend(config, 'DELETE', `/contacts/${contactId}/segments/${config.segmentId}`);
    if (!ok(removal.status) && removal.status !== 404) throw new Error(`resend_segment_remove_${removal.status}`);
  }

  if (plan.createContact) {
    // Created with the topic and WITHOUT a segment; segment membership is the last write.
    const created = await resend<{ id?: string }>(config, 'POST', '/contacts', {
      email,
      unsubscribed: false,
      topics: [{ id: config.topicId, subscription: 'opt_in' }]
    });
    if (created.status === 409 || created.status === 422) {
      // Already exists (created concurrently or outside MK). Never overwrite: re-read and replan.
      throw new Error('resend_contact_exists_replan_required');
    }
    must(created, 'contact_create');
    contactId = created.body?.id ?? null;
    if (!contactId) throw new Error('resend_contact_create_without_id');
  } else {
    if (!contactId) throw new Error('resend_contact_id_missing');
    if (plan.setUnsubscribed === false) {
      must(await resend(config, 'PATCH', `/contacts/${contactId}`, { unsubscribed: false }), 'resubscribe_with_fresh_consent');
    }
    if (plan.topic === 'opt_in') {
      must(await resend(config, 'PATCH', `/contacts/${contactId}/topics`, { topics: [{ id: config.topicId, subscription: 'opt_in' }] }), 'topic_opt_in');
    }
  }

  if (plan.addToSignalsSegment) {
    must(await resend(config, 'POST', `/contacts/${contactId}/segments/${config.segmentId}`), 'segment_add');
  }
  return { contactId };
}

export type ConfirmationEmailInput = {
  to: string;
  confirmUrl: string;
  idempotencyKey: string;
};

/** The double opt-in email. Plain, branded, no tracking, no marketing content. */
export async function sendConfirmationEmail(config: MarketingResendConfig, input: ConfirmationEmailInput): Promise<string> {
  assertRecipientAllowed(config, input.to);
  const subject = 'Confirm your MK Fraud Signals subscription';
  const text = [
    'Please confirm that you want to receive MK Fraud Signals, the weekly email from MK Fraud Insights.',
    '',
    `Confirm: ${input.confirmUrl}`,
    '',
    'If you did not ask for this, ignore this email and nothing will be sent. The link expires in 72 hours.',
    '',
    'MK Fraud Insights, a trading name of Stonda (Pty) Ltd. Privacy Policy: https://www.mkfraud.co.za/privacy-policy'
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Poppins,Segoe UI,Helvetica,Arial,sans-serif;color:#001030">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-top:4px solid #001030">
<tr><td style="padding:28px 32px 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#1D3658;font-weight:600">MK Fraud Signals</td></tr>
<tr><td style="padding:0 32px;font-size:22px;line-height:1.3;font-weight:600;color:#001030">Confirm your subscription</td></tr>
<tr><td style="padding:16px 32px 0;font-size:15px;line-height:1.6;color:#1D3658">Please confirm that you want to receive MK Fraud Signals, the weekly email from MK Fraud Insights.</td></tr>
<tr><td style="padding:24px 32px"><a href="${escapeHtmlAttribute(input.confirmUrl)}" style="display:inline-block;background:#001030;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:4px">Confirm subscription</a></td></tr>
<tr><td style="padding:0 32px 24px;font-size:13px;line-height:1.6;color:#4a5b70">If you did not ask for this, ignore this email and nothing will be sent. The link expires in 72 hours.</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #A9D4CE;font-size:12px;line-height:1.6;color:#4a5b70">MK Fraud Insights, a trading name of Stonda (Pty) Ltd. <a href="https://www.mkfraud.co.za/privacy-policy" style="color:#1D3658">Privacy Policy</a></td></tr>
</table></td></tr></table></body></html>`;

  const result = await resend<{ id?: string; message?: string }>(config, 'POST', '/emails', {
    from: config.fromAddress,
    to: [input.to],
    reply_to: config.replyTo,
    subject,
    html,
    text,
    tags: [{ name: 'mk_stream', value: 'newsletter_confirmation' }]
  }, input.idempotencyKey);
  if (!ok(result.status) || !result.body?.id) throw new Error(`resend_confirmation_send_${result.status}`);
  return result.body.id;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
