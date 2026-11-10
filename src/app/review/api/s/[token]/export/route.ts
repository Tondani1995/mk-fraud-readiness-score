import { exportFor } from '@/lib/readiness-review/service';
import { reviewError, reviewJson } from '@/lib/readiness-review/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The full export: contract versions, hashes, the engine report and the same Snapshot and management views. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = await exportFor(token);
    return reviewJson(body, { headers: { 'Content-Disposition': `attachment; filename="fictional-review-${body.session.sessionId.slice(0, 8)}.json"` } });
  } catch (error) {
    return reviewError(error);
  }
}
