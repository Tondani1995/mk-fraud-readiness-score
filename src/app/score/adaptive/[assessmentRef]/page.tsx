import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { Card, CardContent } from '@/components/ui/Card';
import { AdaptiveAssessmentExperience } from '@/components/adaptive/AdaptiveAssessmentExperience';
import { getAdaptiveAssessmentState } from '@/lib/adaptive/server';

export default async function AdaptiveAssessmentPage({ params, searchParams }: { params: { assessmentRef: string }; searchParams?: { token?: string } }) {
  if (!searchParams?.token) return <SectionShell className="py-12"><PageHeader eyebrow="Adaptive assessment" title="Private resume link required" description="Open the private link returned when this assessment was started." /></SectionShell>;
  try {
    const state = await getAdaptiveAssessmentState(params.assessmentRef, searchParams.token);
    return <SectionShell className="py-10 md:py-14"><PageHeader eyebrow="Adaptive fraud readiness" title="Complete your tailored assessment" description="Your answers are saved after server confirmation. You can move back, resume later and review the assessed scope before submission." /><AdaptiveAssessmentExperience assessmentReference={params.assessmentRef} token={searchParams.token} initialState={state.publicState} /></SectionShell>;
  } catch (error) {
    return <SectionShell className="py-12"><PageHeader eyebrow="Adaptive assessment" title="Assessment cannot be opened" description={error instanceof Error ? error.message : 'The private assessment link is invalid or unavailable.'}/><Card><CardContent className="pt-6 text-sm text-mk-muted">Use the original private resume link, or start a new Preview assessment.</CardContent></Card></SectionShell>;
  }
}
