"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { trackEvent } from "@/lib/website/gtag";

// One `links` array drives both the desktop row and the mobile sheet. Home is reached through the
// logo; Industries and Contact remain live routes, reached from the footer and from Speak to MK.
// Fraud Readiness sits immediately before Insights: it is a commercial decision surface, and a
// prospect should meet it before the editorial content rather than after it.
const links = [
  { name: "Services", href: "/services" },
  { name: "Fraud Readiness", href: "/fraud-readiness" },
  { name: "Insights", href: "/insights" },
  { name: "About", href: "/about" },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navbar() {
  const pathname = usePathname();
  const menuId = useId();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close the sheet on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // While the sheet is open: lock page scroll and allow Escape to close it.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 bg-white transition-shadow duration-200 ${isScrolled ? "border-b border-slate-200 shadow-sm" : "border-b border-transparent"}`}>
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 md:h-20 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center" aria-label="MK Fraud Insights home">
          <Image src="/logo.png" width={944} height={264} alt="MK Fraud Insights" priority className="h-9 w-auto md:h-11" />
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {links.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.name}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-4 py-3 text-[15px] font-medium transition-colors hover:text-[#001030] ${active ? "text-[#001030]" : "text-slate-600"}`}
              >
                <span className={active ? "border-b-2 border-[#1d3658] pb-1" : ""}>{link.name}</span>
              </Link>
            );
          })}
          <Link
            href="/contact"
            onClick={() => trackEvent("cta_click", { cta_name: "speak_to_mk", placement: "navbar" })}
            className="ml-4 inline-flex min-h-11 items-center rounded-xl bg-[#001030] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#1d3658]"
          >
            Speak to MK
          </Link>
        </div>

        <button
          type="button"
          className="-mr-2 flex h-12 w-12 items-center justify-center rounded-xl text-[#001030] hover:bg-slate-100 lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls={menuId}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {mobileOpen ? (
        <div
          id={menuId}
          className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-y-auto border-t border-slate-200 bg-white md:top-20 lg:hidden"
        >
          <ul className="px-5 pt-2 sm:px-6">
            {links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <li key={link.name} className="border-b border-slate-100">
                  <Link
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className="flex min-h-14 items-center justify-between py-3 text-xl font-semibold text-[#001030]"
                  >
                    {link.name}
                    <ArrowRight aria-hidden="true" className={`h-5 w-5 ${active ? "text-[#1d3658]" : "text-slate-300"}`} />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto grid gap-3 border-t border-slate-200 bg-[#f8fafc] px-5 pb-8 pt-6 sm:px-6">
            <Link
              href="/score/start"
              onClick={() => {
                trackEvent("cta_click", { cta_name: "assess_your_organisation", placement: "navbar_mobile" });
                setMobileOpen(false);
              }}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#001030] px-6 text-base font-semibold text-white"
            >
              Assess your organisation <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/contact"
              onClick={() => {
                trackEvent("cta_click", { cta_name: "speak_to_mk", placement: "navbar_mobile" });
                setMobileOpen(false);
              }}
              className="flex min-h-12 items-center justify-center rounded-xl border border-[#001030]/20 bg-white px-6 text-base font-semibold text-[#001030]"
            >
              Speak to MK
            </Link>
            <a href="mailto:hello@mkfraud.co.za" className="pt-1 text-center text-sm text-slate-500">hello@mkfraud.co.za</a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
