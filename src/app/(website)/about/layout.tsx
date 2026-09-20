import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "About MK Fraud Insights",
  description:
    "MK Fraud Insights is an independent South African fraud risk advisory practice helping organisations beyond financial services understand their fraud exposure, control coverage and priorities.",
  path: "/about",
});

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
