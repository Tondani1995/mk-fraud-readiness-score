import { attioRestrictionConfigFromEnv } from '@/lib/marketing/attio-restrictions';
import { marketingStore } from '@/lib/marketing/marketing-store';
import { marketingResendConfigFromEnv } from '@/lib/marketing/resend-marketing';
import type { NewsletterDeps } from '@/lib/marketing/newsletter-service';

/**
 * Assemble the newsletter runtime from server environment. Returns null, and every caller then
 * refuses the request, when the mode is disabled or any required value is missing. There is no
 * partial operation: the newsletter is either fully configured or off.
 */
export function newsletterDepsFromEnv(): NewsletterDeps | null {
  const resend = marketingResendConfigFromEnv();
  const pepper = process.env.MK_MARKETING_HASH_PEPPER?.trim();
  const siteUrl = process.env.MK_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!resend || !pepper || pepper.length < 32 || !siteUrl) return null;
  return {
    store: marketingStore(),
    resend,
    attio: attioRestrictionConfigFromEnv(),
    pepper,
    siteUrl
  };
}

export function marketingWebhookSecret(): string | null {
  const secret = process.env.RESEND_MARKETING_WEBHOOK_SECRET?.trim();
  // Never fall back to the transactional RESEND_WEBHOOK_SECRET.
  return secret && secret.startsWith('whsec_') ? secret : null;
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const candidate = forwarded?.split(',')[0]?.trim();
  return candidate || null;
}
