import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PaymentStatePanel,
  PAYMENT_STATE_LABELS,
} from "@/components/payments/PaymentStatePanel";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Payment states | Isolated review",
  robots: { index: false, follow: false },
};
export default function StateReview() {
  if (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" &&
      process.env.VERCEL_ENV !== "preview")
  )
    notFound();
  return (
    <main className="mk-product review-states">
      <div className="review-state-container">
        <Link href="/design-review">← Development review</Link>
        <p className="clarity-eyebrow">
          SYNTHETIC STATE LIBRARY · NO PAYMENT HAS OCCURRED
        </p>
        <h1>Every state needs a clear next step.</h1>
        <p>
          These are the actual payment status presentation component’s supported
          states. No polling, order mutation, payment or delivery occurs here.
        </p>
        <div className="review-state-grid">
          {Object.keys(PAYMENT_STATE_LABELS).map((state) => (
            <PaymentStatePanel
              key={state}
              state={state}
              fulfilment="NOT_REQUESTED"
              orderReference="SYNTHETIC-REVIEW"
            />
          ))}
          <PaymentStatePanel
            state="PAYMENT_PENDING"
            fulfilment="NOT_REQUESTED"
            error="Verified payment status is temporarily unavailable. Please refresh to retry."
            orderReference="SYNTHETIC-REVIEW"
          />
        </div>
        <aside className="review-limitation">
          Report delivery is a gated backend workflow, with secure report access
          links. The production generator, private download route and
          notification system have not been changed or exercised. No release or
          download is represented as completed here.
        </aside>
      </div>
    </main>
  );
}
