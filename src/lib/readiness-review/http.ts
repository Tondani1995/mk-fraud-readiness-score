import { NextResponse } from 'next/server';
import { ActionRejected, ReplayError, RulesetIntegrityError } from './session';
import { HarnessUnavailable, SaveConflict, SaveFailed, TokenNotFound } from './service';
import { StoreConflict, StoreUnavailable } from './store';

/**
 * HTTP mapping for the review track. Every response is private and uncached, and error bodies carry a stable code
 * the interface can act on (reload, retry or explain) without parsing messages.
 */
const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer'
};

export function reviewJson(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(body, { status: init?.status ?? 200, headers: { ...HEADERS, ...(init?.headers ?? {}) } });
}

export function reviewError(error: unknown) {
  if (error instanceof HarnessUnavailable) return reviewJson({ code: 'unavailable', message: 'The review track is not available in this environment.' }, { status: 404 });
  if (error instanceof TokenNotFound) return reviewJson({ code: 'not_found', message: error.message }, { status: 404 });
  if (error instanceof ActionRejected) return reviewJson({ code: error.code, message: error.message }, { status: 422 });
  if (error instanceof SaveConflict || error instanceof StoreConflict) return reviewJson({ code: 'conflict', message: 'This session changed in another window. The current state has been reloaded.' }, { status: 409 });
  if (error instanceof SaveFailed) return reviewJson({ code: 'save_failed', message: 'Your answer could not be saved. Nothing was recorded; you can try again.' }, { status: 503 });
  if (error instanceof ReplayError) return reviewJson({ code: 'incompatible', message: error.message }, { status: 410 });
  if (error instanceof StoreUnavailable) return reviewJson({ code: 'store_unavailable', message: error.message }, { status: 503 });
  if (error instanceof RulesetIntegrityError) return reviewJson({ code: 'ruleset_unavailable', message: 'The review track is unavailable because its ruleset failed an integrity check. Nothing was recorded.' }, { status: 503 });
  console.error('[readiness-review] unexpected error', error instanceof Error ? error.message : error);
  return reviewJson({ code: 'error', message: 'Something went wrong. Nothing was recorded.' }, { status: 500 });
}

export async function readJson(request: Request, limit = 20_000): Promise<any> {
  const text = await request.text();
  if (text.length > limit) throw new ActionRejected('invalid_input', 'Request too large');
  try {
    return JSON.parse(text);
  } catch {
    throw new ActionRejected('invalid_input', 'Request body is not valid JSON');
  }
}
