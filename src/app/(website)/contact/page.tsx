"use client";

import {
  Mail,
  CheckCircle2,
  Linkedin,
  Send,
  Clock,
  Shield,
  MapPin,
  Phone,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/website/ui/button";
import Wrapper from "@/components/website/Wrapper";
import Link from "next/link";
import { trackEvent } from "@/lib/website/gtag";
import { LINKEDIN_URL } from "@/lib/website/site";
import { getCampaignAttribution } from "@/lib/website/acquisition-context";
import CalendlyBooking from "@/components/website/CalendlyBooking";

/**
 * `useSearchParams` forces this subtree to render on the client, so it is isolated behind its own
 * Suspense boundary rather than allowed to opt the whole page out of static rendering.
 */
export default function ContactUs() {
  return (
    <Suspense fallback={null}>
      <ContactUsForm />
    </Suspense>
  );
}

function ContactUsForm() {
  const searchParams = useSearchParams();
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
  const [enquiryReference, setEnquiryReference] = useState<string | null>(null);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);

  /**
   * Preselect the enquiry category when a prospect arrives from the Fraud Readiness storefront's
   * Advisory call to action. Only the one known value is honoured; any other query value leaves the
   * select untouched, so the URL cannot inject an arbitrary option.
   */
  useEffect(() => {
    if (searchParams.get("enquiry") !== "mk-advisory") return;
    setFormData((current) => (current.service ? current : { ...current, service: "mk-advisory" }));
  }, [searchParams]);

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

  /**
   * The enquiry is submitted to MK's own API, which validates it, persists it to
   * public.data_requests as a `website_contact` enquiry and queues one internal notification.
   *
   * It previously posted from the browser straight to api.web3forms.com, which meant a customer
   * enquiry existed only in a third party's inbox: MK could not see it in the admin queue, could
   * not answer it from a reference, and had no record if the third party dropped it. There is no
   * dual delivery; the browser posts to MK and nowhere else.
   *
   * Success is shown only when the enquiry was actually persisted and the API returned its
   * reference. A failure is reported as a failure.
   */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setSubmitErrors([]);

    const submittedForm = new FormData(e.currentTarget);
    const honeypot = submittedForm.get("botcheck")?.toString() ?? "";

    try {
      const response = await fetch("/score/api/enquiries/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          company: formData.company,
          phone: formData.phone,
          service: formData.service,
          message: formData.message,
          botcheck: honeypot,
          attribution: getCampaignAttribution(),
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok || !body.ok) {
        setSubmitErrors(
          body.errors ?? ["Your message could not be sent right now. Please try again."]
        );
        setIsSubmitting(false);
        return;
      }

      if (body.persisted === true) {
        trackEvent("service_enquiry_submitted", {
          form_name: "contact_form",
          page_path: "/contact",
          enquiry_type: formData.service || "not_specified",
        });
      }

      setEnquiryReference(body.requestReference ?? null);
      setIsSubmitted(true);
      setFormData({ name: "", email: "", company: "", phone: "", service: "", message: "" });
    } catch {
      setSubmitErrors(["Your message could not be sent right now. Please try again."]);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Wrapper>
      <section className="relative overflow-hidden bg-white">

        <div className="mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-6 sm:pt-14 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="max-w-3xl">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-mk-accent">Speak to MK</p>
            <h1 className="mt-4 text-[2.1rem] font-semibold leading-[1.08] tracking-normal text-mk-navy sm:text-5xl">
              Tell us what you need to understand or fix.
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Share a little about your organisation and the fraud risk question in front of you. MK will reply to
              arrange an initial conversation.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 lg:mt-14 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-brand border border-slate-200 bg-white shadow-soft">
                <div className="border-b border-slate-200 bg-white px-8 py-7 lg:px-10">
                  <h2 className="text-3xl font-semibold leading-tight text-mk-navy">Send us a message</h2>
                  <p className="mt-2 text-slate-600">
                    Fill out the form and we&apos;ll get back to you within 24 hours.
                  </p>
                </div>

                <div className="p-8 lg:p-10">
                  {isSubmitted ? (
                    <div className="rounded-brand border border-slate-200 bg-white p-8 text-center shadow-soft">
                      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-brand bg-mk-navy">
                        <CheckCircle2 className="h-7 w-7 text-white" strokeWidth={3} />
                      </div>
                      <h3 className="text-2xl font-semibold leading-tight text-mk-navy">Message received</h3>
                      <p className="mt-2 text-slate-600">
                        Thanks. We&apos;ll review your message and reply within 24 hours during business
                        days.
                      </p>
                      {enquiryReference ? (
                        <div className="mt-6 border-t border-slate-200 pt-6">
                          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                            Your enquiry reference
                          </p>
                          <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-normal text-mk-navy">
                            {enquiryReference}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            Quote this if you follow up with us.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                      {submitErrors.length ? (
                        <div
                          role="alert"
                          className="rounded-brand border border-mk-danger/30 bg-mk-danger/[0.06] p-4 text-sm leading-6 text-mk-danger"
                        >
                          {submitErrors.map((error) => (
                            <p key={error}>{error}</p>
                          ))}
                        </div>
                      ) : null}
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
                          <label htmlFor="name" className="mb-2 block text-sm font-semibold text-mk-navy">
                            Full name <span className="text-mk-accent">*</span>
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
                            className={`w-full rounded-brand border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "name" ? "border-mk-accent/45 shadow-soft" : "border-slate-200"}`}
                            placeholder="John Doe"
                          />
                        </div>

                        <div>
                          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-mk-navy">
                            Email <span className="text-mk-accent">*</span>
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
                            className={`w-full rounded-brand border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "email" ? "border-mk-accent/45 shadow-soft" : "border-slate-200"}`}
                            placeholder="john@company.com"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div>
                          <label htmlFor="company" className="mb-2 block text-sm font-semibold text-mk-navy">
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
                            className={`w-full rounded-brand border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "company" ? "border-mk-accent/45 shadow-soft" : "border-slate-200"}`}
                            placeholder="Your Company Ltd"
                          />
                        </div>

                        <div>
                          <label htmlFor="phone" className="mb-2 block text-sm font-semibold text-mk-navy">
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
                            className={`w-full rounded-brand border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "phone" ? "border-mk-accent/45 shadow-soft" : "border-slate-200"}`}
                            placeholder="+27 82 301 4351"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="service" className="mb-2 block text-sm font-semibold text-mk-navy">
                          Service interested in <span className="text-mk-accent">*</span>
                        </label>
                        <select
                          id="service"
                          name="service"
                          required
                          value={formData.service}
                          onChange={handleChange}
                          onFocus={() => setFocusedField("service")}
                          onBlur={() => setFocusedField(null)}
                          className={`w-full rounded-brand border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "service" ? "border-mk-accent/45 shadow-soft" : "border-slate-200"}`}
                        >
                          <option value="">Select a service</option>
                          <option value="mk-advisory">Assess, Advisory &amp; Risk Review</option>
                          <option value="programme-design">Build, Programmes, Governance &amp; Controls</option>
                          <option value="awareness">Enable, Awareness, Training &amp; Playbooks</option>
                          <option value="threat-intelligence">Monitor, Detection, Intelligence &amp; Reporting</option>
                          <option value="other">Other / Not Sure</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="message" className="mb-2 block text-sm font-semibold text-mk-navy">
                          Message <span className="text-mk-accent">*</span>
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
                          className={`w-full rounded-brand border bg-white px-4 py-3 text-slate-900 transition-all duration-300 focus:outline-none ${focusedField === "message" ? "border-mk-accent/45 shadow-soft" : "border-slate-200"}`}
                          placeholder="Tell us about your fraud challenges and what you want to achieve..."
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="group w-full rounded-brand bg-mk-navy py-6 text-lg font-semibold text-white shadow-soft transition-all duration-300 hover:scale-[1.02] hover:bg-mk-navy disabled:opacity-60 disabled:"
                      >
                        <span className="flex items-center justify-center gap-2">
                          {isSubmitting ? "Sending..." : "Send message"}
                          <Send className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                        </span>
                      </Button>

                      <p className="flex items-center gap-2 text-sm text-slate-500">
                        <CheckCircle2 className="h-4 w-4 text-mk-accent" />
                        No commitment required • Free consultation
                      </p>
                    </form>
                  )}
                </div>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="overflow-hidden rounded-brand border border-slate-200 bg-white p-6 shadow-soft">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-brand bg-mk-navy">
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
                    className="mt-1 block font-semibold text-mk-navy hover:text-mk-accent"
                  >
                    hello@mkfraud.co.za
                  </a>
                </div>

                <div className="overflow-hidden rounded-brand border border-slate-200 bg-white p-6 shadow-soft">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-brand bg-mk-navy">
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
                    className="mt-1 block font-semibold text-mk-navy hover:text-mk-accent"
                  >
                    MK Fraud Insights
                  </a>
                </div>

                <div className="overflow-hidden rounded-brand border border-slate-200 bg-white p-6 shadow-soft sm:col-span-2">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-brand bg-mk-navy">
                      <MapPin className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-mk-navy">South Africa</p>
                      <p className="mt-1 text-sm text-slate-600">
                        Serving clients across Africa and internationally.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-brand border border-slate-200 bg-white shadow-soft">
                <div className="border-b border-slate-200 bg-white px-8 py-7">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <h3 className="text-2xl font-semibold leading-tight text-mk-navy">Book a consultation</h3>
                      <p className="mt-2 text-slate-600">Schedule a time that works for you.</p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-brand bg-mk-navy">
                      <Shield className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  <div className="h-[520px] overflow-hidden rounded-brand border border-dashed border-slate-300 bg-white">
                    <CalendlyBooking />
                  </div>
                </div>
              </div>

              <div className="mt-8 overflow-hidden rounded-brand border border-slate-200 bg-white p-8 shadow-soft">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <h3 className="text-2xl font-semibold leading-tight text-mk-navy">What to expect</h3>
                    <div className="mt-5 grid grid-cols-1 gap-3">
                      {benefits.map((b) => (
                        <div key={b} className="flex items-center gap-3 rounded-brand border border-slate-200 bg-white p-4">
                          <div className="flex h-8 w-8 items-center justify-center rounded-brand bg-mk-accent/10">
                            <CheckCircle2 className="h-5 w-5 text-mk-accent" strokeWidth={2.5} />
                          </div>
                          <span className="text-sm font-semibold text-mk-navy">{b}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-brand border border-slate-200 bg-white p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-brand bg-mk-navy">
                          <Clock className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-mk-navy">Response time</p>
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
                        className="flex items-center gap-3 rounded-brand border border-slate-200 bg-white p-4 transition-all duration-300  hover:shadow-soft"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-brand bg-mk-navy">
                          <Phone className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500">Phone</p>
                          <p className="text-sm font-semibold text-mk-navy">+27 82 301 4351</p>
                        </div>
                      </a>

                      <Link
                        href="/services"
                        className="flex items-center gap-3 rounded-brand border border-slate-200 bg-white p-4 transition-all duration-300  hover:shadow-soft"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-brand bg-mk-navy">
                          <Shield className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500">Explore</p>
                          <p className="text-sm font-semibold text-mk-navy">View services</p>
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
