import JsonLd from "@/components/website/JsonLd";
import { buildPageMetadata, SITE_NAME, absoluteUrl } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "AI Fraud Readiness",
  description:
    "AI-enabled fraud is changing what organisations can safely trust. MK Fraud Insights explains deepfake and voice-cloning impersonation, synthetic identities, AI-generated documents and automated social engineering, and how South African organisations can assess and strengthen their readiness.",
  path: "/ai-fraud-readiness",
});

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "AI Fraud Readiness advisory",
  serviceType: "Fraud risk advisory for AI-enabled fraud",
  provider: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl() },
  areaServed: ["South Africa", "Africa"],
  url: absoluteUrl("/ai-fraud-readiness"),
  description:
    "Assessment, control design, enablement and monitoring for AI-enabled fraud, including deepfake and voice-cloned impersonation, synthetic identities, AI-generated documents and AI-assisted social engineering.",
};

export default function AiFraudReadinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={serviceJsonLd} />
      {children}
    </>
  );
}
