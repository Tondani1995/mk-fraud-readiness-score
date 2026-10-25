import { notFound } from 'next/navigation';
import { FlowPresentationReview } from '@/components/review/FlowPresentationReview';
export const dynamic='force-dynamic';
export default async function FlowReview({searchParams}:{searchParams:Promise<{stage?:string}>}){
 if(process.env.VERCEL_ENV==='production'||(process.env.NODE_ENV==='production'&&process.env.VERCEL_ENV!=='preview'))notFound();
 const stage=(await searchParams).stage??'orientation';
 return <FlowPresentationReview initialStage={stage}/>;
}
