import { ANALYTICS_CONSENT_STORAGE_KEY, GA_CONSENT_EVENT } from '@/lib/website/gtag';
import { MARKETING_CONSENT_EVENT, hasMarketingConsent } from '@/lib/website/meta/consent';

export const ACQUISITION_CONTEXT_STORAGE_KEY = 'mk_fraud_acquisition_context';
export const ACQUISITION_RETENTION_DAYS = 30;
export const ACQUISITION_RETENTION_MS = ACQUISITION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
export const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid'] as const;

export type UtmKey = (typeof UTM_KEYS)[number];
export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];
export type CampaignAttribution = Partial<Record<UtmKey, string>>;
export type AcquisitionContext = CampaignAttribution & Partial<Record<ClickIdKey, string>> & {
  captured_at: string;
  expires_at: string;
};

const MAX_VALUE_LENGTH = 255;

function cleanValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[<>\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_VALUE_LENGTH);
  return cleaned || undefined;
}

function analyticsAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === 'accepted';
  } catch {
    return false;
  }
}

/**
 * Server-safe allow-list for campaign metadata. Advertising click IDs are deliberately excluded:
 * MK preserves them only in the consent-scoped browser context until a verified booking/API
 * correlation exists, rather than storing them beside a person's enquiry details.
 */
export function sanitiseCampaignAttribution(value: unknown): CampaignAttribution {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const output: CampaignAttribution = {};
  for (const key of UTM_KEYS) {
    const cleaned = cleanValue(input[key]);
    if (cleaned) output[key] = cleaned;
  }
  return output;
}

function parseStoredContext(raw: string | null, now: number): AcquisitionContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const expiresAt = Date.parse(typeof parsed.expires_at === 'string' ? parsed.expires_at : '');
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;

    const context: AcquisitionContext = {
      ...sanitiseCampaignAttribution(parsed),
      captured_at: typeof parsed.captured_at === 'string' ? parsed.captured_at : new Date(now).toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
    };
    if (hasMarketingConsent()) {
      for (const key of CLICK_ID_KEYS) {
        const cleaned = cleanValue(parsed[key]);
        if (cleaned) context[key] = cleaned;
      }
    }
    return context;
  } catch {
    return null;
  }
}

export function readAcquisitionContext(now = Date.now()): AcquisitionContext | null {
  if (typeof window === 'undefined' || !analyticsAllowed()) return null;
  try {
    const context = parseStoredContext(window.localStorage.getItem(ACQUISITION_CONTEXT_STORAGE_KEY), now);
    if (!context) window.localStorage.removeItem(ACQUISITION_CONTEXT_STORAGE_KEY);
    return context;
  } catch {
    return null;
  }
}

/**
 * First-touch-with-refresh policy: a tagged external landing starts a bounded 30-day context.
 * Untagged/internal navigation never replaces it. A later explicitly tagged landing is treated as
 * a new acquisition touch and starts a fresh window.
 */
export function captureAcquisitionContext(search = window.location.search, now = Date.now()): AcquisitionContext | null {
  if (typeof window === 'undefined') return null;
  if (!analyticsAllowed()) {
    try { window.localStorage.removeItem(ACQUISITION_CONTEXT_STORAGE_KEY); } catch {}
    return null;
  }

  const params = new URLSearchParams(search);
  const next: Partial<AcquisitionContext> = {};
  for (const key of UTM_KEYS) {
    const cleaned = cleanValue(params.get(key));
    if (cleaned) next[key] = cleaned;
  }
  if (hasMarketingConsent()) {
    for (const key of CLICK_ID_KEYS) {
      const cleaned = cleanValue(params.get(key));
      if (cleaned) next[key] = cleaned;
    }
  }

  const hasTaggedLanding = [...UTM_KEYS, ...CLICK_ID_KEYS].some((key) => Boolean(next[key]));
  try {
    if (hasTaggedLanding) {
      const context = {
        ...next,
        captured_at: new Date(now).toISOString(),
        expires_at: new Date(now + ACQUISITION_RETENTION_MS).toISOString(),
      } as AcquisitionContext;
      window.localStorage.setItem(ACQUISITION_CONTEXT_STORAGE_KEY, JSON.stringify(context));
      return context;
    }

    const existing = parseStoredContext(window.localStorage.getItem(ACQUISITION_CONTEXT_STORAGE_KEY), now);
    if (!existing) window.localStorage.removeItem(ACQUISITION_CONTEXT_STORAGE_KEY);
    else window.localStorage.setItem(ACQUISITION_CONTEXT_STORAGE_KEY, JSON.stringify(existing));
    return existing;
  } catch {
    return null;
  }
}

export function getCampaignAttribution(): CampaignAttribution {
  return sanitiseCampaignAttribution(readAcquisitionContext());
}

export const ACQUISITION_CONSENT_EVENTS = [GA_CONSENT_EVENT, MARKETING_CONSENT_EVENT] as const;
