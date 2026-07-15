"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/website/ui/button";
import { trackEvent } from "@/lib/website/gtag";

const services = [
  { name: "Fraud Readiness Score", href: "/fraud-readiness-score" },
  { name: "Fraud Health Check", href: "/services#health-check" },
  { name: "Threat Intelligence for Fraud", href: "/services#threat-intelligence" },
  { name: "Programme Design", href: "/services#programme-design" },
  { name: "Awareness & Resilience", href: "/services#awareness" },
  { name: "Internal Controls", href: "/services#controls" },
];

const links = [
  { name: "Home", href: "/" },
  { name: "Industries", href: "/industries" },
  { name: "About", href: "/about" },
  { name: "Insights", href: "/insights" },
  { name: "Contact", href: "/contact" },
];

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${isScrolled ? "border-b border-slate-200 bg-white/95 shadow-lg backdrop-blur-xl" : "bg-white"}`}>
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between md:h-24">
          <Link href="/" className="flex items-center" aria-label="MK Fraud Insights home">
            <Image src="/logo.png" width={170} height={44} alt="MK Fraud Insights" priority />
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            <Link href="/" className="py-3 font-medium text-slate-700 transition-colors hover:text-[#001030]">Home</Link>
            <div className="relative">
              <button type="button" onClick={() => setServicesOpen((value) => !value)} className="flex items-center gap-1 py-3 font-medium text-slate-700 transition-colors hover:text-[#001030]" aria-expanded={servicesOpen}>
                Services <ChevronDown className={`h-4 w-4 transition-transform ${servicesOpen ? "rotate-180" : ""}`} />
              </button>
              {servicesOpen ? (
                <div className="absolute left-1/2 top-full w-80 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                  {services.map((service) => (
                    <Link key={service.name} href={service.href} onClick={() => setServicesOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-[#001030]">
                      {service.name}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            {links.slice(1).map((link) => (
              <Link key={link.name} href={link.href} className="py-3 font-medium text-slate-700 transition-colors hover:text-[#001030]">
                {link.name}
              </Link>
            ))}
          </div>

          <div className="hidden items-center lg:flex">
            <Link href="/fraud-readiness-score#start-score" onClick={() => trackEvent("cta_click", { cta_name: "assess_your_organisation", placement: "navbar" })}>
              <Button size="lg" className="px-8 py-6 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl" style={{ backgroundColor: "#04123b" }}>
                Assess Your Organisation
              </Button>
            </Link>
          </div>

          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-slate-200 bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5 text-[#001030]" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 bg-white lg:hidden">
          <div className="flex items-center justify-between border-b border-slate-200 p-6">
            <Link href="/" onClick={() => setMobileOpen(false)}>
              <Image src="/logo.png" width={160} height={42} alt="MK Fraud Insights" />
            </Link>
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-slate-200" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5 text-[#001030]" />
            </button>
          </div>
          <div className="space-y-2 p-6">
            <Link href="/" onClick={() => setMobileOpen(false)} className="block rounded-xl px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">Home</Link>
            <p className="px-4 pt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Services</p>
            {services.map((service) => (
              <Link key={service.name} href={service.href} onClick={() => setMobileOpen(false)} className="block rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {service.name}
              </Link>
            ))}
            {links.slice(1).map((link) => (
              <Link key={link.name} href={link.href} onClick={() => setMobileOpen(false)} className="block rounded-xl px-4 py-3 font-semibold text-slate-700 hover:bg-slate-50">
                {link.name}
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-200 p-6">
            <Link href="/fraud-readiness-score#start-score" onClick={() => setMobileOpen(false)}>
              <Button size="lg" className="w-full rounded-xl py-6 text-base font-semibold" style={{ backgroundColor: "#001030" }}>
                Assess Your Organisation
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </nav>
  );
}
