/**
 * Preserve the campaign's public tracking identity when the scored entry moves to the review track.
 * This is URL transport only: no cookies, analytics events, consent changes or private identifiers.
 * Accept only the commissioned campaign tuple; arbitrary query input (including PII) is never forwarded.
 */
export type EntrySearch = Record<string, string | string[] | undefined>;

export function reviewCampaignEntry(search: EntrySearch | undefined): string {
  if (!search || search.utm_source !== 'x' || search.utm_medium !== 'organic_social' || search.utm_campaign !== 'fraud_readiness_100d') return '/review';
  const content = search.utm_content;
  if (typeof content !== 'string' || !/^fr\d{4}$/.test(content)) return '/review';
  const number = Number(content.slice(2));
  if (number < 1 || number > 2400) return '/review';
  const params = new URLSearchParams({ utm_source: 'x', utm_medium: 'organic_social', utm_campaign: 'fraud_readiness_100d', utm_content: content });
  return `/review?${params.toString()}`;
}

/** The only commissioned review campaign. An exact content ID cannot carry PII or a role token. */
export function reviewCampaignContent(value: unknown): string | null {
  if (typeof value !== 'string' || !/^fr\d{4}$/.test(value)) return null;
  const number = Number(value.slice(2));
  return number >= 1 && number <= 2400 ? value : null;
}

/** Public start page only. No tracking scripts, click identifiers, or writes to browser storage. */
export function consentedReviewCampaignContent(search: string, storage: Pick<Storage, 'getItem'>, now = Date.now()): string | null {
  try {
    if (storage.getItem('mk_fraud_cookie_consent') !== 'accepted') return null;
    const params = new URLSearchParams(search);
    const urlTags = Object.fromEntries([...params.keys()].map(key => [key, params.getAll(key).length === 1 ? params.get(key)! : params.getAll(key)]));
    if (reviewCampaignEntry(urlTags) !== '/review') return reviewCampaignContent(urlTags.utm_content);
    // A direct /review landing without tags may use the previously consented, unexpired public acquisition context.
    if (['utm_source','utm_medium','utm_campaign','utm_content'].some(key => params.has(key))) return null;
    const raw = storage.getItem('mk_fraud_acquisition_context');
    if (!raw) return null;
    const stored = JSON.parse(raw);
    const expires = Date.parse(stored.expires_at);
    if (!Number.isFinite(expires) || expires <= now || expires > now + 30 * 86400000) return null;
    return reviewCampaignEntry(stored) !== '/review' ? reviewCampaignContent(stored.utm_content) : null;
  } catch { return null; }
}
