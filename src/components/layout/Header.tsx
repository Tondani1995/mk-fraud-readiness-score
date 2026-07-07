import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-mk-line bg-mk-paper">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
        <Link href="/start" className="flex items-center gap-4" aria-label="MK Fraud Insights">
          <span className="text-3xl font-black uppercase tracking-[-0.12em] text-mk-charcoal md:text-4xl">MK</span>
          <span className="flex flex-col leading-none">
            <span className="text-xl font-black uppercase tracking-[-0.04em] text-mk-charcoal md:text-2xl">Fraud</span>
            <span className="text-lg font-semibold uppercase tracking-[-0.03em] text-mk-slate md:text-xl">Insights</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-mk-muted md:flex">
          <a href="https://www.mkfraud.co.za/" className="transition hover:text-mk-ink">Home</a>
          <a href="https://www.mkfraud.co.za/services" className="transition hover:text-mk-ink">Services</a>
          <a href="https://www.mkfraud.co.za/industries" className="transition hover:text-mk-ink">Industries</a>
          <a href="https://www.mkfraud.co.za/about" className="transition hover:text-mk-ink">About</a>
          <a href="https://www.mkfraud.co.za/insights" className="transition hover:text-mk-ink">Insights</a>
          <a href="https://www.mkfraud.co.za/contact" className="rounded-full bg-mk-charcoal px-4 py-2 text-white transition hover:bg-mk-slate">Book a Call</a>
        </nav>
      </div>
    </header>
  );
}
