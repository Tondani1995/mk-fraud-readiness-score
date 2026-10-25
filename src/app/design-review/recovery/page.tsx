import { notFound } from 'next/navigation';
import { ResultRecoveryReview } from '@/components/review/ResultRecoveryReview';
export const metadata={title:'Completed result recovery review',robots:{index:false,follow:false}};
export const dynamic = 'force-dynamic';
export default function RecoveryReview() {
  if (
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview')
  )
    notFound();
  return <ResultRecoveryReview />;
}
