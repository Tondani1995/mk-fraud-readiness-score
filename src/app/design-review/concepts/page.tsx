import { notFound } from 'next/navigation';
import { QuestionnaireConcepts } from '@/components/review/QuestionnaireConcepts';
export const dynamic = 'force-dynamic';
export default function Concepts() {
  if (
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview')
  )
    notFound();
  return <QuestionnaireConcepts />;
}
