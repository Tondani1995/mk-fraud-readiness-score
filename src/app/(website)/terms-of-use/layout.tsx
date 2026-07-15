import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Terms of Use",
  description:
    "Read the MK Fraud Insights website terms of use for accessing fraud risk content, resources and enquiry forms.",
  path: "/terms-of-use",
});

export default function TermsOfUseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
