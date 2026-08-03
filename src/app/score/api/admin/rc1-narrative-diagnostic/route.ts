/**
 * TEMPORARY RC1 diagnostic route. Reproduces the prepare_narrative validation failure for the
 * single hard-coded certification order inside the Preview runtime, where the branch-scoped
 * Sensitive Supabase variables are available.
 *
 * This file is deliberately short-lived: it is committed, invoked exactly once, and removed in the
 * immediately following commit. It performs reads only and returns closed-vocabulary identifiers.
 * It never returns organisation or respondent data, report prose, narrative text, answer text,
 * tokens, signed URLs, email addresses, credentials or environment values.
 */
import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { assembleReportData } from '@/lib/reports/assemble-report-data';
import { selectContent } from '@/lib/reports/select-content-blocks';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { buildPremiumReportEvidencePack } from '@/lib/reports/automation/evidence';
import { buildDeterministicNarrative } from '@/lib/reports/automation/content';
import { validatePremiumReportNarrative } from '@/lib/reports/automation/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORDER_REFERENCE = 'MKORD-2026-D1U0CTO8';
const STAGING_PROJECT_REF = 'penhenkzfrtmcxklodtu';
const PRODUCTION_PROJECT_REF = 'jvjxlphdyzerrhwcgkup';
const ALLOWED_BRANCH = 'fix/rc1-control-plane-profile-read';

function deny(error: string, status = 403) {
  return NextResponse.json({ ok: false, error }, { status });
}

function projectRef(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  try {
    return new URL(url).host.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

export async function POST() {
  // Environment and branch confinement.
  if (process.env.VERCEL_ENV !== 'preview') return deny('RC1_DIAG_PREVIEW_ONLY');
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? '';
  if (branch !== ALLOWED_BRANCH) return deny('RC1_DIAG_BRANCH_NOT_ALLOWED');

  // Project identity: refuse Production outright, require staging explicitly.
  const ref = projectRef();
  if (ref === PRODUCTION_PROJECT_REF) return deny('RC1_DIAG_PRODUCTION_REFUSED');
  if (ref !== STAGING_PROJECT_REF) return deny('RC1_DIAG_UNEXPECTED_PROJECT');

  // Authenticated authorised admin session.
  const admin = await getAdminSession();
  if (!admin) return deny('RC1_DIAG_SESSION_REQUIRED', 401);
  if (admin.role !== 'platform_admin') return deny('RC1_DIAG_FORBIDDEN_ROLE');

  const db = createSupabaseServiceClient() as any;

  // The database must be frozen with no active canary before any read runs. Freeze state is read
  // through rc1_freeze_status(), the same access path the application uses -- service_role has no
  // direct read on public.rc1_operation_freeze_state under the RC1 privilege contract.
  const { data: freeze, error: freezeError } = await db.rpc('rc1_freeze_status');
  if (freezeError || !freeze) return deny('RC1_DIAG_FREEZE_STATUS_UNAVAILABLE', 409);
  if (String(freeze.state ?? '').toLowerCase() !== 'frozen') return deny('RC1_DIAG_REQUIRES_FROZEN', 409);
  if (Number(freeze.freeze_epoch) !== 20) return deny('RC1_DIAG_UNEXPECTED_EPOCH', 409);
  if (freeze.canary_authorization_active !== false) return deny('RC1_DIAG_CANARY_ACTIVE', 409);

  try {
    // Exact production path, reads only.
    const assembled = await assembleReportData(ORDER_REFERENCE);
    const { data: blockRows } = await db
      .from('report_content_blocks')
      .select('block_key,block_type,domain_code,maturity_band,severity,title,body,status')
      .eq('status', 'active');
    const deterministicContent = selectContent(assembled, (blockRows ?? []).map((block: any) => ({
      blockKey: block.block_key,
      blockType: block.block_type,
      domainCode: block.domain_code,
      maturityBand: block.maturity_band,
      severity: block.severity,
      title: block.title,
      body: block.body,
      status: block.status
    })));
    const advisoryModel = buildAdvisoryEvidenceModel(assembled);
    const evidence = buildPremiumReportEvidencePack(assembled, advisoryModel);
    const narrative = buildDeterministicNarrative(assembled, deterministicContent);
    const validation = validatePremiumReportNarrative(narrative, evidence);

    // Only closed-vocabulary identifiers leave this route. `message` is excluded because it
    // interpolates finding identifiers and control names.
    const issues = (validation.issues ?? []).map((issue: any) => ({
      code: String(issue.code),
      path: String(issue.path)
    }));

    const evidenceIds = (evidence?.items ?? []).map((item: any) => String(item.id));
    const prefixes = [...new Set(evidenceIds.map((id) => id.split(':')[0]))].sort();

    return NextResponse.json({
      ok: true,
      freezeEpoch: freeze.freeze_epoch,
      projectRef: ref,
      validation: { ok: validation.ok === true, issueCount: issues.length, issues },
      counts: {
        questionTraces: (assembled as any)?.questionTraces?.length ?? null,
        exposureAnswers: assembled?.exposureAnswers?.length ?? null,
        domainResults: assembled?.domainResults?.length ?? null,
        activeContentBlocks: (blockRows ?? []).length,
        evidenceItems: evidenceIds.length,
        domainNarratives: (narrative as any)?.domainNarratives?.length ?? null,
        gapCommentary: (narrative as any)?.gapCommentary?.length ?? null
      },
      evidenceIdPrefixes: prefixes,
      // Reference identifiers only, never text.
      narrativeEvidenceRefs: {
        executiveDiagnosis: (narrative as any)?.executiveDiagnosis?.evidenceRefs ?? [],
        falseComfort: (narrative as any)?.falseComfort?.evidenceRefs ?? [],
        leadershipAttention: (narrative as any)?.leadershipAttention?.evidenceRefs ?? [],
        domainNarratives: ((narrative as any)?.domainNarratives ?? []).map((d: any) => ({
          domainCode: d?.domainCode ?? null,
          refs: d?.evidenceRefs ?? []
        }))
      },
      unknownEvidenceRefs: (() => {
        const known = new Set(evidenceIds);
        const used: string[] = [];
        const collect = (refs: unknown) => Array.isArray(refs) && refs.forEach((r) => used.push(String(r)));
        collect((narrative as any)?.executiveDiagnosis?.evidenceRefs);
        collect((narrative as any)?.falseComfort?.evidenceRefs);
        collect((narrative as any)?.leadershipAttention?.evidenceRefs);
        ((narrative as any)?.domainNarratives ?? []).forEach((d: any) => collect(d?.evidenceRefs));
        ((narrative as any)?.gapCommentary ?? []).forEach((g: any) => collect(g?.evidenceRefs));
        return [...new Set(used.filter((r) => !known.has(r)))];
      })()
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: 'RC1_DIAG_PIPELINE_THREW',
      stage: 'prepare_narrative',
      exceptionName: error instanceof Error ? error.name : 'unknown',
      // Safe: the thrown message here is a code-level identifier, not report prose.
      safeMessage: error instanceof Error ? error.message.slice(0, 300) : 'non-error thrown'
    }, { status: 500 });
  }
}
