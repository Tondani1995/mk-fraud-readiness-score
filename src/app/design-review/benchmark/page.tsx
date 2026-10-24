import { notFound } from 'next/navigation';
import { AssessmentBenchmark } from '@/components/review/AssessmentBenchmark';
export const dynamic = 'force-dynamic';
export default function Benchmark() {
  if (
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview')
  )
    notFound();
  return <AssessmentBenchmark />;
}
