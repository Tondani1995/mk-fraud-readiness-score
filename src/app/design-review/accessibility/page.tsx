import { notFound } from 'next/navigation';
import { AccessibilityReview } from '@/components/clarity/AccessibilityReview';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Accessibility review',
  robots: { index: false, follow: false }
};
export default function AccessibilityPage() {
  if (
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview')
  )
    notFound();
  return <AccessibilityReview />;
}
