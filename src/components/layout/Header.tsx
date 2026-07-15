'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';

function isEmbeddedExperience() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('embed') === '1' || window.self !== window.top;
}

export function Header() {
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    setEmbedded(isEmbeddedExperience());
  }, []);

  if (embedded) return null;

  return (
    <header className="border-b border-mk-line bg-mk-paper">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/" aria-label="MK Fraud Insights" className="flex items-center">
          <Image src="/logo.png" alt="MK Fraud Insights" width={236} height={66} priority className="h-12 w-auto md:h-14" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-mk-muted md:flex">
          <Link href="/" className="transition hover:text-mk-ink">Home</Link>
          <Link href="/services" className="transition hover:text-mk-ink">Services</Link>
          <Link href="/industries" className="transition hover:text-mk-ink">Industries</Link>
          <Link href="/about" className="transition hover:text-mk-ink">About</Link>
          <Link href="/insights" className="transition hover:text-mk-ink">Insights</Link>
          <Link href="/fraud-readiness-score#start-score" className="rounded-full bg-mk-charcoal px-4 py-2 text-white transition hover:bg-mk-slate">Assess Your Organisation</Link>
        </nav>
      </div>
    </header>
  );
}
