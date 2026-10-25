import { NextResponse } from 'next/server';
import { recoverAdaptiveResultAccess } from '@/lib/adaptive/server';
import { checkRateLimits, RATE_LIMITS } from '@/lib/security/rate-limit';
import { hashIpAddress } from '@/lib/security/hash';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow'
};

class RecoveryBodyTooLarge extends Error {}

/** Bound the actual stream, including chunked requests without a trustworthy length header. */
async function readRecoveryBody(request: Request): Promise<unknown> {
  const maxBytes = 4096;
  if (Number(request.headers.get('content-length')) > maxBytes) throw new RecoveryBodyTooLarge();
  if (!request.body) return JSON.parse('');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RecoveryBodyTooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}
/** Explicit token exchange. A GET/page render never issues a credential. No external side effects. */
export async function POST(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const reply = (body: unknown, status: number) =>
    NextResponse.json(body, { status, headers: privateHeaders });
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
  )
    return reply({ ok: false, reason: 'private_access_required' }, 403);
  const { assessmentRef } = await props.params;
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  try {
    const limit = await checkRateLimits([
      {
        key: `adaptive_result:ip:${hashIpAddress(ipAddress) ?? 'unknown'}`,
        ...RATE_LIMITS.assessmentResumePerIp()
      },
      { key: `adaptive_result:ref:${assessmentRef}`, ...RATE_LIMITS.assessmentResumePerReference() }
    ], { failureMode: 'closed' });
    if (limit.unavailable) return reply({ ok: false, reason: 'result_recovery_unavailable' }, 503);
    if (!limit.allowed) return reply({ ok: false, reason: 'rate_limited' }, 429);
    let body: any;
    try {
      body = await readRecoveryBody(request);
    } catch (error) {
      return reply(
        { ok: false, reason: 'invalid_request' },
        error instanceof RecoveryBodyTooLarge ? 413 : 400
      );
    }
    if (typeof body?.token !== 'string' || !body.token || body.token.length > 512)
      return reply({ ok: false, reason: 'private_access_required' }, 403);
    const result = await recoverAdaptiveResultAccess(assessmentRef, body.token, { ipAddress });
    return reply(result, result.ok ? 200 : result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const denied = /token|assessment_not_found|mode_required|graph_pin|activation|runtime_environment/.test(
      message
    );
    return reply(
      { ok: false, reason: denied ? 'private_access_required' : 'result_recovery_unavailable' },
      denied ? 403 : 503
    );
  }
}
