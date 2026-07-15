import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Fraud Risk Insights",
  description:
    "Read MK Fraud Insights articles on fraud trends, control weaknesses, fraud awareness, operational resilience and practical fraud risk strategy.",
  path: "/insights",
});

export default function InsightsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
