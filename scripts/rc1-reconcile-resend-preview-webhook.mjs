import assert from 'node:assert/strict';

const API_BASE = 'https://api.resend.com';
const endpoint = 'https://mk-fraud-platform-git-fix-rc1-control-81cf3f-tondanis-projects.vercel.app/score/api/webhooks/resend';
const events = [
  'email.sent',
  'email.delivered',
  'email.bounced',
  'email.failed',
  'email.suppressed',
  'email.complained',
  'email.delivery_delayed',
];

const apiKey = process.env.RESEND_API_KEY?.trim();
const configuredSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
if (!apiKey || !configuredSecret) throw new Error('Resend reconciliation requires configured credentials.');
if (process.env.RC1_RESEND_RECONCILIATION_ONCE !== 'confirm') {
  throw new Error('One-use reconciliation requires RC1_RESEND_RECONCILIATION_ONCE=confirm.');
}

async function resend(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Resend API request failed with HTTP ${response.status}.`);
  return body;
}

async function listAllWebhooks() {
  const webhooks = [];
  let after = null;
  do {
    const query = new URLSearchParams({ limit: '100' });
    if (after) query.set('after', after);
    const page = await resend(`/webhooks?${query}`);
    const rows = Array.isArray(page?.data) ? page.data : [];
    webhooks.push(...rows);
    after = page?.has_more && rows.length ? rows.at(-1)?.id ?? null : null;
  } while (after);
  return webhooks;
}

const listed = await listAllWebhooks();
const detailed = await Promise.all(listed.map(async (webhook) => {
  assert.equal(typeof webhook?.id, 'string', 'Resend returned a webhook without an id.');
  return resend(`/webhooks/${encodeURIComponent(webhook.id)}`);
}));
const matches = detailed.filter((webhook) => webhook?.signing_secret === configuredSecret);
if (matches.length !== 1) {
  throw new Error(`Expected exactly one matching Resend webhook; found ${matches.length} among ${detailed.length}.`);
}

const target = matches[0];
await resend(`/webhooks/${encodeURIComponent(target.id)}`, {
  method: 'PATCH',
  body: JSON.stringify({ endpoint, status: 'enabled', events }),
});
const verified = await resend(`/webhooks/${encodeURIComponent(target.id)}`);
assert.equal(verified.endpoint, endpoint);
assert.equal(verified.status, 'enabled');
assert.deepEqual([...verified.events].sort(), [...events].sort());
assert.equal(verified.signing_secret, configuredSecret);

// Output is deliberately limited to non-secret operational facts.
console.log(JSON.stringify({ ok: true, listedWebhookCount: detailed.length, matchedWebhookCount: 1, status: verified.status, eventCount: verified.events.length }));
