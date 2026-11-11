import Image from 'next/image';
import { ReviewAnalyticsGuard } from '@/components/readiness-review/ReviewAnalyticsGuard';
import type { Metadata } from 'next';
import { harnessNotice, reviewHarnessStatus } from '@/lib/readiness-review/harness';

export const metadata: Metadata = {
  title: { default: 'Fraud Readiness review | MK Fraud Insights', template: '%s | MK Fraud Insights' },
  robots: { index: false, follow: false },
  referrer: 'no-referrer'
};

/** Chrome for the review track: MK identity, a constant fictional-harness notice and a single way out. */
export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  const harness = reviewHarnessStatus();
  return (
    <div className="mk-product min-h-[100dvh] overflow-x-clip bg-mk-cream pb-[env(safe-area-inset-bottom)]">
      <ReviewAnalyticsGuard />
      <a href="#main-content" className="sr-only z-50 rounded-md bg-white px-4 py-3 font-semibold text-mk-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-mk-navy">
        Skip to content
      </a>
      <header className="border-b border-mk-line bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Full page loads out of the review track, so no review path stays in a document that later runs analytics. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load out of the review track is intended */}
          <a href="/" aria-label="MK Fraud Insights home">
            <Image src="/logo.png" alt="MK Fraud Insights" width={160} height={45} className="h-7 w-auto" priority />
          </a>
          <a href="/fraud-readiness" className="inline-flex min-h-11 items-center rounded-md border border-mk-line px-4 text-sm font-semibold text-mk-ink">
            Exit
          </a>
        </div>
        {harness.enabled && (
          <p className="border-t border-mk-line bg-mk-cream px-4 py-2 text-center text-xs leading-5 text-mk-ink sm:text-sm" data-harness-notice>
            {harnessNotice()}
          </p>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
