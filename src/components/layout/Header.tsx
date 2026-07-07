import Link from 'next/link';
import { siteConfig } from '@/lib/config/site';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-mk-line/80 bg-mk-paper/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/" className="group flex items-center gap-3" aria-label="MK Fraud Readiness Score home">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-mk-line bg-mk-ink text-xs font-semibold tracking-[0.18em] text-mk-cream shadow-soft">
            MK
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mk-brassDark">MK Fraud Insights</span>
            <span className="text-sm font-semibold text-mk-ink md:text-base">{siteConfig.productName}</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-mk-muted md:flex">
          <a href="https://www.mkfraud.co.za/services" className="transition hover:text-mk-ink">Services</a>
          <a href="https://www.mkfraud.co.za/insights" className="transition hover:text-mk-ink">Insights</a>
          <Link href="/start" className="transition hover:text-mk-ink">Start assessment</Link>
          <Link href="/admin" className="rounded-full border border-mk-line bg-mk-paper px-4 py-2 text-mk-ink transition hover:border-mk-brass">Admin</Link>
        </nav>
      </div>
    </header>
  );
}
