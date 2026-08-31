import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Fraud Readiness Assessment Terms",
  description:
    "The terms that govern the MK Fraud Insights Fraud Readiness Assessment and the Snapshot, Essential and Comprehensive outputs prepared from it.",
  path: "/fraud-readiness-assessment-terms",
});

export default function FraudReadinessAssessmentTermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
