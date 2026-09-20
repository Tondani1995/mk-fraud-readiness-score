import { Linkedin, Mail } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import TrackedLink from "@/components/website/TrackedLink";
import { CAPABILITIES } from "@/lib/website/capabilities";

const linkedInUrl = "https://www.linkedin.com/company/mkstratinsights/";

const companyLinks = [
  { name: "About", href: "/about" },
  { name: "Insights", href: "/insights" },
  { name: "Industries", href: "/industries" },
  { name: "Contact", href: "/contact" },
];

const readinessLinks = [
  { name: "Overview", href: "/fraud-readiness" },
  { name: "Advisory", href: "/fraud-readiness/advisory" },
  { name: "Assessment terms", href: "/fraud-readiness-assessment-terms" },
];

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50 sm:tracking-[0.2em]">{title}</h2>
      <ul className="mt-4 space-y-1">{children}</ul>
    </div>
  );
}

const linkClass = "inline-flex min-h-10 items-center text-[15px] text-white/80 transition-colors hover:text-white";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#001030] text-white">
      <div className="mx-auto max-w-7xl px-5 pb-8 pt-14 sm:px-6 lg:px-8 lg:pt-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))] lg:gap-12">
          <div className="max-w-sm">
            <Link href="/" aria-label="MK Fraud Insights home" className="inline-flex rounded-xl bg-white p-2.5">
              <Image src="/logoicon.png" width={47} height={40} alt="MK Fraud Insights" loading="eager" className="h-10 w-auto" />
            </Link>
            <p className="mt-5 text-[15px] leading-7 text-white/70">
              Independent fraud risk advisory for South African organisations. We help leadership see where fraud
              exposure sits, whether controls cover it and what to fix first.
            </p>
            <div className="mt-5 flex gap-2">
              <TrackedLink
                href={linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                eventName="social_click"
                eventParams={{ platform: "linkedin", placement: "footer_social" }}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="MK Fraud Insights on LinkedIn"
              >
                <Linkedin className="h-5 w-5" />
              </TrackedLink>
              <TrackedLink
                href="mailto:hello@mkfraud.co.za"
                eventName="contact_click"
                eventParams={{ contact_type: "email", placement: "footer_social" }}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Email MK Fraud Insights"
              >
                <Mail className="h-5 w-5" />
              </TrackedLink>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-8 lg:col-span-3 lg:gap-12">
            <FooterColumn title="Services">
              {CAPABILITIES.map((capability) => (
                <li key={capability.id}>
                  <Link href={`/services#${capability.id}`} className={linkClass}>{capability.name}</Link>
                </li>
              ))}
              <li>
                <Link href="/ai-fraud-readiness" className={linkClass}>AI fraud readiness</Link>
              </li>
            </FooterColumn>
            <FooterColumn title="Fraud Readiness">
              <li>
                <TrackedLink href="/score/start" ctaName="footer_assess_your_organisation" placement="footer_cta" className={linkClass}>
                  Start assessment
                </TrackedLink>
              </li>
              {readinessLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>{link.name}</Link>
                </li>
              ))}
            </FooterColumn>
            <FooterColumn title="Company">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={linkClass}>{link.name}</Link>
                </li>
              ))}
            </FooterColumn>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-white/55 lg:flex-row lg:items-center lg:justify-between">
          <p>&copy; {year} Stonda (Pty) Ltd. MK Fraud Insights is a product of Stonda (Pty) Ltd.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <TrackedLink href="mailto:hello@mkfraud.co.za" eventName="contact_click" eventParams={{ contact_type: "email", placement: "footer_contact_card" }} className="inline-flex min-h-10 items-center hover:text-white">hello@mkfraud.co.za</TrackedLink>
            <Link href="/privacy-policy" className="inline-flex min-h-10 items-center hover:text-white">Privacy Policy</Link>
            <Link href="/terms-of-use" className="inline-flex min-h-10 items-center hover:text-white">Terms of use</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
