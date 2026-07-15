import { buildPageMetadata } from "@/lib/website/site";

export const metadata = buildPageMetadata({
  title: "Privacy Policy",
  description:
    "Read the MK Fraud Insights privacy policy for information about how website enquiries, analytics and personal information are handled.",
  path: "/privacy-policy",
});

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
