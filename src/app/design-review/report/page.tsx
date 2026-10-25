import Link from "next/link";
import { notFound } from "next/navigation";
import { buildSnapshotVisualReviewFixture } from "@/lib/visual-review/fixtures";
import { buildCommercialSnapshotInsights } from "@/lib/snapshot/commercial-insights";
import { DomainReadinessMap } from "@/components/clarity/DomainReadinessMap";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Report identity prototype | Isolated review",
  robots: { index: false, follow: false },
};
export default function ReportIdentity() {
  if (
    process.env.VERCEL_ENV === "production" ||
    (process.env.NODE_ENV === "production" &&
      process.env.VERCEL_ENV !== "preview")
  )
    notFound();
  const snapshot = buildSnapshotVisualReviewFixture("score-60");
  const insights = buildCommercialSnapshotInsights(snapshot);
  return (
    <main className="report-prototype">
      <nav>
        <Link href="/design-review">← Development review</Link>
        <span>ISOLATED DESIGN PROTOTYPE · SYNTHETIC DATA</span>
      </nav>
      <article className="report-cover">
        <header>
          MK / FRAUD INSIGHTS <span>MANAGEMENT SERIES</span>
        </header>
        <div className="report-cover-title">
          <p>FRAUD READINESS</p>
          <h1>Fraud Readiness Report</h1><p>Prepared for {snapshot.organisationName}</p>
          <p>Representative report identity</p>
        </div>
        <footer>
          <div>
            <span className="!text-mk-line">PREPARED FOR</span>
            <strong>{snapshot.organisationName}</strong>
          </div>
          <div>
            <span className="!text-mk-line">STATUS</span>
            <strong>Synthetic design specimen</strong>
          </div>
        </footer>
      </article>
      <article className="report-summary">
        <p className="clarity-eyebrow">Management review</p>
        <h2>The management view</h2>
        <div className="report-summary-grid">
          <div>
            <span>RECORDED READINESS</span>
            <strong>
              {snapshot.overallScore}
              <small>/100</small>
            </strong>
            <p>{snapshot.finalMaturity}</p>
          </div>
          <p>{insights.riskImplication}</p>
        </div>
        <p className="report-prototype-note">
          Representative Snapshot fixture, rendered without changing finding
          language. This specimen explores report identity only. It is not an
          Essential or Comprehensive report, a paid deliverable or an assurance
          opinion. The existing report generator is unchanged.
        </p>
      </article>
      <div className="mk-product">
        <DomainReadinessMap snapshot={snapshot} />
      </div>
    </main>
  );
}
