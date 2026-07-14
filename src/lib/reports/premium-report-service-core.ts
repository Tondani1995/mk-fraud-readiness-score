import crypto from 'node:crypto';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleReportData, ReportAssemblyError } from './assemble-report-data';
import { ReportEntitlementError, validatePremiumReportGenerationEntitlement } from './report-entitlement';
import { selectContent } from './select-content-blocks';
import { selectRoadmap } from './roadmap';
import { renderReportHtml } from './templates/report-template';
import { renderHtmlToPdfBuffer } from './render-pdf';
import { getPremiumReportAutomationFlags } from './automation/feature-flags';
import { preparePremiumReportNarrative } from './automation/narrative-pipeline';
import { updatePremiumReportFulfilment } from './automation/fulfilment';
import type {
  PremiumReportAutomationFlags,
  PremiumReportGenerationMode,
  PremiumReportNarrativeGenerator,
  PreparedPremiumReportNarrative
} from './automation/types';

export type PremiumReportActor = {
  actorType: 'admin' | 'system';
  userId?: string | null;
  action: 'admin_generate' | 'admin_retry' | 'admin_regenerate' | 'automatic_workflow';
};

export type GeneratePremiumReportInput = {
  orderReference: string;
  actor: PremiumReportActor;
  fulfilmentId?: string | null;
  generator?: PremiumReportNarrativeGenerator;
  flags?: PremiumReportAutomationFlags;
};

export type GeneratePremiumReportResult = {
  reportId: string;
  reportReference: string;
  versionNumber: number;
  supersededReportId: string | null;
  generationMode: PremiumReportGenerationMode;
  evidenceChecksum: string;
  readyForEmailDelivery: true;
  reusedExistingReport?: boolean;
};

type GenerationClaim = {
  claimed: boolean;
  claim_token: string | null;
  version_number: number;
  report_reference: string;
  report_id: string | null;
  current_report_id?: string | null;
  reason: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown report-generation error');
}

function reportFailureCode(error: unknown) {
  if (error instanceof ReportAssemblyError || error instanceof ReportEntitlementError) return error.reason;
  return 'generation_failed';
}

async function updateFulfilmentSafely(
  fulfilmentId: string | null | undefined,
  patch: Parameters<typeof updatePremiumReportFulfilment>[0]
) {
  if (!fulfilmentId) return;
  try {
    await updatePremiumReportFulfilment(patch);
  } catch (error) {
    console.error('Phase 14 fulfilment status update failed', { fulfilmentId, error: errorMessage(error) });
  }
}

async function persistGenerationProvenance(input: {
  fulfilmentId?: string | null;
  prepared: PreparedPremiumReportNarrative;
  flags: PremiumReportAutomationFlags;
}) {
  if (!input.fulfilmentId) return null;
  const db = createSupabaseServiceClient() as any;
  const { data: existing, error: existingError } = await db
    .from('report_generation_runs')
    .select('id,status')
    .eq('fulfilment_id', input.fulfilmentId)
    .eq('status', 'used')
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing.id as string;

  const generation = input.prepared.mode === 'ai_repair'
    ? input.prepared.repairGeneration
    : input.prepared.generation;
  const usage = generation?.usage;
  const { data: latest, error: latestError } = await db
    .from('report_generation_runs')
    .select('attempt_number')
    .eq('fulfilment_id', input.fulfilmentId)
    .order('attempt_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  const { data, error } = await db.from('report_generation_runs').insert({
    fulfilment_id: input.fulfilmentId,
    attempt_number: Number(latest?.attempt_number ?? 0) + 1,
    generation_mode: input.prepared.mode,
    provider: generation?.provider ?? null,
    model: generation?.model ?? null,
    prompt_version: input.flags.promptVersion,
    schema_version: input.prepared.evidence.schemaVersion,
    evidence_checksum: input.prepared.evidenceChecksum,
    evidence_snapshot_json: input.prepared.evidence,
    structured_output_json: input.prepared.narrative,
    validation_result_json: input.prepared.validation,
    validation_errors_json: input.prepared.validation.issues,
    input_token_count: usage?.inputTokens ?? null,
    output_token_count: usage?.outputTokens ?? null,
    total_token_count: usage?.totalTokens ?? null,
    latency_ms: generation?.latencyMs ?? null,
    status: 'used',
    error_code: input.prepared.fallbackReason ?? null,
    error_message: input.prepared.fallbackReason ?? null,
    completed_at: new Date().toISOString()
  }).select('id').single();
  if (error || !data) throw error ?? new Error('Generation provenance could not be persisted.');
  return data.id as string;
}

