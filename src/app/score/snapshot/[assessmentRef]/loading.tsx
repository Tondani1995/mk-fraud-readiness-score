export default function SnapshotLoading() {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-mk-paper">
      <header className="border-b border-mk-line bg-mk-paper">
        <div className="mx-auto flex h-[50px] max-w-[1120px] items-center px-[18px] md:h-[54px] md:px-6">
          <span className="font-semibold tracking-tight text-mk-navy">MK FRAUD INSIGHTS</span>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-[1120px] px-[18px] py-12 md:px-6 md:py-16" aria-busy="true">
        <section className="rounded-2xl border border-mk-line bg-white">
          <div className="border-b border-mk-line px-5 py-6 md:px-8 md:py-8">
            <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">Private result</p>
            <h1 className="mt-2.5 max-w-[20ch] text-[26px] font-semibold tracking-tight text-mk-navy md:text-[36px]">Preparing your Fraud Readiness Snapshot</h1>
          </div>
          <div className="space-y-5 px-5 py-8 md:px-8 md:py-10">
            <p className="max-w-[62ch] text-base leading-7 text-mk-slate">Your assessment has been submitted. We are calculating your result and preparing your personalised Snapshot.</p>
            <div role="progressbar" aria-label="Preparing your Fraud Readiness Snapshot" aria-busy="true" className="h-2 overflow-hidden rounded-full bg-mk-line">
              <div className="h-full w-1/3 animate-pulse bg-mk-accent" />
            </div>
            <p role="status" aria-live="polite" className="text-sm text-mk-muted">Preparing your personalised Snapshot</p>
          </div>
        </section>
      </main>
    </div>
  );
}
