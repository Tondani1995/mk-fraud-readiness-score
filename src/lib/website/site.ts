import type { Metadata } from "next";

export const SITE_URL = "https://www.mkfraud.co.za";
export const SITE_NAME = "MK Fraud Insights";
export const COMPANY_NAME = "Stonda (Pty) Ltd";
export const LINKEDIN_URL = "https://www.linkedin.com/company/mkstratinsights/";
export const CONTACT_EMAIL = "hello@mkfraud.co.za";
export const CONTACT_PHONE = "+27823014351";

export const DEFAULT_DESCRIPTION =
  "MK Fraud Insights is a South African fraud risk and strategy consultancy helping organisations reduce fraud losses through intelligence-led strategy, practical controls, and targeted awareness training.";

export function absoluteUrl(path = "") {
  if (!path) return SITE_URL;
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildPageMetadata({
  title,
  description,
  path = "",
  type = "website",
}: {
  title: string;
  description: string;
  path?: string;
  type?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(path);

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type,
      locale: "en_ZA",
      url,
      siteName: SITE_NAME,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: SITE_NAME,
  legalName: COMPANY_NAME,
  url: SITE_URL,
  email: CONTACT_EMAIL,
  telephone: CONTACT_PHONE,
  areaServed: ["South Africa", "Africa"],
  sameAs: [LINKEDIN_URL],
  description: DEFAULT_DESCRIPTION,
  parentOrganization: {
    "@type": "Organization",
    name: COMPANY_NAME,
  },
};
