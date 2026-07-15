import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "About MK Fraud Insights",
  description:
    "Learn about MK Fraud Insights, a South African fraud risk and strategy consultancy built around practical fraud controls, intelligence-led advisory and operational resilience.",
  path: "/about",
});

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
