'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const assessmentActive = pathname === '/score/start' || pathname.startsWith('/score/assessment/');

  if (assessmentActive) {
    return (
      <div className="min-h-[100dvh] overflow-x-hidden bg-mk-cream pb-[env(safe-area-inset-bottom)]">
        <header className="border-b border-mk-line bg-white pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="font-semibold tracking-tight text-mk-ink">MK Fraud Insights</Link>
            <Link href="/fraud-readiness-score" className="min-h-11 rounded-xl border border-mk-line px-4 py-3 text-sm font-semibold text-mk-ink">Exit assessment</Link>
          </div>
        </header>
        <main>{children}</main>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
