import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Fraud Risk Services",
  description:
    "MK Fraud Insights helps organisations assess, build, enable and monitor fraud risk management, through fraud health checks, programme design, internal and procurement controls, awareness training and threat intelligence.",
  path: "/services",
});

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
