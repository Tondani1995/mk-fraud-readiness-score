import { snapshotFor } from '@/lib/readiness-review/service';
import { reviewError, reviewJson } from '@/lib/readiness-review/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    return reviewJson(await snapshotFor(token));
  } catch (error) {
    return reviewError(error);
  }
}
