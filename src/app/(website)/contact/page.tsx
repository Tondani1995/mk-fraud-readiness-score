"use client";

import {
  Mail,
  CheckCircle2,
  Linkedin,
  MessageSquare,
  Send,
  Clock,
  Shield,
  MapPin,
  Phone,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/website/ui/button";
import Wrapper from "@/components/website/Wrapper";
import Link from "next/link";
import { trackEvent } from "@/lib/website/gtag";
import { LINKEDIN_URL } from "@/lib/website/site";

const CALENDLY_URL = "https://calendly.com/mkfraud/30min?embed_domain=mkfraud.co.za&embed_type=Inline";

export default function ContactUs() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    service: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const benefits = [
    "Free 30-minute consultation",
    "Custom fraud risk assessment",
    "No obligation quote",
    "Expert guidance",
  ];

  const WEB3FORMS_ACCESS_KEY = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY!;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSubmitting(true);
    setIsSubmitted(false);

    const submittedForm = new FormData(e.currentTarget);
    const honeypot = submittedForm.get("botcheck")?.toString();

    if (honeypot) {
      setIsSubmitted(true);
      setIsSubmitting(false);
      return;
    }

    const cleanName = formData.name.trim();
    const cleanEmail = formData.email.trim();
    const cleanMessage = formData.message.trim();
    const cleanService = formData.service.trim();

    if (!cleanName || !cleanEmail || !cleanMessage || !cleanService) {
      setIsSubmitting(false);
      setIsSubmitted(false);
      return;
    }

    try {
      const fd = new FormData();
      fd.append("access_key", WEB3FORMS_ACCESS_KEY);
      fd.append("name", cleanName);
      fd.append("email", cleanEmail);
      fd.append("message", cleanMessage);
      fd.append("company", formData.company.trim());
      fd.append("phone", formData.phone.trim());
      fd.append("service", cleanService);
      fd.append("botcheck", "");
      fd.append("subject", `New Contact Form: ${cleanService || "General"} — ${cleanName}`);
      fd.append("from_name", cleanName);

      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (data.success) {
        trackEvent("generate_lead", {
          form_name: "contact_form",
          service_interest: cleanService || "not_specified",
          page_location: "/contact",
        });

        setIsSubmitted(true);

        setFormData({
          name: "",
          email: "",
          company: "",
          phone: "",
          service: "",
          message: "",
        });
      } else {
        setIsSubmitted(false);
      }
    } catch {
      setIsSubmitted(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Wrapper>
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -left-24 -top-24 h-[520px] w-[520px] rounded-full bg-[#1d3658]/10 blur-3xl" />
          <div className="absolute -right-28 -bottom-28 h-[620px] w-[620px] rounded-full bg-slate-900/5 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#0b12240a_1px,transparent_1px),linear-gradient(to_bottom,#0b12240a_1px,transparent_1px)] bg-[size:56px_56px]" />
        </div>

        <div className="mx-auto max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#1d3658]/15 bg-white px-5 py-2.5 shadow-sm">
              <MessageSquare className="h-4 w-4 text-[#1d3658]" />
              <span className="text-sm font-bold uppercase tracking-wide text-[#001030]">
                Get in touch
              </span>
            </div>

            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight text-[#001030] sm:text-5xl lg:text-5xl">
              Let&apos;s discuss your{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-[#1d3658]">fraud strategy</span>
                <span className="absolute -bottom-2 left-0 h-3 w-full bg-[#1d3658]/15 blur-sm" />
              </span>
            </h1>

            <p className="mt-6 leading-relaxed text-slate-600">
              Book a free consultation to explore how we can strengthen your fraud defences and
              build resilience across your organisation.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="border-b border-slate-200 bg-white px-8 py-7 lg:px-10">
                  <h2 className="text-3xl font-bold leading-tight text-[#001030]">Send us a message</h2>
                  <p className="mt-2 text-slate-600">
                    Fill out the form and we&apos;ll get back to you within 24 hours.
                  </p>
                </div>

                <div className="p-8 lg:p-10">
                  {isSubmitted ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#001030]">
                        <CheckCircle2 className="h-7 w-7 text-white" strokeWidth={3} />
                      </div>
                      <h3 className="text-2xl font-bold leading-tight text-[#001030]">Message sent</h3>
                      <p className="mt-2 text-slate-600">
                        Thanks — we&apos;ll review your message and reply within 24 hours during business
                        days.
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <input
                        type="checkbox"
                        name="botcheck"
                        tabIndex={-1}
                        autoComplete="off"
                        className="hidden"
                        aria-hidden="true"
                      />

                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div>
                          <label htmlFor="name" className="mb-2 block text-sm font-semibold text-[#001030]">
                            Full name <span className="text-[#1d3658]">*</span>
                          </label>
                          <input
                            id="name"
                            name="name"
                            type="text"
                            required
                            value={formData.name}
                            onChange={handleChange}
                            onFocus={() => setFocusedField("name")}
                            onBlur={() => setFocusedField(null)}
                            className={`w-full rounded-xl border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "name" ? "border-[#1d3658]/45 shadow-lg shadow-[#1d3658]/10" : "border-slate-200"}`}
                            placeholder="John Doe"
                          />
                        </div>

                        <div>
                          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-[#001030]">
                            Email <span className="text-[#1d3658]">*</span>
                          </label>
                          <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            value={formData.email}
                            onChange={handleChange}
                            onFocus={() => setFocusedField("email")}
                            onBlur={() => setFocusedField(null)}
                            className={`w-full rounded-xl border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "email" ? "border-[#1d3658]/45 shadow-lg shadow-[#1d3658]/10" : "border-slate-200"}`}
                            placeholder="john@company.com"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div>
                          <label htmlFor="company" className="mb-2 block text-sm font-semibold text-[#001030]">
                            Company
                          </label>
                          <input
                            id="company"
                            name="company"
                            type="text"
                            value={formData.company}
                            onChange={handleChange}
                            onFocus={() => setFocusedField("company")}
                            onBlur={() => setFocusedField(null)}
                            className={`w-full rounded-xl border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "company" ? "border-[#1d3658]/45 shadow-lg shadow-[#1d3658]/10" : "border-slate-200"}`}
                            placeholder="Your Company Ltd"
                          />
                        </div>

                        <div>
                          <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-[#001030]">
                            Phone
                          </label>
                          <input
                            id="phone"
                            name="phone"
                            type="tel"
                            value={formData.phone}
                            onChange={handleChange}
                            onFocus={() => setFocusedField("phone")}
                            onBlur={() => setFocusedField(null)}
                            className={`w-full rounded-xl border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "phone" ? "border-[#1d3658]/45 shadow-lg shadow-[#1d3658]/10" : "border-slate-200"}`}
                            placeholder="+27 82 301 4351"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="service" className="mb-2 block text-sm font-semibold text-[#001030]">
                          Service interested in <span className="text-[#1d3658]">*</span>
                        </label>
                        <select
                          id="service"
                          name="service"
                          required
                          value={formData.service}
                          onChange={handleChange}
                          onFocus={() => setFocusedField("service")}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full rounded-xl border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "service" ? "border-[#1d3658]/45 shadow-lg shadow-[#1d3658]/10" : "border-slate-200"}`}
                        >
                          <option value="">Select a service</option>
                          <option value="fraud-health-check">Fraud Health Check</option>
                          <option value="threat-intelligence">Threat Intelligence for Fraud</option>
                          <option value="programme-design">Fraud Programme Design</option>
                          <option value="awareness">Awareness & Resilience</option>
                          <option value="controls">Internal Fraud Controls</option>
                          <option value="other">Other / Not Sure</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="message" className="mb-2 block text-sm font-semibold text-[#001030]">
                          Message <span className="text-[#1d3658]">*</span>
                        </label>
                        <textarea
                          id="message"
                          name="message"
                          required
                          rows={6}
                          value={formData.message}
                          onChange={handleChange}
                          onFocus={() => setFocusedField("message")}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full rounded-xl border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "message" ? "border-[#1d3658]/45 shadow-lg shadow-[#1d3658]/10" : "border-slate-200"}`}
                          placeholder="Tell us about your fraud challenges and what you want to achieve..."
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="group w-full rounded-xl bg-[#001030] py-6 text-lg font-semibold text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#0b1b44] disabled:opacity-60 disabled:hover:scale-100"
                      >
                        <span className="flex items-center justify-center gap-2">
                          {isSubmitting ? "Sending..." : "Send message"}
                          <Send className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                        </span>
                      </Button>

                      <p className="flex items-center gap-2 text-sm text-slate-500">
                        <CheckCircle2 className="h-4 w-4 text-[#1d3658]" />
                        No commitment required • Free consultation
                      </p>
                    </form>
                  )}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#001030]">
                    <Mail className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500">Email</p>
                  <a
                    href="mailto:hello@mkfraud.co.za"
                    onClick={() =>
                      trackEvent("contact_click", {
                        contact_type: "email",
                        placement: "contact_card",
                      })
                    }
                    className="mt-1 block font-bold text-[#001030] hover:text-[#1d3658]"
                  >
                    hello@mkfraud.co.za
                  </a>
                </div>

                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-lg">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#001030]">
                    <Linkedin className="h-6 w-6 text-white" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500">LinkedIn</p>
                  <a
                    href={LINKEDIN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackEvent("social_click", {
                        platform: "linkedin",
                        placement: "contact_card",
                      })
                    }
                    className="mt-1 block font-bold text-[#001030] hover:text-[#1d3658]"
                  >
                    MK Fraud Insights
                  </a>
                </div>

                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-lg sm:col-span-2">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#001030]">
                      <MapPin className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-[#001030]">South Africa</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Serving clients across Africa and internationally.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="border-b border-slate-200 bg-white px-8 py-7">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <h3 className="text-2xl font-bold leading-tight text-[#001030]">Book a consultation</h3>
                      <p className="mt-2 text-slate-600">Schedule a time that works for you.</p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#001030]">
                      <Shield className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="h-[520px] overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white">
                    <iframe
                      src={CALENDLY_URL}
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      title="Calendly Scheduling"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold leading-tight text-[#001030]">What to expect</h3>
                    <div className="mt-5 grid grid-cols-1 gap-3">
                      {benefits.map((b) => (
                        <div key={b} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#1d3658]/10">
                            <CheckCircle2 className="h-5 w-5 text-[#1d3658]" strokeWidth={2.5} />
                          </div>
                          <span className="text-sm font-semibold text-[#001030]">{b}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[#001030]">
                          <Clock className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[#001030]">Response time</p>
                          <p className="mt-1 text-sm leading-relaxed text-slate-600">
                            We typically respond within 24 hours during business days.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <a
                        href="tel:+27823014351"
                        onClick={() =>
                          trackEvent("contact_click", {
                            contact_type: "phone",
                            placement: "contact_card",
                          })
                        }
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#001030]">
                          <Phone className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500">Phone</p>
                          <p className="text-sm font-bold text-[#001030]">+27 82 301 4351</p>
                        </div>
                      </a>

                      <Link
                        href="/services"
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#001030]">
                          <Shield className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500">Explore</p>
                          <p className="text-sm font-bold text-[#001030]">View services</p>
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Wrapper>
  );
}
