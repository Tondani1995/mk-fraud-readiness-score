'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function Header() {
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    setEmbedded(new URLSearchParams(window.location.search).get('embed') === '1');
  }, []);

  if (embedded) return null;

  return (
    <header className="border-b border-mk-line bg-mk-paper">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/start" aria-label="MK Fraud Insights" className="flex items-center">
          <img src="https://mkfraud.co.za/logo.png" alt="MK Fraud Insights" className="h-12 w-auto md:h-14" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-mk-muted md:flex">
          <a href="https://www.mkfraud.co.za/" className="transition hover:text-mk-ink">Home</a>
          <a href="https://www.mkfraud.co.za/services" className="transition hover:text-mk-ink">Services</a>
          <a href="https://www.mkfraud.co.za/industries" className="transition hover:text-mk-ink">Industries</a>
          <a href="https://www.mkfraud.co.za/about" className="transition hover:text-mk-ink">About</a>
          <a href="https://www.mkfraud.co.za/insights" className="transition hover:text-mk-ink">Insights</a>
          <a href="https://www.mkfraud.co.za/fraud-readiness-score" className="rounded-full bg-mk-charcoal px-4 py-2 text-white transition hover:bg-mk-slate">Start Score</a>
        </nav>
      </div>
    </header>
  );
}
