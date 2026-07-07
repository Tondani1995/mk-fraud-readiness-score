export function Footer() {
  return (
    <footer className="border-t border-mk-line bg-mk-charcoal text-mk-cream">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 text-sm md:grid-cols-[1.2fr_0.8fr_0.8fr] md:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-mk-brass">MK Fraud Insights</p>
          <p className="mt-3 max-w-md leading-6 text-mk-line/80">
            Specialist fraud risk and strategy support for organisations that need clearer visibility of fraud exposure, control gaps and practical next steps.
          </p>
        </div>
        <div>
          <p className="font-semibold text-mk-cream">Platform</p>
          <div className="mt-3 space-y-2 text-mk-line/75">
            <p>Fraud Readiness Score</p>
            <p>Accountless assessment</p>
            <p>MK-controlled reporting</p>
          </div>
        </div>
        <div>
          <p className="font-semibold text-mk-cream">Contact</p>
          <div className="mt-3 space-y-2 text-mk-line/75">
            <p>hello@mkfraud.co.za</p>
            <p>South Africa</p>
            <a href="https://www.mkfraud.co.za" className="inline-block text-mk-brass hover:text-mk-cream">Back to MK Fraud</a>
          </div>
        </div>
      </div>
      <div className="border-t border-mk-cream/10 px-5 py-4 text-center text-xs text-mk-line/60">
        © {new Date().getFullYear()} MK Fraud Insights. All rights reserved.
      </div>
    </footer>
  );
}
