import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Contact MK Fraud Insights",
  description:
    "Contact MK Fraud Insights to discuss fraud health checks, fraud programme design, threat intelligence and practical fraud risk support for your organisation.",
  path: "/contact",
});

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
