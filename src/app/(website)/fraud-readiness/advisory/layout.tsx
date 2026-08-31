import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Discuss an MK Advisory Engagement",
  description:
    "Tell MK Fraud Insights what you need from an Advisory engagement. Advisory is manually scoped and contracted; this enquiry prepares MK for a scoping conversation and creates no order.",
  path: "/fraud-readiness/advisory",
});

export default function PublicAdvisoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
