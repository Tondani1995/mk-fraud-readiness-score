import { benchmarkResponse } from '@/lib/visual-review/benchmark-service';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (
    process.env.VERCEL_ENV === 'production' ||
    (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview')
  )
    return new Response(null, { status: 404 });
  return benchmarkResponse(await request.json());
}
