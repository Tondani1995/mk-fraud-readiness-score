import { notFound } from 'next/navigation';
import Link from 'next/link';
import { HomeStory } from '@/components/website/Home/HomeStory';
import { AdaptiveAssessmentExperience } from '@/components/adaptive/AdaptiveAssessmentExperience';
import { buildAdaptiveVisualReviewState, VISUAL_REVIEW_ASSESSMENT_REFERENCE } from '@/lib/visual-review/fixtures';
import styles from '@/components/review/SpatialConcepts.module.css';
export const dynamic='force-dynamic';
export default async function SpatialConcepts({searchParams}:{searchParams:Promise<{concept?:string;surface?:string}>}){
  if(process.env.VERCEL_ENV==='production'||(process.env.NODE_ENV==='production'&&process.env.VERCEL_ENV!=='preview'))notFound();
  const params=await searchParams;
  const concept=params.concept==='board'?'board':'story';
  const question=params.surface==='questionnaire';
  return <div className={question?'mk-product':'mk-site'}><header className="border-b border-mk-line bg-white p-4"><p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">Local concept prototype · Synthetic data only</p><nav className="mt-3 flex flex-wrap gap-3 text-sm" aria-label="Compare spatial concepts">{(['story','board'] as const).flatMap(c=>(['home','questionnaire'] as const).map(s=><Link key={c+s} href={`/design-review/spatial?concept=${c}&surface=${s}`} className="rounded-brand border border-mk-line px-3 py-2 text-mk-navy">{c==='story'?'A / Continuous companion':'B / Briefing board'} · {s}</Link>))}</nav></header>{question?<main className={`${styles[concept]} mx-auto max-w-[1600px] p-4 sm:p-6`}><AdaptiveAssessmentExperience assessmentReference={VISUAL_REVIEW_ASSESSMENT_REFERENCE} token="visual-review-token" initialState={buildAdaptiveVisualReviewState('mid')} visualReview/></main>:<main><HomeStory composition={concept}/></main>}</div>;
}