async function verifyStoredChecksum(db: any, bucket: string, path: string, expected: string) {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Stored report verification failed: ${error?.message ?? 'object missing'}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error(`Stored report checksum mismatch: expected ${expected}, received ${actual}.`);
}

async function loadGenerationMetadata(db: any, reportId: string) {
  const { data: report, error } = await db
    .from('reports')
    .select('id,report_reference,version_number,supersedes_report_id,generation_run_id,storage_bucket,storage_path,checksum,status')
    .eq('id', reportId)
    .maybeSingle();
  if (error || !report) throw error ?? new Error(`Report ${reportId} was not found.`);
  const { data: run, error: runError } = report.generation_run_id
    ? await db.from('report_generation_runs')
      .select('generation_mode,evidence_checksum')
      .eq('id', report.generation_run_id)
      .maybeSingle()
    : { data: null, error: null };
  if (runError) throw runError;
  return { report, run };
}

async function resumeCommittedDraft(db: any, input: {
  claim: GenerationClaim;
  assessmentReference: string;
  fulfilmentId?: string | null;
}) : Promise<GeneratePremiumReportResult> {
  if (!input.claim.claim_token || !input.claim.report_id) throw new Error('Committed draft resume context is incomplete.');
  const { report, run } = await loadGenerationMetadata(db, input.claim.report_id);
  if (!report.storage_bucket || !report.storage_path || !report.checksum) {
    throw new Error('Committed report draft has incomplete storage metadata.');
  }
  const finalPath = `${input.assessmentReference}/${report.report_reference}-${report.checksum}.pdf`;
  const { error: copyError } = await db.storage.from(report.storage_bucket).copy(report.storage_path, finalPath);
  if (copyError && !/already exists|duplicate/i.test(copyError.message)) {
    throw new Error(`Final report publication failed: ${copyError.message}`);
  }
  await verifyStoredChecksum(db, report.storage_bucket, finalPath, report.checksum);
  const { data: published, error: publishError } = await db.rpc('publish_premium_report_generation', {
    p_claim_token: input.claim.claim_token,
    p_report_id: report.id,
    p_final_storage_path: finalPath
  });
  if (publishError || !published) throw publishError ?? new Error('Report publication RPC returned no result.');
  await db.storage.from(report.storage_bucket).remove([report.storage_path]).catch(() => null);
  await updateFulfilmentSafely(input.fulfilmentId, {
    fulfilmentId: input.fulfilmentId ?? '',
    status: 'ready_for_delivery',
    currentStep: 'ready_for_email_delivery',
    reportId: report.id
  });
  return {
    reportId: report.id,
    reportReference: report.report_reference,
    versionNumber: Number(report.version_number),
    supersededReportId: report.supersedes_report_id ?? null,
    generationMode: run?.generation_mode ?? 'deterministic_fallback',
    evidenceChecksum: run?.evidence_checksum ?? 'legacy-report-no-generation-run',
    readyForEmailDelivery: true,
    reusedExistingReport: true
  };
}

