const RESEND_API_BASE = 'https://api.resend.com';

export const PREVIEW_RESEND_WEBHOOK_ENDPOINT =
  'https://mk-fraud-platform-git-fix-rc1-control-81cf3f-tondanis-projects.vercel.app/score/api/webhooks/resend';

export const PREVIEW_RESEND_WEBHOOK_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.failed',
  'email.suppressed',
  'email.complained',
  'email.delivery_delayed',
] as const;

type ResendWebhook = {
  id?: unknown;
  endpoint?: unknown;
  status?: unknown;
  events?: unknown;
  signing_secret?: unknown;
};

export class ResendWebhookApiError extends Error {
  constructor(readonly status: number, readonly code: string | null) {
    super(`Resend webhook API returned HTTP ${status}.`);
    this.name = 'ResendWebhookApiError';
  }
}

async function resendRequest(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`${RESEND_API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body && typeof body.name === 'string' ? body.name : null;
    throw new ResendWebhookApiError(response.status, code);
  }
  return body as Record<string, unknown>;
}

async function listResendWebhooks(apiKey: string) {
  const all: ResendWebhook[] = [];
  let after: string | null = null;
  do {
    const query = after ? `?after=${encodeURIComponent(after)}` : '';
    const page = await resendRequest(`/webhooks${query}`, apiKey);
    const rows = Array.isArray(page.data) ? page.data as ResendWebhook[] : [];
    all.push(...rows);
    const lastId = rows.at(-1)?.id;
    after = page.has_more === true && typeof lastId === 'string' ? lastId : null;
  } while (after);
  return all;
}

function exactEventSet(value: unknown) {
  return Array.isArray(value)
    && value.length === PREVIEW_RESEND_WEBHOOK_EVENTS.length
    && [...value].sort().join('|') === [...PREVIEW_RESEND_WEBHOOK_EVENTS].sort().join('|');
}

export async function reconcilePreviewResendWebhook() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!apiKey || !signingSecret) throw new Error('Resend webhook credentials are not configured.');

  const listed = await listResendWebhooks(apiKey);
  const detailed = await Promise.all(listed.map(async (webhook) => {
    if (typeof webhook.id !== 'string') throw new Error('Resend returned an invalid webhook identity.');
    return resendRequest(`/webhooks/${encodeURIComponent(webhook.id)}`, apiKey);
  }));
  const matches = detailed.filter((webhook) => webhook.signing_secret === signingSecret);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one matching Resend webhook; found ${matches.length}.`);
  }

  const target = matches[0];
  if (typeof target.id !== 'string') throw new Error('Resend returned an invalid matching webhook identity.');
  await resendRequest(`/webhooks/${encodeURIComponent(target.id)}`, apiKey, {
    method: 'PATCH',
    body: JSON.stringify({
      endpoint: PREVIEW_RESEND_WEBHOOK_ENDPOINT,
      status: 'enabled',
      events: PREVIEW_RESEND_WEBHOOK_EVENTS,
    }),
  });
  const verified = await resendRequest(`/webhooks/${encodeURIComponent(target.id)}`, apiKey);
  if (verified.endpoint !== PREVIEW_RESEND_WEBHOOK_ENDPOINT
      || verified.status !== 'enabled'
      || !exactEventSet(verified.events)
      || verified.signing_secret !== signingSecret) {
    throw new Error('Resend webhook reconciliation verification failed.');
  }

  return {
    listedWebhookCount: detailed.length,
    matchedWebhookCount: 1,
    status: 'enabled' as const,
    eventCount: PREVIEW_RESEND_WEBHOOK_EVENTS.length,
  };
}
