'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const assessmentActive = pathname === '/score/start'
    || pathname.startsWith('/score/assessment/')
    || pathname === '/score/adaptive'
    || pathname.startsWith('/score/adaptive/')
    || pathname.startsWith('/score/visual-review/adaptive/');

  // A completed result and its order journey carry their own chrome (ResultChrome), rendered
  // by those routes. They must never inherit the marketing header, whose dominant control is
  // "Assess Your Organisation" -- an invitation to redo the assessment just completed.
  const resultActive = pathname.startsWith('/score/snapshot/')
    || pathname.startsWith('/score/order/')
    || pathname.startsWith('/score/visual-review/snapshot/')
    || pathname.startsWith('/score/visual-review/order/');

  if (resultActive) return <div className="mk-product">{children}</div>;

  if (assessmentActive) {
    return (
      <div className="mk-product min-h-[100dvh] overflow-x-hidden bg-mk-cream pb-[env(safe-area-inset-bottom)]">
        <a href="#main-content" className="sr-only z-50 rounded-md bg-white px-4 py-3 font-semibold text-mk-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-mk-brass focus:ring-offset-2">Skip to content</a>
        <header className="border-b border-mk-line bg-white pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="font-semibold tracking-tight text-mk-ink" aria-label="MK Fraud Insights home"><Image src="/logo.png" alt="MK Fraud Insights" width={160} height={45} className="h-7 w-auto" /></Link>
            <Link href="/fraud-readiness" className="min-h-11 rounded-xl border border-mk-line px-4 py-3 text-sm font-semibold text-mk-ink">Exit assessment</Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>{children}</main>
      </div>
    );
  }

  return (
    <div className="mk-product">
      <a href="#main-content" className="sr-only z-50 rounded-md bg-white px-4 py-3 font-semibold text-mk-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-mk-brass focus:ring-offset-2">Skip to content</a>
      <Header />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer />
    </div>
  );
}
