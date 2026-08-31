export default function Loading() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#000814] via-[#001030] to-[#0b1b33] px-6">
      <style>{`
        @keyframes loading-progress {
          0% {
            width: 0%;
          }
          100% {
            width: 100%;
          }
        }
      `}</style>

      <div
        role="status"
        aria-live="polite"
        className="relative w-full max-w-md text-white"
      >
        <div className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/85">
          MK Fraud Insights
        </div>

        <h1 className="mt-6 text-3xl font-semibold leading-tight tracking-tight">
          Loading your experience
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-white/75">
          Preparing the latest insights, services, and analytics view for you.
        </p>

        <div className="mt-8 flex items-end gap-2">
          <span className="h-10 w-3 animate-pulse rounded-full bg-white/90 [animation-delay:0ms]" />
          <span className="h-16 w-3 animate-pulse rounded-full bg-[#9fb8cf] [animation-delay:150ms]" />
          <span className="h-12 w-3 animate-pulse rounded-full bg-white/80 [animation-delay:300ms]" />
          <span className="h-20 w-3 animate-pulse rounded-full bg-[#7ca2c4] [animation-delay:450ms]" />
          <span className="h-14 w-3 animate-pulse rounded-full bg-white/85 [animation-delay:600ms]" />
        </div>

        <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-white"
            style={{ animation: "loading-progress 1.6s ease-in-out infinite" }}
          />
        </div>

        <p className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-white/60">
          Please wait
        </p>
      </div>
    </main>
  );
}
