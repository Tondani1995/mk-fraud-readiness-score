import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { AdaptiveStartForm } from '@/components/adaptive/AdaptiveStartForm';
import { FraudReadinessTermsGate } from '@/components/adaptive/FraudReadinessTermsGate';

/**
 * Second entry point into a new assessment. It carries the same click-wrap gate as /score/start:
 * a new assessment cannot be created without acceptance, so an ungated form here would only
 * produce a rejected request the customer could not explain.
 */
export default function AdaptiveStartPage() {
  return <FraudReadinessTermsGate><SectionShell className="py-12 md:py-16"><PageHeader eyebrow="FRAUD READINESS ASSESSMENT" title="Understand your organisation’s fraud readiness" description="Complete a structured assessment of your organisation’s fraud risks and controls. It usually takes 20–30 minutes, and your progress is saved so you can return at any time." /><div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]"><Card className="bg-mk-charcoal text-white"><CardHeader className="border-white/10"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">WHAT TO EXPECT</p><CardTitle className="mt-2 text-white">A practical assessment of your current fraud controls.</CardTitle></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-white/80"><p>Answer questions about how fraud risk is currently governed and controlled.</p><p>Use the evidence examples to help locate the right information where needed.</p><p>Review your responses before submitting the assessment.</p></CardContent></Card><Card><CardHeader><CardTitle>Begin your assessment</CardTitle><p className="mt-2 text-sm leading-6 text-mk-muted">Enter your details to create a private assessment link and save your progress securely.</p></CardHeader><CardContent><AdaptiveStartForm /></CardContent></Card></div></SectionShell></FraudReadinessTermsGate>;
}
