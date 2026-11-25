"use client";

import Wrapper from "@/components/website/Wrapper";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/website/ui/accordion";

export default function PrivacyPolicy() {
    // Brand palette (logo)
    const brand = {
        navy: "#1d3658",
        deep: "#001030",
    };

    const sections = [
        {
            id: "information-collection",
            title: "Information We Collect",
            content: [
                {
                    subtitle: "Personal Information",
                    text: "When you interact with our website or services, we may collect personal information including your name, email address, company name, phone number, and any other information you voluntarily provide through contact forms, consultation requests, or newsletter subscriptions.",
                },
                {
                    subtitle: "Technical Information",
                    text: "We automatically collect certain technical information when you visit our website, including your IP address, browser type, device information, pages visited, time spent on pages, and referring website addresses.",
                },
                {
                    subtitle: "Communication Records",
                    text: "We maintain records of communications between you and MK Fraud Insights, including emails, form submissions, and consultation notes, to provide effective service and maintain accurate records of our engagement.",
                },
            ],
        },
        {
            id: "information-use",
            title: "How We Use Your Information",
            content: [
                {
                    subtitle: "Service Delivery",
                    text: "We use your personal information to respond to enquiries, schedule consultations, deliver requested services, and provide fraud risk advisory support tailored to your organisational needs.",
                },
                {
                    subtitle: "Communication",
                    text: "Your contact information enables us to send service updates, respond to requests, share relevant fraud risk insights, and maintain ongoing professional communication regarding our services.",
                },
                {
                    subtitle: "Service Improvement",
                    text: "We analyse usage patterns and feedback to improve our website functionality, refine our service offerings, and ensure we deliver relevant, practical fraud risk guidance.",
                },
            ],
        },
        {
            id: "information-sharing",
            title: "Information Sharing and Disclosure",
            content: [
                {
                    subtitle: "No Sale of Personal Information",
                    text: "MK Fraud Insights does not sell, rent, or trade your personal information to third parties for marketing purposes.",
                },
                {
                    subtitle: "Service Providers",
                    text: "We may share information with trusted service providers who assist in operating our website, conducting business operations, or servicing you, provided they agree to keep this information confidential and use it only for the purposes we specify.",
                },
                {
                    subtitle: "Legal Obligations",
                    text: "We may disclose personal information when required by law, regulation, legal process, or governmental request, or when necessary to protect our rights, property, safety, or that of others.",
                },
            ],
        },
        {
            id: "data-protection",
            title: "Data Protection and Security",
            content: [
                {
                    subtitle: "Security Measures",
                    text: "We implement appropriate technical and organisational security measures to protect your personal information against unauthorised access, alteration, disclosure, or destruction. These measures include secure data transmission, access controls, and regular security assessments.",
                },
                {
                    subtitle: "Data Retention",
                    text: "We retain personal information for as long as necessary to fulfil the purposes outlined in this privacy policy, comply with legal obligations, resolve disputes, and enforce our agreements. When information is no longer required, it is securely deleted or anonymised.",
                },
            ],
        },
        {
            id: "your-rights",
            title: "Your Rights Under POPIA",
            content: [
                {
                    subtitle: "Access and Correction",
                    text: "You have the right to request access to the personal information we hold about you and to request correction of any inaccurate or incomplete information.",
                },
                {
                    subtitle: "Objection and Restriction",
                    text: "You may object to the processing of your personal information or request restriction of processing in certain circumstances, subject to legal and contractual obligations.",
                },
                {
                    subtitle: "Deletion",
                    text: "You have the right to request deletion of your personal information, subject to our legal and contractual obligations to retain certain records.",
                },
                {
                    subtitle: "Data Portability",
                    text: "Where technically feasible, you may request that we provide your personal information in a structured, commonly used, and machine-readable format.",
                },
                {
                    subtitle: "Withdraw Consent",
                    text: "Where processing is based on consent, you have the right to withdraw that consent at any time, without affecting the lawfulness of processing based on consent before its withdrawal.",
                },
            ],
        },
        {
            id: "cookies",
            title: "Cookies and Tracking",
            content: [
                {
                    subtitle: "Cookie Usage",
                    text: "Our website uses cookies and similar tracking technologies to enhance your browsing experience, analyse website traffic, and understand usage patterns. Cookies are small text files stored on your device that help us remember your preferences and improve website functionality.",
                },
                {
                    subtitle: "Advertising Measurement",
                    text: "If you separately opt in to advertising measurement cookies, we use the Meta Pixel and Meta Conversions API to measure which campaigns bring organisations to our Fraud Readiness assessment. These run only after you opt in, and never on assessment, result, report, order or administrative pages. We send Meta only that a page was viewed, that an assessment was started, and that an assessment was completed. We never send Meta your name, email address, telephone number, your organisation's details, your assessment answers, your score, or any assessment, result or order reference.",
                },
                {
                    subtitle: "Cookie Control",
                    text: "You can control cookie settings through your browser preferences, and you can decline analytics or advertising cookies independently when we ask. If you withdraw advertising consent, advertising measurement stops for your subsequent activity and the associated cookies are cleared. Note that disabling certain cookies may limit your ability to use some features of our website.",
                },
            ],
        },
        {
            id: "contact",
            title: "Contact and Complaints",
            content: [
                {
                    subtitle: "Privacy Enquiries",
                    text: "For questions about this privacy policy, requests to exercise your rights, or concerns about how we handle your personal information, please contact us at hello@mkfraud.co.za",
                },
                {
                    subtitle: "Complaints",
                    text: "If you believe we have not handled your personal information appropriately or in accordance with POPIA, you have the right to lodge a complaint with the Information Regulator of South Africa.",
                },
            ],
        },
    ];

    return (
        <Wrapper>
            <div className="bg-white">
                {/* HERO */}
                <section className="bg-mk-navy text-white">


                    <div className="mk-frame relative py-20 lg:py-28">
                        <div>
                            <div className="mb-5">
                                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
                                    Privacy & Data Protection
                                </span>
                            </div>

                            <h1 className="mk-display mb-6 max-w-[16ch] font-medium text-white">
                                Privacy{" "}
                                <span className="relative inline-block">
                                    <span className="relative">
                                        Policy
                                    </span>
                                </span>
                            </h1>

                            <p className="mk-measure text-base leading-relaxed text-white/80 sm:text-lg">
                                MK Fraud Insights is committed to protecting your privacy and handling
                                your personal information responsibly in accordance with the Protection
                                of Personal Information Act (POPIA).
                            </p>

                            <div className="mt-8">
                                <span className="text-sm text-white/70">
                                    Last Updated: January 2026
                                </span>
                            </div>
                        </div>
                    </div>

                </section>

                {/* CONTENT */}
                <section className="bg-white">

                    <div className="mk-frame grid gap-12 py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-[var(--mk-split-gap)] lg:py-24">
                        {/* commitment card */}
                        <div className="border-t-2 border-mk-navy pt-6 lg:sticky lg:top-28 lg:row-span-2 lg:self-start">
                            <div>
                                <div className="flex items-start gap-4">
                                    <div>
                                        <h2 className="mb-3 text-2xl font-medium leading-snug text-mk-navy">
                                            Our Commitment to Your Privacy
                                        </h2>
                                        <p className="leading-relaxed text-mk-muted">
                                            This privacy policy explains how MK Fraud Insights collects, uses,
                                            protects, and manages your personal information when you interact
                                            with our website or engage our services. We handle all personal
                                            information in accordance with POPIA and applicable data protection
                                            regulations.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* accordion */}
                        <div className="lg:col-start-2">
                            <div className="border-b border-mk-line pb-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">
                                    Policy sections
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                    Tap a section to expand.
                                </p>
                            </div>

                            <Accordion type="single" collapsible>
                                {sections.map((section) => {
                                    return (
                                        <AccordionItem
                                            key={section.id}
                                            value={section.id}
                                            className="border-b border-mk-line"
                                        >
                                            <AccordionTrigger className="py-5 text-left no-underline hover:no-underline">
                                                <div className="flex w-full items-center gap-4">
                                                    <span className="text-base font-semibold text-mk-navy sm:text-lg">
                                                        {section.title}
                                                    </span>
                                                </div>
                                            </AccordionTrigger>

                                            <AccordionContent className="pb-8">
                                                <div className="mk-measure">
                                                    <div className="space-y-6">
                                                        {section.content.map((item, idx) => (
                                                            <div key={idx}>
                                                                <h4 className="mb-2 text-base font-semibold leading-tight text-mk-navy">
                                                                    {item.subtitle}
                                                                </h4>
                                                                <p className="leading-relaxed text-mk-muted">
                                                                    {item.text}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                            </Accordion>
                        </div>

                        {/* changes + contact */}
                        <div className="border-t border-mk-line pt-8 lg:col-start-2">
                            <div className="mb-8">
                                <h2 className="mb-3 text-2xl font-semibold leading-tight text-mk-navy">
                                    Changes to This Privacy Policy
                                </h2>
                                <p className="leading-relaxed text-mk-muted">
                                    We may update this privacy policy from time to time to reflect changes
                                    in our practices, legal requirements, or service offerings. Any changes
                                    will be posted on this page with an updated revision date. We encourage
                                    you to review this policy periodically to stay informed about how we
                                    protect your personal information.
                                </p>
                            </div>

                            <div className="mt-2 border-l-2 border-mk-sage pl-6">
                                <div className="flex items-start gap-4">
                                    <div>
                                        <p className="mb-2 font-semibold text-mk-navy">
                                            Questions or Concerns?
                                        </p>
                                        <p className="mb-4 text-sm leading-relaxed text-mk-muted">
                                            If you have any questions about this privacy policy or how we handle
                                            your personal information, please contact us:
                                        </p>
                                        <a
                                            href="mailto:hello@mkfraud.co.za"
                                            className="inline-flex items-center gap-2 rounded-brand bg-mk-navy px-5 py-3 font-semibold text-white transition-all hover:opacity-95"
                                        >
                                            hello@mkfraud.co.za
                                        </a>
                                        <p className="mt-3 text-xs text-slate-600">
                                            We aim to respond within a reasonable timeframe.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </section>
            </div>
        </Wrapper>
    );
}
