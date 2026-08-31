import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Fraud Readiness Options",
  description:
    "Choose the depth of fraud-readiness insight your organisation needs: Essential, Comprehensive or an MK Advisory engagement. Each begins with the MK Fraud Insights Fraud Readiness Assessment.",
  path: "/fraud-readiness",
});

export default function FraudReadinessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
