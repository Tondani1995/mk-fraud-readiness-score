import { notFound } from 'next/navigation';
import { AssessmentInteractionReview } from '@/components/clarity/AssessmentInteractionReview';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Local assessment interaction laboratory',
  robots: { index: false, follow: false }
};
export default function InteractionReview() {
  if (
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview')
  )
    notFound();
  return <AssessmentInteractionReview />;
}
