import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Fraud Risk Services",
  description:
    "Explore MK Fraud Insights services including fraud health checks, threat intelligence, programme design, awareness training and internal fraud controls.",
  path: "/services",
});

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
