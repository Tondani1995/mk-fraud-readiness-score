import type { Metadata } from 'next';
import { Suspense } from 'react';
import GoogleAnalytics from '@/components/website/GoogleAnalytics';
import CookieConsent from '@/components/website/CookieConsent';
import MetaPixel from '@/components/website/MetaPixel';
import JsonLd from '@/components/website/JsonLd';
import {
  DEFAULT_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  organizationJsonLd
} from '@/lib/website/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Fraud Strategy, Risk & Awareness Consulting`,
    template: `%s | ${SITE_NAME}`
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'fraud consulting',
    'fraud risk management',
    'fraud strategy',
    'fraud awareness training',
    'internal fraud controls',
    'fraud health check',
    'South Africa fraud consulting',
    'non-financial fraud risk'
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    locale: 'en_ZA',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: 'Helping organisations move beyond reactive fraud controls toward resilient, intelligence-led fraud programmes.'
  }
};

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={organizationJsonLd} />
      <Suspense fallback={null}>
        <GoogleAnalytics />
      </Suspense>
      <Suspense fallback={null}>
        <MetaPixel />
      </Suspense>
      <a href="#website-main-content" className="sr-only z-50 rounded-md bg-white px-4 py-3 font-semibold text-mk-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-mk-brass focus:ring-offset-2">Skip to content</a>
      <div id="website-main-content" tabIndex={-1}>{children}</div>
      <CookieConsent />
    </>
  );
}
