/**
 * Approved public proof for the MK Fraud Insights website.
 *
 * Only add entries that MK has explicit permission to publish. Every list renders nothing while it
 * is empty, so the homepage never shows placeholders, invented clients or unverifiable numbers.
 */

export type ApprovedClientLogo = {
  name: string;
  /** Path under /public, for example /clients/acme.svg */
  src: string;
  width: number;
  height: number;
};

export type EngagementExample = {
  /** Sector or anonymised descriptor, for example "National retailer". */
  client: string;
  challenge: string;
  work: string;
  /** Only outcomes the client has approved for publication. */
  outcome: string;
};

export type ApprovedAssociation = {
  name: string;
  description: string;
  href?: string;
};

export const APPROVED_CLIENT_LOGOS: readonly ApprovedClientLogo[] = [];
export const ENGAGEMENT_EXAMPLES: readonly EngagementExample[] = [];
export const APPROVED_ASSOCIATIONS: readonly ApprovedAssociation[] = [];
