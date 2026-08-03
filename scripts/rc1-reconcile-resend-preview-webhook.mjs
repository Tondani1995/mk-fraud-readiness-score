const previewBaseUrl = (process.env.PREVIEW_BASE_URL
  ?? 'https://mk-fraud-platform-git-fix-rc1-control-81cf3f-tondanis-projects.vercel.app').replace(/\/$/, '');
const response = await fetch(`${previewBaseUrl}/score/api/internal/rc1-preview-resend-reconciliation`, {
  method: 'POST',
  headers: { accept: 'application/json' },
});
const body = await response.json().catch(() => null);
if (!response.ok || !body?.ok) throw new Error(`Preview reconciliation failed with HTTP ${response.status}.`);
console.log(JSON.stringify({
  ok: true,
  alreadyReconciled: body.alreadyReconciled === true,
  listedWebhookCount: Number.isSafeInteger(body.listedWebhookCount) ? body.listedWebhookCount : null,
  matchedWebhookCount: Number.isSafeInteger(body.matchedWebhookCount) ? body.matchedWebhookCount : null,
  status: body.status === 'enabled' ? body.status : null,
  eventCount: Number.isSafeInteger(body.eventCount) ? body.eventCount : null,
}));