async function logGenerated(input: {
  reportId: string;
  actor: PremiumReportActor;
  assessmentId: string;
  orderId: string;
  orderReference: string;
  reportReference: string;
  reportType: string;
  versionNumber: number;
  supersededReportId: string | null;
  fulfilmentId?: string | null;
  generationRunId: string | null;
  prepared: PreparedPremiumReportNarrative;
}) {
  const db = createSupabaseServiceClient() as any;
  await Promise.all([
    db.from('report_events').insert({
      report_id: input.reportId,
      event_type: input.supersededReportId ? 'regenerated' : 'generated',
      actor_user_id: input.actor.userId ?? null,
      note: `Version ${input.versionNumber} created using ${input.prepared.mode}.`,
      metadata_json: {
        fulfilment_id: input.fulfilmentId ?? null,
        generation_run_id: input.generationRunId,
        evidence_checksum: input.prepared.evidenceChecksum,
        ready_for_email_delivery: true
      }
    }),
    db.from('audit_logs').insert({
      actor_type: input.actor.actorType,
      actor_user_id: input.actor.userId ?? null,
      assessment_id: input.assessmentId,
      entity_table: 'reports',
      entity_id: input.reportId,
      action: input.supersededReportId ? 'report_regenerated' : 'report_generated',
      after_json: { report_reference: input.reportReference, version_number: input.versionNumber }
    }),
    trackAssessmentEvent({
      eventType: 'report_generated',
      assessmentId: input.assessmentId,
      orderId: input.orderId,
      reportId: input.reportId,
      metadata: {
        order_reference: input.orderReference,
        report_reference: input.reportReference,
        report_type: input.reportType,
        version_number: input.versionNumber,
        generation_mode: input.prepared.mode
      }
    })
  ]);
}

