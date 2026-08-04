import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { AdaptiveStartForm } from '@/components/adaptive/AdaptiveStartForm';

export default function AdaptiveStartPage() {
  return <SectionShell className="py-12 md:py-16"><PageHeader eyebrow="Adaptive fraud readiness" title="See the questions that matter to your organisation" description="This Preview experience begins with a short profile, then adapts the control pathway as you answer. It usually takes about 20–30 minutes." /><div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]"><Card className="bg-mk-charcoal text-white"><CardHeader className="border-white/10"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">How it works</p><CardTitle className="mt-2 text-white">A focused, respondent-led assessment.</CardTitle></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-white/80"><p>Answer a few operating-model questions first.</p><p>The pathway then brings forward the domains and controls relevant to your organisation.</p><p>Your progress is saved as you go, and you can resume from the private link.</p></CardContent></Card><Card><CardHeader><CardTitle>Start your adaptive assessment</CardTitle><p className="mt-2 text-sm leading-6 text-mk-muted">No account is required. Your answers are saved securely against a private resume link.</p></CardHeader><CardContent><AdaptiveStartForm /></CardContent></Card></div></SectionShell>;
}
