"use client";

import Wrapper from "@/components/website/Wrapper";
import {
    FileText,
    Shield,
    AlertTriangle,
    Scale,
    Globe,
    UserCheck,
    Mail,
    CheckCircle2,
} from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/website/ui/accordion";

export default function TermsOfUse() {
    // Brand palette (logo)
    const brand = {
        navy: "#1d3658",
        deep: "#001030",
    };

    const sections = [
        {
            id: "acceptance",
            icon: FileText,
            title: "Acceptance of Terms",
            content: [
                {
                    subtitle: "Agreement to Terms",
                    text: "By accessing or using Mk Fraud Website, you agree to be bound by these Terms of Use and all applicable laws and regulations. If you do not agree with any part of these terms, you must not use our website or services.",
                },
                {
                    subtitle: "Capacity to Agree",
                    text: "You confirm that you have the legal capacity to enter into these Terms of Use. If you are accessing the website on behalf of an organisation, you represent that you have the authority to bind that organisation to these terms.",
                },
            ],
        },
        {
            id: "use-of-website",
            icon: Globe,
            title: "Use of Website",
            content: [
                {
                    subtitle: "Permitted Use",
                    text: "This website is provided for informational purposes and to facilitate enquiries about our fraud risk advisory services. You may view, download, and print content from this website for your personal or internal business use, provided you do not modify or remove any copyright or proprietary notices.",
                },
                {
                    subtitle: "Prohibited Activities",
                    text: "You agree not to use this website for any unlawful purpose or in any way that could damage, disable, overburden, or impair our systems. Prohibited activities include but are not limited to: attempting to gain unauthorised access to our systems, transmitting malicious code, scraping or automated data collection without permission, and misrepresenting your identity or affiliation.",
                },
            ],
        },
        {
            id: "intellectual-property",
            icon: Shield,
            title: "Intellectual Property Rights",
            content: [
                {
                    subtitle: "Ownership",
                    text: "All content on this website, including text, graphics, logos, images, and software, is the property of Mk Fraud Website or its licensors and is protected by South African and international intellectual property laws. The Mk Fraud Website name, logo, and all related marks are trademarks owned by Mk Fraud Website.",
                },
                {
                    subtitle: "Limited Licence",
                    text: "Subject to these Terms of Use, we grant you a limited, non-exclusive, non-transferable licence to access and use this website for its intended purposes. This licence does not include any right to reproduce, distribute, modify, or create derivative works from our content without prior written consent.",
                },
            ],
        },
        {
            id: "services-information",
            icon: UserCheck,
            title: "Services and Information",
            content: [
                {
                    subtitle: "No Professional Advice",
                    text: "Information provided on this website is for general informational purposes only and does not constitute professional fraud risk advice, legal advice, or any other form of professional guidance. You should not rely on website content as a substitute for professional consultation tailored to your specific circumstances.",
                },
                {
                    subtitle: "Service Engagement",
                    text: "Any formal engagement for fraud risk advisory services will be subject to a separate written agreement between you and Mk Fraud Website. Website content does not create a client relationship or any contractual obligations.",
                },
                {
                    subtitle: "Information Accuracy",
                    text: "While we endeavour to ensure information on this website is accurate and current, we make no representations or warranties regarding the completeness, accuracy, or reliability of any content. Information may become outdated, and we reserve the right to update or modify content without notice.",
                },
            ],
        },
        {
            id: "disclaimers",
            icon: AlertTriangle,
            title: "Disclaimers and Limitations",
            content: [
                {
                    subtitle: "Website Availability",
                    text: "We do not guarantee that this website will be available at all times or that access will be uninterrupted or error-free. We may suspend, withdraw, or restrict access to all or part of the website for business or operational reasons.",
                },
                {
                    subtitle: "No Warranties",
                    text: "This website and all content are provided on an \"as is\" and \"as available\" basis. To the fullest extent permitted by law, Mk Fraud Website disclaims all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement.",
                },
                {
                    subtitle: "Limitation of Liability",
                    text: "To the maximum extent permitted by South African law, Mk Fraud Website shall not be liable for any direct, indirect, incidental, consequential, or punitive damages arising from your use of or inability to use this website, even if we have been advised of the possibility of such damages. This includes but is not limited to loss of data, loss of profits, or business interruption.",
                },
            ],
        },
        {
            id: "third-party-links",
            icon: Globe,
            title: "Third-Party Links and Resources",
            content: [
                {
                    subtitle: "External Links",
                    text: "This website may contain links to third-party websites or resources. These links are provided for your convenience only. We do not endorse and are not responsible for the content, accuracy, or practices of any third-party websites. Your use of third-party websites is at your own risk and subject to their respective terms and conditions.",
                },
            ],
        },
        {
            id: "user-submissions",
            icon: FileText,
            title: "User Submissions and Communications",
            content: [
                {
                    subtitle: "Submitted Information",
                    text: "Any information, feedback, or materials you submit through this website, including through contact forms or email, becomes the property of Mk Fraud Website. We may use such submissions for any purpose without compensation or attribution, subject to our Privacy Policy regarding personal information.",
                },
                {
                    subtitle: "Accuracy of Information",
                    text: "You are responsible for ensuring that any information you provide through this website is accurate, current, and complete. Providing false or misleading information may result in termination of your access to the website.",
                },
            ],
        },
        {
            id: "indemnification",
            icon: Shield,
            title: "Indemnification",
            content: [
                {
                    subtitle: "Your Indemnity",
                    text: "You agree to indemnify, defend, and hold harmless Mk Fraud Website, its directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from your use of this website, your violation of these Terms of Use, or your violation of any rights of another party.",
                },
            ],
        },
        {
            id: "governing-law",
            icon: Scale,
            title: "Governing Law and Jurisdiction",
            content: [
                {
                    subtitle: "South African Law",
                    text: "These Terms of Use are governed by and construed in accordance with the laws of the Republic of South Africa. Any disputes arising from these terms or your use of this website shall be subject to the exclusive jurisdiction of the South African courts.",
                },
            ],
        },
        {
            id: "changes-to-terms",
            icon: AlertTriangle,
            title: "Changes to Terms",
            content: [
                {
                    subtitle: "Modifications",
                    text: "We reserve the right to modify these Terms of Use at any time. Changes will be effective immediately upon posting to this website. Your continued use of the website after changes are posted constitutes your acceptance of the revised terms. We encourage you to review these terms periodically.",
                },
            ],
        },
        {
            id: "general-provisions",
            icon: FileText,
            title: "General Provisions",
            content: [
                {
                    subtitle: "Severability",
                    text: "If any provision of these Terms of Use is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary so that these terms shall otherwise remain in full force and effect.",
                },
                {
                    subtitle: "Entire Agreement",
                    text: "These Terms of Use, together with our Privacy Policy, constitute the entire agreement between you and Mk Fraud Website regarding your use of this website and supersede all prior agreements and understandings.",
                },
                {
                    subtitle: "No Waiver",
                    text: "Our failure to enforce any right or provision of these Terms of Use shall not constitute a waiver of such right or provision. Any waiver must be in writing and signed by an authorised representative of Mk Fraud Website.",
                },
            ],
        },
    ];

    return (
        <Wrapper>
            <div className="bg-white">
                {/* HERO (brand dark, softer typography) */}
                <section className="relative overflow-hidden bg-gradient-to-br from-[#001030] via-[#1d3658] to-[#0b1b33]">
                    <div className="absolute inset-0">
                        <div className="absolute left-0 top-0 h-[620px] w-[620px] rounded-full bg-white/10 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
                    </div>

                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:52px_52px]" />

                    <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                        <div className="text-center">
                            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2.5 shadow-lg backdrop-blur">
                                <Scale className="h-4 w-4 text-white" />
                                <span className="text-sm font-semibold uppercase tracking-wide text-white">
                                    Legal Terms
                                </span>
                            </div>

                            <h1 className="mb-6 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
                                Terms of <span className="text-white/95">Use</span>
                            </h1>

                            <p className="mx-auto max-w-3xl leading-relaxed text-white/80">
                                Please read these Terms of Use carefully before using Mk Fraud
                                Website. These terms govern your access to and use of our website and
                                services.
                            </p>

                            <div className="mt-8 inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-3 backdrop-blur">
                                <CheckCircle2 className="h-5 w-5 text-white" />
                                <span className="text-sm font-semibold text-white">
                                    Effective Date: January 2026
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 h-px w-full bg-white/15" />
                </section>

                {/* CONTENT (light, brand accents) */}
                <section className="relative overflow-hidden bg-gradient-to-br from-white via-slate-50 to-white">
                    <div className="absolute inset-0 -z-10">
                        <div className="absolute left-0 top-0 h-[560px] w-[560px] rounded-full bg-[#1d3658]/8 blur-3xl" />
                        <div className="absolute right-0 bottom-0 h-[560px] w-[560px] rounded-full bg-[#001030]/6 blur-3xl" />
                    </div>
                    <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#0b122005_1px,transparent_1px),linear-gradient(to_bottom,#0b122005_1px,transparent_1px)] bg-[size:44px_44px]" />

                    <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
                        {/* Notice */}
                        <div className="mb-10 overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-xl">
                            <div className="p-8 sm:p-10">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-[#1d3658] shadow-lg">
                                        <AlertTriangle className="h-6 w-6 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="mb-2 text-xl font-semibold leading-tight text-[#001030]">
                                            Important Notice
                                        </h2>
                                        <p className="leading-relaxed text-slate-700">
                                            By accessing or using this website, you acknowledge that you have
                                            read, understood, and agree to be bound by these Terms of Use and
                                            our Privacy Policy. If you do not agree to these terms, please
                                            discontinue use of this website immediately.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div className="h-1 w-full bg-[#1d3658]/15" />
                        </div>

                        {/* Accordion */}
                        <div className="overflow-hidden rounded-3xl border-2 border-slate-200 bg-white shadow-2xl">
                            <div className="border-b border-slate-200 bg-slate-50/60 px-7 py-6">
                                <p className="text-sm font-semibold uppercase tracking-wide text-[#1d3658]">
                                    Terms sections
                                </p>
                                <p className="mt-1 text-sm text-slate-600">Tap a section to expand.</p>
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
                                                    <span className="text-base font-semibold text-[#001030] sm:text-lg">
                                                        {section.title}
                                                    </span>
                                                </div>
                                            </AccordionTrigger>

                                            <AccordionContent className="px-5 pb-6">
                                                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                                                    <div className="space-y-6">
                                                        {section.content.map((item, idx) => (
                                                            <div key={idx}>
                                                                <h4 className="mb-2 text-base font-semibold leading-tight text-[#001030]">
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

                        {/* Contact */}
                        <div className="mt-10 overflow-hidden rounded-3xl border-2 border-slate-200 bg-white p-8 shadow-xl lg:p-12">
                            <div className="rounded-3xl border-2 border-[#1d3658]/15 bg-[#1d3658]/5 p-6 sm:p-8">
                                <div className="flex items-start gap-4">
                                    <Mail className="h-6 w-6 flex-shrink-0 text-[#1d3658]" />
                                    <div>
                                        <p className="mb-2 font-semibold text-[#001030]">
                                            Questions About These Terms?
                                        </p>
                                        <p className="mb-4 text-sm leading-relaxed text-slate-700">
                                            If you have any questions or concerns about these Terms of Use,
                                            please contact us:
                                        </p>
                                        <a
                                            href="mailto:hello@mkfraud.co.za"
                                            className="inline-flex items-center gap-2 rounded-2xl bg-[#001030] px-5 py-3 font-semibold text-white transition-all hover:opacity-95"
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