export async function generatePremiumReport(
  input: GeneratePremiumReportInput
): Promise<GeneratePremiumReportResult> {
  const db = createSupabaseServiceClient() as any;
  const flags = input.flags ?? await getPremiumReportAutomationFlags();
  let claimToken: string | null = null;
  let temporaryPath: string | null = null;
  let storageBucket: string | null = null;
  let draftCommitted = false;

  try {
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'assembling',
      currentStep: 'assemble_evidence',
      incrementAttempt: true,
      errorCode: null,
      errorMessage: null
    });

    const assembled = await assembleReportData(input.orderReference);
    const reportType = validatePremiumReportGenerationEntitlement(assembled);
    const claimOwner = input.fulfilmentId ? `fulfilment:${input.fulfilmentId}` : `request:${crypto.randomUUID()}`;
    const { data: claimData, error: claimError } = await db.rpc('claim_premium_report_generation', {
      p_order_reference: input.orderReference,
      p_claim_owner: claimOwner,
      p_fulfilment_id: input.fulfilmentId ?? null,
      p_report_type: reportType
    });
    if (claimError || !claimData) throw claimError ?? new Error('Generation claim RPC returned no result.');
    const claim = claimData as GenerationClaim;
    if (!claim.claimed || !claim.claim_token) {
      throw new Error(`Premium report generation is already in progress (${claim.reason}).`);
    }
    claimToken = claim.claim_token;
    if (claim.report_id) {
      return await resumeCommittedDraft(db, { claim, assessmentReference: assembled.assessmentReference, fulfilmentId: input.fulfilmentId });
    }

    const [{ data: template, error: templateError }, { data: blockRows, error: blockError }] = await Promise.all([
      db.from('report_templates').select('id').eq('report_type', reportType).eq('status', 'active')
        .order('version_number', { ascending: false }).limit(1).maybeSingle(),
      db.from('report_content_blocks')
        .select('block_key,block_type,domain_code,maturity_band,severity,title,body,status')
        .eq('status', 'active')
    ]);
    if (templateError || !template) throw new Error(`No active report template is configured for ${reportType}.`);
    if (blockError) throw blockError;

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
    const roadmap = selectRoadmap(assembled);
    const generationIdentity = input.fulfilmentId
      ? `fulfilment:${input.fulfilmentId}:score:${assembled.scoreRun.id}`
      : `generation-claim:${claimToken}`;
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: flags.aiNarrativeEnabled ? 'generating' : 'validating',
      currentStep: flags.aiNarrativeEnabled ? 'generate_narrative' : 'validate_deterministic_fallback'
    });
    const prepared = await preparePremiumReportNarrative({
      assembled,
      deterministicContent,
      roadmap,
      flags,
      generator: input.generator,
      generationIdentity,
      fulfilmentId: input.fulfilmentId ?? null
    });
    const generationRunId = await persistGenerationProvenance({ fulfilmentId: input.fulfilmentId, prepared, flags });

    assembled.reportReference = claim.report_reference;
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'rendering',
      currentStep: 'render_pdf',
      generationMode: prepared.mode
    });
    const pdfBuffer = await renderHtmlToPdfBuffer(renderReportHtml(assembled, prepared.selectedContent, roadmap));
    const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    storageBucket = process.env.SUPABASE_BUCKET_REPORTS ?? 'generated-reports';
    temporaryPath = `tmp/${assembled.assessmentReference}/${claimToken}/${crypto.randomUUID()}.pdf`;
    const finalPath = `${assembled.assessmentReference}/${claim.report_reference}-${checksum}.pdf`;

    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'storing',
      currentStep: 'store_unique_temporary_pdf',
      generationMode: prepared.mode
    });
    const { error: uploadError } = await db.storage.from(storageBucket)
      .upload(temporaryPath, pdfBuffer, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw new Error(`Temporary storage upload failed: ${uploadError.message}`);

    const { data: reportId, error: commitError } = await db.rpc('commit_premium_report_draft', {
      p_claim_token: claimToken,
      p_template_id: template.id,
      p_storage_bucket: storageBucket,
      p_temp_storage_path: temporaryPath,
      p_checksum: checksum,
      p_generated_by: input.actor.userId ?? null,
      p_generation_run_id: generationRunId
    });
    if (commitError || !reportId) throw commitError ?? new Error('Report draft commit returned no report ID.');
    draftCommitted = true;

    const { error: copyError } = await db.storage.from(storageBucket).copy(temporaryPath, finalPath);
    if (copyError && !/already exists|duplicate/i.test(copyError.message)) {
      throw new Error(`Final immutable storage publication failed: ${copyError.message}`);
    }
    await verifyStoredChecksum(db, storageBucket, finalPath, checksum);
    const { data: published, error: publishError } = await db.rpc('publish_premium_report_generation', {
      p_claim_token: claimToken,
      p_report_id: reportId,
      p_final_storage_path: finalPath
    });
    if (publishError || !published) throw publishError ?? new Error('Report publication returned no result.');
    await db.storage.from(storageBucket).remove([temporaryPath]).catch(() => null);
    temporaryPath = null;

    if (input.fulfilmentId) {
      const { error: generationLinkError } = await db.from('report_generation_runs')
        .update({ report_id: reportId }).eq('id', generationRunId);
      if (generationLinkError) throw generationLinkError;
    }
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'ready_for_delivery',
      currentStep: 'ready_for_email_delivery',
      generationMode: prepared.mode,
      reportId
    });
    await logGenerated({
      reportId,
      actor: input.actor,
      assessmentId: assembled.assessmentId,
      orderId: assembled.orderId,
      orderReference: input.orderReference,
      reportReference: claim.report_reference,
      reportType,
      versionNumber: Number(published.version_number),
      supersededReportId: published.superseded_report_id ?? null,
      fulfilmentId: input.fulfilmentId,
      generationRunId,
      prepared
    });

    return {
      reportId,
      reportReference: claim.report_reference,
      versionNumber: Number(published.version_number),
      supersededReportId: published.superseded_report_id ?? null,
      generationMode: prepared.mode,
      evidenceChecksum: prepared.evidenceChecksum,
      readyForEmailDelivery: true
    };
  } catch (error) {
    if (!draftCommitted && claimToken) {
      if (temporaryPath && storageBucket) {
        await db.storage.from(storageBucket).remove([temporaryPath]).catch(() => null);
      }
      await db.rpc('release_premium_report_generation_claim', { p_claim_token: claimToken }).catch(() => null);
    }
    const message = errorMessage(error);
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'failed',
      currentStep: draftCommitted ? 'publication_recovery_required' : 'failed',
      errorCode: reportFailureCode(error),
      errorMessage: message
    });
    throw error;
  }
}
