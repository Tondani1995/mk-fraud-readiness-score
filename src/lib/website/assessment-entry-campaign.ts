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
