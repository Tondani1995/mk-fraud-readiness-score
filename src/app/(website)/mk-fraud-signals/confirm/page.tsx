import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Wrapper from "@/components/website/Wrapper";
import { NEWSLETTER_ENABLED } from "@/lib/marketing/newsletter-flag";
import ConfirmSubscription from "@/components/website/newsletter/ConfirmSubscription";

export const metadata: Metadata = {
  title: "Confirm your subscription | MK Fraud Signals",
  robots: { index: false, follow: false },
};

export default function ConfirmPage() {
  if (!NEWSLETTER_ENABLED) notFound();
  return (
    <Wrapper>
      <main className="bg-white">
        <section className="mk-frame py-16 sm:py-24" aria-labelledby="confirm-heading">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-accent">MK Fraud Signals</p>
          <h1 id="confirm-heading" className="mt-4 text-3xl font-semibold leading-tight tracking-normal text-mk-navy sm:text-4xl">
            Confirm your subscription
          </h1>
          <ConfirmSubscription />
        </section>
      </main>
    </Wrapper>
  );
}
