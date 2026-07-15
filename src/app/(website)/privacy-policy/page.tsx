"use client";

import Wrapper from "@/components/website/Wrapper";
import {
    Shield,
    Lock,
    Eye,
    FileText,
    Mail,
    CheckCircle2,
    AlertCircle,
    Target,
} from "lucide-react";
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
            icon: FileText,
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
                    text: "We maintain records of communications between you and Mk Fraud Website, including emails, form submissions, and consultation notes, to provide effective service and maintain accurate records of our engagement.",
                },
            ],
        },
        {
            id: "information-use",
            icon: Target,
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
            icon: Lock,
            title: "Information Sharing and Disclosure",
            content: [
                {
                    subtitle: "No Sale of Personal Information",
                    text: "Mk Fraud Website does not sell, rent, or trade your personal information to third parties for marketing purposes.",
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
            icon: Shield,
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
            icon: Eye,
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
            icon: AlertCircle,
            title: "Cookies and Tracking",
            content: [
                {
                    subtitle: "Cookie Usage",
                    text: "Our website uses cookies and similar tracking technologies to enhance your browsing experience, analyse website traffic, and understand usage patterns. Cookies are small text files stored on your device that help us remember your preferences and improve website functionality.",
                },
                {
                    subtitle: "Cookie Control",
                    text: "You can control cookie settings through your browser preferences. Note that disabling certain cookies may limit your ability to use some features of our website.",
                },
            ],
        },
        {
            id: "contact",
            icon: Mail,
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
                <section className="relative overflow-hidden bg-gradient-to-br from-[#001030] via-[#1d3658] to-[#0b1b33]">
                    <div className="absolute inset-0">
                        <div className="absolute left-0 top-0 h-[620px] w-[620px] rounded-full bg-white/10 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                    </div>

                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:52px_52px]" />

                    <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                        <div className="text-center">
                            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 shadow-lg backdrop-blur">
                                <Shield className="h-4 w-4 text-white" />
                                <span className="text-sm font-bold uppercase tracking-wide text-white">
                                    Privacy & Data Protection
                                </span>
                            </div>

                            <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-5xl">
                                Privacy{" "}
                                <span className="relative inline-block">
                                    <span className="relative z-10 bg-gradient-to-r from-white via-white to-white bg-clip-text text-transparent">
                                        Policy
                                    </span>
                                    <span className="absolute -bottom-2 left-0 h-4 w-full bg-white/20 blur-xl" />
                                </span>
                            </h1>

                            <p className="mx-auto max-w-3xl leading-relaxed text-white/80">
                                Mk Fraud Website is committed to protecting your privacy and handling
                                your personal information responsibly in accordance with the Protection
                                of Personal Information Act (POPIA).
                            </p>

                            <div className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-3 backdrop-blur">
                                <CheckCircle2 className="h-5 w-5 text-white" />
                                <span className="text-sm font-semibold text-white">
                                    Last Updated: January 2026
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 h-px w-full bg-white/15" />
                </section>

                {/* CONTENT */}
                <section className="relative overflow-hidden bg-gradient-to-br from-white via-slate-50 to-white">
                    <div className="absolute inset-0 -z-10">
                        <div className="absolute left-0 top-0 h-[560px] w-[560px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[560px] w-[560px] rounded-full bg-[#001030]/6 blur-3xl" />
                    </div>
                    <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#0b122005_1px,transparent_1px),linear-gradient(to_bottom,#0b122005_1px,transparent_1px)] bg-[size:44px_44px]" />

                    <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                        {/* commitment card */}
                        <div className="mb-10 overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
                            <div className="p-8 sm:p-10">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#1d3658] shadow-lg">
                                        <Lock className="h-6 w-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="mb-2 text-xl font-bold leading-tight text-[#001030]">
                                            Our Commitment to Your Privacy
                                        </h2>
                                        <p className="leading-relaxed text-slate-700">
                                            This privacy policy explains how Mk Fraud Website collects, uses,
                                            protects, and manages your personal information when you interact
                                            with our website or engage our services. We handle all personal
                                            information in accordance with POPIA and applicable data protection
                                            regulations.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="h-1 w-full bg-[#1d3658]/15" />
                        </div>

                        {/* accordion */}
                        <div className="overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-2xl">
                            <div className="border-b border-slate-200 bg-slate-50/60 px-7 py-6">
                                <p className="text-sm font-bold uppercase tracking-wide text-[#1d3658]">
                                    Policy sections
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                    Tap a section to expand.
                                </p>
                            </div>

                            <Accordion type="single" collapsible className="p-3 sm:p-4">
                                {sections.map((section) => {
                                    const Icon = section.icon;
                                    return (
                                        <AccordionItem
                                            key={section.id}
                                            value={section.id}
                                            className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-white last:mb-0"
                                        >
                                            <AccordionTrigger className="px-5 py-5 text-left no-underline hover:no-underline">
                                                <div className="flex w-full items-center gap-4">
                                                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#1d3658] shadow-md">
                                                        <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
                                                    </div>
                                                    <span className="text-base font-bold text-[#001030] sm:text-lg">
                                                        {section.title}
                                                    </span>
                                                </div>
                                            </AccordionTrigger>

                                            <AccordionContent className="px-5 pb-6">
                                                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                                                    <div className="space-y-6">
                                                        {section.content.map((item, idx) => (
                                                            <div key={idx}>
                                                                <h4 className="mb-2 text-base font-bold leading-tight text-[#001030]">
                                                                    {item.subtitle}
                                                                </h4>
                                                                <p className="leading-relaxed text-slate-700">
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
                        <div className="mt-10 overflow-hidden rounded-3xl border-2 border-slate-200 bg-white p-8 shadow-xl lg:p-12">
                            <div className="mb-8">
                                <h2 className="mb-3 text-2xl font-bold leading-tight text-[#001030]">
                                    Changes to This Privacy Policy
                                </h2>
                                <p className="leading-relaxed text-slate-700">
                                    We may update this privacy policy from time to time to reflect changes
                                    in our practices, legal requirements, or service offerings. Any changes
                                    will be posted on this page with an updated revision date. We encourage
                                    you to review this policy periodically to stay informed about how we
                                    protect your personal information.
                                </p>
                            </div>

                            <div className="rounded-3xl border-2 border-[#1d3658]/15 bg-[#1d3658]/5 p-6 sm:p-8">
                                <div className="flex items-start gap-4">
                                    <Mail className="h-6 w-6 flex-shrink-0 text-[#1d3658]" />
                                    <div>
                                        <p className="mb-2 font-bold text-[#001030]">
                                            Questions or Concerns?
                                        </p>
                                        <p className="mb-4 text-sm leading-relaxed text-slate-700">
                                            If you have any questions about this privacy policy or how we handle
                                            your personal information, please contact us:
                                        </p>
                                        <a
                                            href="mailto:hello@mkfraud.co.za"
                                            className="inline-flex items-center gap-2 rounded-2xl bg-[#001030] px-5 py-3 font-bold text-white transition-all hover:opacity-95"
                                        >
                                            <Mail className="h-4 w-4" />
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

                    <div className="absolute bottom-0 left-0 h-px w-full bg-[#1d3658]/15" />
                </section>
            </div>
        </Wrapper>
    );
}
