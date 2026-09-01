import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { Card, CardContent } from '@/components/ui/Card';
import { AdaptiveAssessmentExperience } from '@/components/adaptive/AdaptiveAssessmentExperience';
import { getAdaptiveAssessmentState } from '@/lib/adaptive/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdaptiveAssessmentPage(
  props: { params: Promise<{ assessmentRef: string }>; searchParams?: Promise<{ token?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  if (!searchParams?.token) return <SectionShell className="w-full py-12"><PageHeader eyebrow="FRAUD READINESS ASSESSMENT" title="Private resume link required" description="Open the private link returned when this assessment was started." /></SectionShell>;
  try {
    const state = await getAdaptiveAssessmentState(params.assessmentRef, searchParams.token);
    return <SectionShell className="w-full py-10 md:py-14"><PageHeader eyebrow="FRAUD READINESS ASSESSMENT" title="Complete your tailored readiness assessment" description="Your answers are saved after server confirmation. The assessment adapts to your organisation, and you can review the scope before submission." /><AdaptiveAssessmentExperience assessmentReference={params.assessmentRef} token={searchParams.token} initialState={state.publicState} /></SectionShell>;
  } catch (error) {
    return <SectionShell className="w-full py-12"><PageHeader eyebrow="FRAUD READINESS ASSESSMENT" title="Assessment cannot be opened" description="This private assessment link is invalid or unavailable."/><Card><CardContent className="pt-6 text-sm text-mk-muted">Use the original private resume link, or start a new assessment.</CardContent></Card></SectionShell>;
  }
}
