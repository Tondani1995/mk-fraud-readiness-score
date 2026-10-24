import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "MK Clarity | Development review",
  robots: { index: false, follow: false },
};
export default function DesignReview() {
  if (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" &&
      process.env.VERCEL_ENV !== "preview")
  )
    notFound();
  const groups = [
    [
      "The public experience",
      [
        ["Homepage", "/"],
        ["Services & navigation", "/services"],
        ["Fraud Readiness", "/fraud-readiness"],
        ["Report options", "/fraud-readiness#products"],
        ["Advisory enquiry", "/fraud-readiness/advisory"],
        ["About the practice", "/about"],
        ["Industries", "/industries"],
        ["Insights", "/insights"],
        ["AI fraud readiness", "/ai-fraud-readiness"],
        ["Contact", "/contact"],
      ],
    ],
    [
      "The assessment",
      [
        ["Terms & organisation profile", "/score/start"],
        ["Early questionnaire", "/score/visual-review/adaptive/early"],
        ["Mid questionnaire", "/score/visual-review/adaptive/mid"],
        ["Late questionnaire", "/score/visual-review/adaptive/late"],
        ["Review before submission", "/score/visual-review/adaptive/review"],
        ["Submitted state", "/score/visual-review/adaptive/submitted"],
      ],
    ],
    [
      "The management result",
      [
        ["Snapshot · 60", "/score/visual-review/snapshot/score-60"],
        ["Snapshot · 20", "/score/visual-review/snapshot/score-20"],
        ["Snapshot · 100", "/score/visual-review/snapshot/score-100"],
        [
          "Insufficient visibility",
          "/score/visual-review/snapshot/insufficient-visibility",
        ],
        ["Private-link protection", "/score/snapshot/REVIEW-NO-ACCESS"],
      ],
    ],
    [
      "The next engagement",
      [
        [
          "Essential confirmation",
          "/score/visual-review/order/essential/confirm",
        ],
        [
          "Billing & invoice",
          "/score/visual-review/order/essential/billing-invoice",
        ],
        ["EFT instructions", "/score/visual-review/order/essential/payment"],
        [
          "Comprehensive confirmation",
          "/score/visual-review/order/comprehensive/confirm",
        ],
        ["Payment status states", "/design-review/states"],
        ["Report identity prototype", "/design-review/report"],
      ],
    ],
  ] as const;
  return (
    <main className="review-hub">
      <header>
        <Link href="/">MK / FRAUD INSIGHTS</Link>
        <span>LOCAL DEVELOPMENT REVIEW · 24 OCTOBER 2026</span>
      </header>
      <div className="review-hub-intro">
        <p className="clarity-eyebrow">THE LIVING EXPOSURE SYSTEM</p>
        <h1>
          From fragmented exposure
          <br />
          <em>to management clarity.</em>
        </h1>
        <p>
          A working design in the existing MK application. Explore the public
          experience and isolated product states below.
        </p>
        <aside>
          Assessment, Snapshot and order review routes use labelled synthetic
          fixtures. They cannot save answers, submit assessments, create orders
          or take payment. The production APIs and business rules remain
          unchanged. No service credentials are configured in this checkout.
        </aside>
      </div>
      <div className="review-hub-groups">
        {groups.map(([title, links], i) => (
          <section key={title}>
            <p className="clarity-eyebrow">0{i + 1} / REVIEW</p>
            <h2>{title}</h2>
            <ul>
              {links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href}>
                    {label}
                    <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <footer>
        Development branch: design/mk-management-clarity · No production release
      </footer>
    </main>
  );
}
