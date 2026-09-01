import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/website/site";

// Keep the established legacy URL working for existing links, but make the public
// Fraud Readiness storefront the only canonical/indexable product page.
export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Fraud Readiness Options",
    description:
      "Choose the depth of fraud-readiness insight your organisation needs: Essential, Comprehensive or an MK Advisory engagement. Each begins with the MK Fraud Insights Fraud Readiness Assessment.",
    path: "/fraud-readiness",
  }),
  robots: {
    index: false,
    follow: true,
  },
};

export default function FraudReadinessScoreLegacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
