import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Industries We Support",
  description:
    "See how MK Fraud Insights supports fraud risk management across retail, logistics, public sector, utilities, education and other operating environments.",
  path: "/industries",
});

export default function IndustriesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
