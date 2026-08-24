import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { GET as generateRecoveryPdf } from '../recovery-v10-v12-vhutshilo/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const EXPECTED_REPORT_REFERENCE = 'RPT-MKFRS-V12-ESS-VHUTSHILO-V1';
const RECOVERY_PATH_MARKER = 'recovery-qa/v10-v12/';
const RAW_MANUSCRIPT_SUFFIX = '-raw-manuscript.json';

type MemoryObject = {
  bytes: Uint8Array;
  contentType: string;
};

function sha256(bytes: Uint8Array | Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestMethod(input: Parameters<typeof fetch>[0], init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

function recoveryStorageKey(urlText: string): string | null {
  const url = new URL(urlText);
  if (!url.pathname.includes('/storage/v1/object')) return null;
  const decoded = decodeURIComponent(url.pathname);
  const markerIndex = decoded.indexOf(RECOVERY_PATH_MARKER);
  return markerIndex >= 0 ? decoded.slice(markerIndex) : null;
}

async function requestBodyBytes(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Uint8Array> {
  const body = init?.body;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);

  const request = input instanceof Request ? input.clone() : new Request(input, init);
  return new Uint8Array(await request.arrayBuffer());
}

function contentType(init?: RequestInit): string {
  try {
    return new Headers(init?.headers).get('content-type') ?? 'application/octet-stream';
  } catch {
    return 'application/octet-stream';
  }
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ ok: false, error: 'recovery_store_route_preview_only' }, { status: 404 });
  }

  const confirm = new URL(request.url).searchParams.get('confirm');
  if (confirm !== 'one-shot-v10-v12-vhutshilo-20260824') {
    return NextResponse.json({ ok: false, error: 'explicit_recovery_confirmation_required' }, { status: 400 });
  }

  const originalFetch = globalThis.fetch;
  const memory = new Map<string, MemoryObject>();
  let rawProviderResultCaptured = false;
  let generationAttempts = 0;

  const recoveryFetch: typeof fetch = async (input, init) => {
    const urlText = requestUrl(input);
    const key = recoveryStorageKey(urlText);
    if (!key) return originalFetch(input, init);

    const method = requestMethod(input, init);
    if (method === 'GET' || method === 'HEAD') {
      const stored = memory.get(key);
      if (!stored) {
        return new Response(
          JSON.stringify({ statusCode: '404', error: 'not_found', message: 'Synthetic recovery object not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(method === 'HEAD' ? null : stored.bytes.slice(), {
        status: 200,
        headers: {
          'Content-Type': stored.contentType,
          'Content-Length': String(stored.bytes.byteLength)
        }
      });
    }

    if (method === 'POST' || method === 'PUT') {
      const bytes = await requestBodyBytes(input, init);
      memory.set(key, { bytes, contentType: contentType(init) });
      if (key.endsWith(RAW_MANUSCRIPT_SUFFIX)) rawProviderResultCaptured = true;
      return new Response(JSON.stringify({ Key: `generated-reports/${key}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (method === 'DELETE') {
      memory.delete(key);
      return new Response(JSON.stringify({ message: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return originalFetch(input, init);
  };

  const internalUrl = new URL(request.url);
  internalUrl.pathname = '/score/api/qa/recovery-v10-v12-vhutshilo';
  internalUrl.search = '?format=pdf';

  let generated: Response;
  try {
    globalThis.fetch = recoveryFetch;

    generationAttempts = 1;
    generated = await generateRecoveryPdf(new Request(internalUrl.toString(), { method: 'GET' }));

    // If the provider result was captured but a deterministic post-provider stage failed,
    // retry once in the same request. The generator now reads the captured raw manuscript
    // from request-local memory, so this second pass cannot dispatch another provider call.
    if (!generated.ok && rawProviderResultCaptured) {
      generationAttempts = 2;
      generated = await generateRecoveryPdf(new Request(internalUrl.toString(), { method: 'GET' }));
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  if (!generated.ok) {
    const generatorError = await generated.text();
    const rawEntry = [...memory.entries()].find(([key]) => key.endsWith(RAW_MANUSCRIPT_SUFFIX));
    const rawBytes = rawEntry?.[1].bytes;
    return NextResponse.json(
      {
        ok: false,
        generationStatus: generated.status,
        generationAttempts,
        rawProviderResultCaptured,
        rawProviderResultBytes: rawBytes?.byteLength ?? 0,
        rawProviderResultSha256: rawBytes ? sha256(rawBytes) : null,
        generatorError: generatorError.slice(0, 4000),
        retryUsedProvider: false
      },
      { status: generated.status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
    );
  }

  const reportedProviderCalls = Number(generated.headers.get('x-mk-provider-calls') ?? '0');
  const providerCalls = rawProviderResultCaptured ? 1 : reportedProviderCalls;
  const score = generated.headers.get('x-mk-score');
  const maturity = generated.headers.get('x-mk-maturity');
  const proof = generated.headers.get('x-mk-recovery-proof');
  if (![0, 1].includes(reportedProviderCalls) || providerCalls > 1 || score !== '43.33' || maturity !== 'Developing' || proof !== 'PASS') {
    return NextResponse.json(
      {
        ok: false,
        error: 'recovery_generation_header_mismatch',
        reportedProviderCalls,
        providerCalls,
        score,
        maturity,
        proof,
        generationAttempts
      },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
    );
  }

  const bytes = Buffer.from(await generated.arrayBuffer());
  if (bytes.length < 100000 || bytes.subarray(0, 4).toString() !== '%PDF') {
    return NextResponse.json(
      { ok: false, error: 'recovery_generated_pdf_invalid', sizeBytes: bytes.length, generationAttempts },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
    );
  }

  const checksum = sha256(bytes);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${EXPECTED_REPORT_REFERENCE}.pdf"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'X-MK-Recovery-Proof': 'PASS',
      'X-MK-Provider-Calls': String(providerCalls),
      'X-MK-Reported-Provider-Calls': String(reportedProviderCalls),
      'X-MK-Generation-Attempts': String(generationAttempts),
      'X-MK-Raw-Provider-Captured': rawProviderResultCaptured ? 'true' : 'false',
      'X-MK-Score': String(score),
      'X-MK-Maturity': String(maturity),
      'X-MK-SHA256': checksum,
      'X-MK-Size-Bytes': String(bytes.length),
      'X-MK-Recovery-Storage': 'request-local-memory'
    }
  });
}
