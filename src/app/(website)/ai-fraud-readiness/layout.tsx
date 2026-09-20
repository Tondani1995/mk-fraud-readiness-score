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

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is AI-enabled fraud?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "AI-enabled fraud is ordinary fraud carried out with generative AI tools. The intent is unchanged: obtain money, goods, access or information through deception. What changes is that impersonation, documents and correspondence can be produced convincingly, at volume and at low cost, which weakens controls that depend on a person recognising something as genuine.",
      },
    },
    {
      "@type": "Question",
      name: "Is AI-enabled fraud a cybersecurity problem?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Only in part. Most AI-enabled fraud does not breach a system. It persuades an authorised person to take an action they are entitled to take, which makes it a question of governance, verification design, authorisation rules and staff decision-making rather than a purely technical control question.",
      },
    },
    {
      "@type": "Question",
      name: "How can an organisation test its readiness for AI-enabled fraud?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Start by establishing where fraud exposure sits and whether existing controls still hold when a voice, a face or a document can be fabricated. The MK Fraud Readiness Assessment gives management a structured, private view of readiness across governance, detection, response, third-party and digital and identity fraud risk, and MK can then work through the AI-specific exposure in an advisory engagement.",
      },
    },
    {
      "@type": "Question",
      name: "What is synthetic identity fraud?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A synthetic identity combines real personal data with fabricated elements to create a person who does not exist but who passes verification. INTERPOL reports criminals building entirely synthetic identities designed to bypass verification, including biometric checks, in order to open accounts fraudulently.",
      },
    },
  ],
};

export default function AiFraudReadinessLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={serviceJsonLd} />
      <JsonLd data={faqJsonLd} />
      {children}
    </>
  );
}
