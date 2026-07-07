export function Footer() {
  return (
    <footer className="border-t border-mk-line bg-mk-charcoal text-mk-cream">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 text-sm md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} MK Fraud Insights. Internal V1 scaffold.</p>
        <p className="text-mk-line/70">No benchmarking. No AI scoring. Manual EFT flow.</p>
      </div>
    </footer>
  );
}
