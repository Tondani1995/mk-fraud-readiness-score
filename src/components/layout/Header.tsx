import Link from 'next/link';
import { siteConfig } from '@/lib/config/site';

export function Header() {
  return (
    <header className="border-b border-mk-line bg-mk-cream/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-mk-brassDark">MK Fraud Insights</span>
          <span className="text-lg font-semibold text-mk-ink">{siteConfig.productName}</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-mk-muted md:flex">
          <Link href="/start" className="hover:text-mk-ink">Start assessment</Link>
          <Link href="/admin" className="hover:text-mk-ink">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
