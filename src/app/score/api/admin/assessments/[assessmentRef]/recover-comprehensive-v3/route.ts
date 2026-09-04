import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { canManagePlatform, getAdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// This route is a temporary, Preview-only operational seam for the single V3 forensic recovery
// fixture. Every assessment/order/report/storage value is pinned in both this route and the RPC;
// the request body is deliberately ignored/rejected so an admin cannot redirect the operation.
const PREVIEW_ENVIRONMENT = 'preview';
const ASSESSMENT_REFERENCE = 'MKFRS-2026-63D3103D95';
const BUCKET = 'generated-reports';
const V1_PDF_PATH =
  '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v1/RPT-MKFRS-2026-63D3103D95-V1-d65a3b4802445b3f.pdf';
const V1_REGISTER_PATH =
  '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v1/RPT-MKFRS-2026-63D3103D95-V1-supporting-register.xlsx';
const V3_PDF_PATH =
  '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v3/RPT-MKFRS-2026-63D3103D95-V3.pdf';
const V3_REGISTER_PATH =
  '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v3/RPT-MKFRS-2026-63D3103D95-V3-Comprehensive-supporting-register.xlsx';
const V1_PDF_SHA256 =
  'd65a3b4802445b3fb6d6b759c66b93a28897cc510081a6438c8817263f613ec3';
const V3_PDF_SHA256 =
  '87e7fd6a550c3bd816665116c3e437f7133a8af591836670d5437787f86f0d8f';
const V1_REGISTER_SHA256 =
  '2a28045444165e33a7379b2f00db4aa7ca34f2665ef0076c60a5e90c2192b4f6';
const V3_PDF_FILE_NAME = 'RPT-MKFRS-2026-63D3103D95-V3.pdf';
const V3_REGISTER_FILE_NAME =
  'RPT-MKFRS-2026-63D3103D95-V3-Comprehensive-supporting-register.xlsx';

type StoredBytes = { bytes: Buffer; sha256: string; size: number };

function sha256(bytes: Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function download(db: ReturnType<typeof createSupabaseServiceClient>, path: string): Promise<StoredBytes> {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`recovery_storage_read_failed:${path}:${error?.message ?? 'missing'}`);
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  return { bytes, sha256: sha256(bytes), size: bytes.length };
}

async function uploadAndReadBack(
  db: ReturnType<typeof createSupabaseServiceClient>,
  path: string,
  bytes: Buffer,
  contentType: string,
  expectedSha256: string,
  reportReference: string
) {
  const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
    metadata: {
      sha256: expectedSha256,
      reportReference,
      recoverySource: 'immutable-v1-forensic-recovery'
    }
  });
  if (error) throw new Error(`recovery_storage_write_failed:${path}:${error.message}`);
  const readBack = await download(db, path);
  if (readBack.sha256 !== expectedSha256 || readBack.size !== bytes.length) {
    throw new Error(`recovery_storage_readback_mismatch:${path}`);
  }
  return readBack;
}

export async function POST(
  request: Request,
  props: { params: Promise<{ assessmentRef: string }> }
) {
  const startedAt = Date.now();
  const { assessmentRef } = await props.params;
  const technicalReference = crypto.randomUUID();

  if (process.env.VERCEL_ENV?.trim().toLowerCase() !== PREVIEW_ENVIRONMENT) {
    return NextResponse.json({ ok: false, reason: 'preview_only', technicalReference }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  if (assessmentRef !== ASSESSMENT_REFERENCE) {
    return NextResponse.json({ ok: false, reason: 'assessment_not_authorised', technicalReference }, {
      status: 404,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  // The recovery has no caller-supplied data. Reject a non-empty body to make that contract
  // explicit, while allowing the normal empty POST emitted by the admin operational path.
  const requestBody = await request.text();
  if (requestBody.trim()) {
    return NextResponse.json({ ok: false, reason: 'body_not_permitted', technicalReference }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const admin = await getAdminSession();
  if (!canManagePlatform(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'platform_admin_required', technicalReference }, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  try {
    const db = createSupabaseServiceClient();

    const sourcePdf = await download(db, V1_PDF_PATH);
    if (sourcePdf.sha256 !== V1_PDF_SHA256 || sourcePdf.size !== 303473) {
      throw new Error('recovery_source_pdf_integrity_mismatch');
    }

    // The V3 PDF is the already-proven PDF-native transformation from V1. The route does not
    // re-render or regenerate it: it verifies the exact candidate, checks that PDF structure is
    // preserved, writes authoritative Storage metadata, and reads the bytes back before the DB RPC.
    const candidatePdf = await download(db, V3_PDF_PATH);
    if (candidatePdf.sha256 !== V3_PDF_SHA256 || candidatePdf.size !== 303597) {
      throw new Error('recovery_target_pdf_integrity_mismatch');
    }
    const [sourceDocument, candidateDocument] = await Promise.all([
      PDFDocument.load(sourcePdf.bytes),
      PDFDocument.load(candidatePdf.bytes)
    ]);
    if (sourceDocument.getPageCount() !== 22 || candidateDocument.getPageCount() !== 22) {
      throw new Error('recovery_pdf_page_count_mismatch');
    }
    const storedPdf = await uploadAndReadBack(
      db,
      V3_PDF_PATH,
      candidatePdf.bytes,
      'application/pdf',
      V3_PDF_SHA256,
      'RPT-MKFRS-2026-63D3103D95-V3'
    );

    const sourceRegister = await download(db, V1_REGISTER_PATH);
    if (sourceRegister.sha256 !== V1_REGISTER_SHA256 || sourceRegister.size !== 19283) {
      throw new Error('recovery_source_register_integrity_mismatch');
    }
    const storedRegister = await uploadAndReadBack(
      db,
      V3_REGISTER_PATH,
      sourceRegister.bytes,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      V1_REGISTER_SHA256,
      'RPT-MKFRS-2026-63D3103D95-V3'
    );

    const { data: recovery, error: recoveryError } = await db.rpc(
      'recover_comprehensive_v3_forward_forensic',
      { p_actor_admin_id: admin.id }
    );
    if (recoveryError) {
      throw new Error(`recovery_rpc_failed:${recoveryError.message}`);
    }

    console.info('comprehensive_v3_forward_forensic', {
      outcome: 'committed',
      assessmentReference: ASSESSMENT_REFERENCE,
      deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      reportReference: 'RPT-MKFRS-2026-63D3103D95-V3',
      providerCalls: 0,
      elapsedMs: Date.now() - startedAt
    });

    return NextResponse.json({
      ok: true,
      deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? null,
      assessmentReference: ASSESSMENT_REFERENCE,
      reportReference: 'RPT-MKFRS-2026-63D3103D95-V3',
      providerCalls: 0,
      sourcePdf: { sha256: sourcePdf.sha256, bytes: sourcePdf.size, pages: sourceDocument.getPageCount() },
      targetPdf: { sha256: storedPdf.sha256, bytes: storedPdf.size, pages: candidateDocument.getPageCount() },
      sourceRegister: { sha256: sourceRegister.sha256, bytes: sourceRegister.size },
      targetRegister: { sha256: storedRegister.sha256, bytes: storedRegister.size },
      recovery
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('comprehensive_v3_forward_forensic', {
      outcome: 'failed',
      technicalReference,
      reason: error instanceof Error ? error.message : 'unknown',
      elapsedMs: Date.now() - startedAt
    });
    return NextResponse.json({
      ok: false,
      reason: 'recovery_failed',
      technicalReference
    }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
