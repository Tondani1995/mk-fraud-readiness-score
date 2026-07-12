import crypto from 'node:crypto';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleReportData, ReportAssemblyError } from './assemble-report-data';
import { selectContent } from './select-content-blocks';
import { selectRoadmap } from './roadmap';
import { renderReportHtml } from './templates/report-template';
import { renderHtmlToPdfBuffer } from './render-pdf';
import { getPremiumReportAutomationFlags } from './automation/feature-flags';
import { preparePremiumReportNarrative } from './automation/narrative-pipeline';
import { updatePremiumReportFulfilment } from './automation/fulfilment';
import type {
  NarrativeGenerationResult,
  NarrativeValidationResult,
  PremiumReportAutomationFlags,
  PremiumReportGenerationMode,
  PremiumReportNarrativeGenerator,
  PreparedPremiumReportNarrative
} from './automation/types';

const REPORT_TYPE_BY_PRODUCT_CODE: Record<string, string> = {
  essential_self_assessment: 'essential_self_assessment',
  mk_validated_assessment: 'mk_validated'
};

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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown report-generation error');
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

async function logReportEvent(input: {
  reportId?: string | null;
  eventType: string;
  actor: PremiumReportActor;
  note: string;
  assessmentId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = createSupabaseServiceClient() as any;
  const operations: PromiseLike<unknown>[] = [];

  if (input.reportId) {
    operations.push(db.from('report_events').insert({
      report_id: input.reportId,
      event_type: input.eventType,
      actor_user_id: input.actor.userId ?? null,
      note: input.note,
      metadata_json: {
        phase: 'phase14_autonomous_report_engine',
        actor_action: input.actor.action,
        ...input.metadata
      }
    }));
  }

  operations.push(db.from('audit_logs').insert({
    actor_type: input.actor.actorType,
    actor_user_id: input.actor.userId ?? null,
    assessment_id: input.assessmentId ?? null,
    entity_table: 'reports',
    entity_id: input.reportId ?? null,
    action: `report_${input.eventType}`,
    after_json: {
      note: input.note,
      actor_action: input.actor.action,
      phase: 'phase14_autonomous_report_engine',
      ...input.metadata
    }
  }));

  await Promise.all(operations);
}

function generationRunRow(input: {
  fulfilmentId: string;
  attemptNumber: number;
  mode: PremiumReportGenerationMode;
  prepared: PreparedPremiumReportNarrative;
  generation?: NarrativeGenerationResult;
  validation: NarrativeValidationResult;
  status: 'rejected' | 'failed' | 'used';
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  const usage = input.generation?.usage;
  return {
    fulfilment_id: input.fulfilmentId,
    attempt_number: input.attemptNumber,
    generation_mode: input.mode,
    provider: input.generation?.provider ?? null,
    model: input.generation?.model ?? null,
    prompt_version: input.prepared.evidence.schemaVersion ? input.prepared.evidence.schemaVersion && undefined : undefined,
    schema_version: input.prepared.evidence.schemaVersion,
    evidence_checksum: input.prepared.evidenceChecksum,
    evidence_snapshot_json: input.prepared.evidence,
    structured_output_json: input.generation?.output ?? input.prepared.narrative,
    validation_result_json: input.validation,
    validation_errors_json: input.validation.issues,
    input_token_count: usage?.inputTokens ?? null,
    output_token_count: usage?.outputTokens ?? null,
    total_token_count: usage?.totalTokens ?? null,
    latency_ms: input.generation?.latencyMs ?? null,
    status: input.status,
    error_code: input.errorCode ?? null,
    error_message: input.errorMessage ?? null,
    completed_at: new Date().toISOString()
  };
}

async function persistGenerationProvenance(input: {
  fulfilmentId?: string | null;
  prepared: PreparedPremiumReportNarrative;
  flags: PremiumReportAutomationFlags;
}) {
  if (!input.fulfilmentId) return null;
  const db = createSupabaseServiceClient() as any;
  const rows: Record<string, unknown>[] = [];
  let attempt = 1;

  if (input.prepared.generation && input.prepared.initialValidation) {
    rows.push({
      ...generationRunRow({
        fulfilmentId: input.fulfilmentId,
        attemptNumber: attempt,
        mode: 'ai',
        prepared: input.prepared,
        generation: input.prepared.generation,
        validation: input.prepared.initialValidation,
        status: input.prepared.mode === 'ai' ? 'used' : 'rejected'
      }),
      prompt_version: input.flags.promptVersion
    });
    attempt += 1;
  }

  if (input.prepared.repairGeneration && input.prepared.repairValidation) {
    rows.push({
      ...generationRunRow({
        fulfilmentId: input.fulfilmentId,
        attemptNumber: attempt,
        mode: 'ai_repair',
        prepared: input.prepared,
        generation: input.prepared.repairGeneration,
        validation: input.prepared.repairValidation,
        status: input.prepared.mode === 'ai_repair' ? 'used' : 'rejected'
      }),
      prompt_version: input.flags.promptVersion
    });
    attempt += 1;
  }

  if (input.prepared.mode === 'deterministic_fallback') {
    rows.push({
      ...generationRunRow({
        fulfilmentId: input.fulfilmentId,
        attemptNumber: attempt,
        mode: 'deterministic_fallback',
        prepared: input.prepared,
        validation: input.prepared.validation,
        status: 'used',
        errorCode: input.prepared.fallbackReason ?? null,
        errorMessage: input.prepared.fallbackReason ?? null
      }),
      prompt_version: input.flags.promptVersion
    });
  }

  if (!rows.length) return null;
  const { data, error } = await db
    .from('report_generation_runs')
    .insert(rows)
    .select('id,attempt_number,status,generation_mode');
  if (error) throw error;
  return (data ?? []).find((row: any) => row.status === 'used')?.id ?? null;
}

export async function generatePremiumReport(
  input: GeneratePremiumReportInput
): Promise<GeneratePremiumReportResult> {
  const db = createSupabaseServiceClient() as any;
  const flags = input.flags ?? await getPremiumReportAutomationFlags();

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
    const reportType = assembled.productCode ? REPORT_TYPE_BY_PRODUCT_CODE[assembled.productCode] : null;
    if (!reportType) throw new ReportAssemblyError('order_not_eligible', `Unrecognised report product ${assembled.productCode ?? 'none'}.`);

    if (input.fulfilmentId) {
      const { data: existingForFulfilment, error: fulfilmentReportError } = await db
        .from('reports')
        .select('id,report_reference,version_number,supersedes_report_id,storage_bucket,storage_path')
        .eq('fulfilment_id', input.fulfilmentId)
        .neq('status', 'voided')
        .maybeSingle();
      if (fulfilmentReportError) throw fulfilmentReportError;
      if (existingForFulfilment?.storage_bucket && existingForFulfilment?.storage_path) {
        await updateFulfilmentSafely(input.fulfilmentId, {
          fulfilmentId: input.fulfilmentId,
          status: 'ready_for_delivery',
          currentStep: 'ready_for_email_delivery',
          reportId: existingForFulfilment.id
        });
        return {
          reportId: existingForFulfilment.id,
          reportReference: existingForFulfilment.report_reference,
          versionNumber: Number(existingForFulfilment.version_number),
          supersededReportId: existingForFulfilment.supersedes_report_id ?? null,
          generationMode: 'deterministic_fallback',
          evidenceChecksum: 'persisted-on-generation-run',
          readyForEmailDelivery: true,
          reusedExistingReport: true
        };
      }
    }

    const [{ data: template, error: templateError }, { data: blockRows, error: blockError }] = await Promise.all([
      db.from('report_templates')
        .select('id,template_code,version_number')
        .eq('report_type', reportType)
        .eq('status', 'active')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from('report_content_blocks')
        .select('block_key,block_type,domain_code,maturity_band,severity,title,body,status')
        .eq('status', 'active')
    ]);

    if (templateError || !template) throw new Error(`No active report template is configured for ${reportType}.`);
    if (blockError) throw blockError;

    const contentBlocks = (blockRows ?? []).map((block: any) => ({
      blockKey: block.block_key,
      blockType: block.block_type,
      domainCode: block.domain_code,
      maturityBand: block.maturity_band,
      severity: block.severity,
      title: block.title,
      body: block.body,
      status: block.status
    }));

    const deterministicContent = selectContent(assembled, contentBlocks);
    const roadmap = selectRoadmap(assembled);

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
      generator: input.generator
    });

    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'validating',
      currentStep: 'narrative_validated',
      generationMode: prepared.mode
    });

    const generationRunId = await persistGenerationProvenance({
      fulfilmentId: input.fulfilmentId,
      prepared,
      flags
    });

    const { data: existingReport, error: existingReportError } = await db
      .from('reports')
      .select('id,version_number')
      .eq('assessment_id', assembled.scoreRun.assessmentId)
      .eq('report_type', reportType)
      .neq('status', 'superseded')
      .neq('status', 'voided')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingReportError) throw existingReportError;

    const nextVersion = existingReport ? Number(existingReport.version_number) + 1 : 1;
    const reportReference = `RPT-${assembled.assessmentReference}-V${nextVersion}`;
    const storageBucket = process.env.SUPABASE_BUCKET_REPORTS ?? 'generated-reports';
    const storagePath = `${assembled.assessmentReference}/${reportReference}.pdf`;
    assembled.reportReference = reportReference;

    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'rendering',
      currentStep: 'render_pdf',
      generationMode: prepared.mode
    });

    const html = renderReportHtml(assembled, prepared.selectedContent, roadmap);
    const pdfBuffer = await renderHtmlToPdfBuffer(html);
    const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'storing',
      currentStep: 'store_pdf',
      generationMode: prepared.mode
    });

    const { error: uploadError } = await db.storage
      .from(storageBucket)
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const reportInsert: Record<string, unknown> = {
      assessment_id: assembled.scoreRun.assessmentId,
      order_id: assembled.orderId,
      score_run_id: assembled.scoreRun.id,
      template_id: template.id,
      report_type: reportType,
      status: 'generated',
      report_reference: reportReference,
      version_number: nextVersion,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      checksum,
      generated_by: input.actor.userId ?? null,
      generated_at: new Date().toISOString(),
      supersedes_report_id: existingReport?.id ?? null
    };
    if (input.fulfilmentId) reportInsert.fulfilment_id = input.fulfilmentId;
    if (generationRunId) reportInsert.generation_run_id = generationRunId;

    const { data: newReport, error: insertError } = await db
      .from('reports')
      .insert(reportInsert)
      .select('id')
      .single();

    if (insertError || !newReport) {
      await db.storage.from(storageBucket).remove([storagePath]);
      throw new Error(`Report persistence failed: ${insertError?.message ?? 'unknown error'}`);
    }

    if (generationRunId) {
      await db.from('report_generation_runs').update({ report_id: newReport.id }).eq('id', generationRunId);
    }
    if (existingReport) await db.from('reports').update({ status: 'superseded' }).eq('id', existingReport.id);

    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'ready_for_delivery',
      currentStep: 'ready_for_email_delivery',
      generationMode: prepared.mode,
      reportId: newReport.id
    });

    await Promise.all([
      logReportEvent({
        reportId: newReport.id,
        eventType: existingReport ? 'regenerated' : 'generated',
        actor: input.actor,
        assessmentId: assembled.scoreRun.assessmentId,
        note: `Version ${nextVersion} created using ${prepared.mode}.`,
        metadata: {
          fulfilment_id: input.fulfilmentId ?? null,
          generation_run_id: generationRunId,
          evidence_checksum: prepared.evidenceChecksum,
          ready_for_email_delivery: true
        }
      }),
      trackAssessmentEvent({
        eventType: 'report_generated',
        assessmentId: assembled.scoreRun.assessmentId,
        orderId: assembled.orderId,
        reportId: newReport.id,
        metadata: {
          assessment_reference: assembled.assessmentReference,
          order_reference: input.orderReference,
          report_reference: reportReference,
          report_type: reportType,
          version_number: nextVersion,
          generation_mode: prepared.mode
        }
      })
    ]);

    return {
      reportId: newReport.id,
      reportReference,
      versionNumber: nextVersion,
      supersededReportId: existingReport?.id ?? null,
      generationMode: prepared.mode,
      evidenceChecksum: prepared.evidenceChecksum,
      readyForEmailDelivery: true
    };
  } catch (error) {
    const message = errorMessage(error);
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'failed',
      currentStep: 'failed',
      errorCode: error instanceof ReportAssemblyError ? error.reason : 'generation_failed',
      errorMessage: message
    });
    await logReportEvent({
      eventType: 'generation_failed',
      actor: input.actor,
      note: message,
      metadata: { order_reference: input.orderReference, fulfilment_id: input.fulfilmentId ?? null }
    }).catch(() => null);
    throw error;
  }
}
