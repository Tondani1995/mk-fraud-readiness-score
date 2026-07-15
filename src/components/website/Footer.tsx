"use client";

import { Mail, Linkedin, ArrowRight, MapPin, ExternalLink } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/website/ui/button";
import { trackEvent } from "@/lib/website/gtag";

const linkedInUrl = "https://www.linkedin.com/company/mkstratinsights/";

export default function Footer() {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  const companyLinks = [
    { name: "About", href: "/about" },
    { name: "Services", href: "/services" },
    { name: "Industries", href: "/industries" },
    { name: "Insights", href: "/insights" },
  ];

  const serviceLinks = [
    { name: "Fraud Readiness Score", href: "/fraud-readiness-score" },
    { name: "Fraud Health Check", href: "/services#health-check" },
    { name: "Threat Intelligence for Fraud", href: "/services#threat-intelligence" },
    { name: "Programme Design", href: "/services#programme-design" },
    { name: "Awareness & Resilience", href: "/services#awareness" },
    { name: "Internal Controls", href: "/services#controls" },
  ];

  return (
    <footer className="relative overflow-hidden bg-[#001030]">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_18%_15%,#1d36581f,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_85%_85%,#ffffff10,transparent_65%)]" />

      <div className="relative mx-auto max-w-7xl px-6 pb-10 pt-20 lg:px-8 lg:pt-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <div className="mb-6 inline-flex items-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-white/15 bg-white/95 shadow-lg">
                <Image src="/logoicon.png" width={60} height={60} alt="MK Fraud Insights" />
              </div>
            </div>

            <p className="mb-6 text-sm leading-relaxed text-white/75">
              MK Fraud Insights helps organisations see where fraud risk lives, measure readiness, and strengthen controls before losses become visible.
            </p>

            <div className="flex gap-3">
              <Link
                href={linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("social_click", { platform: "linkedin", placement: "footer_social" })}
                className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:bg-white/10"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-5 w-5 text-white/70 transition-colors group-hover:text-white" />
              </Link>
              <Link
                href="mailto:hello@mkfraud.co.za"
                onClick={() => trackEvent("contact_click", { contact_type: "email", placement: "footer_social" })}
                className="group flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:bg-white/10"
                aria-label="Email"
              >
                <Mail className="h-5 w-5 text-white/70 transition-colors group-hover:text-white" />
              </Link>
            </div>
          </div>

          <div>
            <h4 className="mb-6 flex items-center gap-2 text-sm font-bold leading-tight uppercase tracking-wider text-white">
              <div className="h-1 w-8 rounded-full bg-white/25" />
              Company
            </h4>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-2 text-sm text-white/75 transition-all duration-300 hover:translate-x-2 hover:text-white"
                    onMouseEnter={() => setHoveredLink(link.name)}
                    onMouseLeave={() => setHoveredLink(null)}
                  >
                    <ArrowRight className={`h-4 w-4 transition-all duration-300 ${hoveredLink === link.name ? "opacity-100" : "opacity-0"}`} />
                    <span>{link.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-6 flex items-center gap-2 text-sm font-bold leading-tight uppercase tracking-wider text-white">
              <div className="h-1 w-8 rounded-full bg-white/25" />
              Services
            </h4>
            <ul className="space-y-3">
              {serviceLinks.map((link) => (
                <li key={link.name}>
                  <Link
                    href={link.href}
                    className="group flex items-center gap-2 text-sm text-white/75 transition-all duration-300 hover:translate-x-2 hover:text-white"
                    onMouseEnter={() => setHoveredLink(link.name)}
                    onMouseLeave={() => setHoveredLink(null)}
                  >
                    <ArrowRight className={`h-4 w-4 transition-all duration-300 ${hoveredLink === link.name ? "opacity-100" : "opacity-0"}`} />
                    <span>{link.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-6 flex items-center gap-2 text-sm font-bold leading-tight uppercase tracking-wider text-white">
              <div className="h-1 w-8 rounded-full bg-white/25" />
              Contact
            </h4>

            <div className="space-y-4">
              <Link
                href="mailto:hello@mkfraud.co.za"
                onClick={() => trackEvent("contact_click", { contact_type: "email", placement: "footer_contact_card" })}
                className="group flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/10"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Mail className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/55">Email</p>
                  <p className="text-sm text-white">hello@mkfraud.co.za</p>
                </div>
                <ExternalLink className="ml-auto h-4 w-4 text-white/40 transition-all group-hover:text-white/80" />
              </Link>

              <Link
                href={linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("social_click", { platform: "linkedin", placement: "footer_contact_card" })}
                className="group flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm transition-all duration-300 hover:scale-105 hover:bg-white/10"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Linkedin className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/55">Connect</p>
                  <p className="text-sm text-white">LinkedIn Page</p>
                </div>
                <ExternalLink className="ml-auto h-4 w-4 text-white/40 transition-all group-hover:text-white/80" />
              </Link>

              <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-3 backdrop-blur-sm">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white/55">Location</p>
                  <p className="text-sm text-white">South Africa</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-20">
          <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/5 p-8 backdrop-blur-xl lg:p-12">
            <div className="relative flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
              <div className="max-w-xl">
                <h3 className="mb-2 text-2xl font-bold leading-tight text-white lg:text-3xl">
                  Assess your organisation&apos;s fraud readiness.
                </h3>
                <p className="text-white/75">
                  Complete the self-assessment, see your free snapshot, then decide whether to request the detailed report.
                </p>
              </div>

              <Link
                href="/fraud-readiness-score#start-score"
                onClick={() => trackEvent("cta_click", { cta_name: "footer_assess_your_organisation", placement: "footer_cta" })}
              >
                <Button className="group rounded-xl bg-white px-8 py-6 text-[#001030] shadow-2xl transition-all duration-300 hover:scale-105 hover:bg-white/90">
                  <span className="flex items-center gap-2">
                    Assess Your Organisation
                    <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center text-sm text-white/60 lg:flex-row lg:justify-between lg:text-left">
            <p>MK Fraud Insights is a product of Stonda (Pty) Ltd.</p>
            <div className="flex flex-wrap gap-6">
              <span>Copyright 2020 Stonda (Pty) Ltd. All rights reserved.</span>
              <Link href="/privacy-policy" className="transition-colors hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms-of-use" className="transition-colors hover:text-white">
                Terms of use
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
