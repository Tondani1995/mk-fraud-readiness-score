import crypto from 'node:crypto';
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
import {
  requirePhase14Action,
  requirePhase14WorkerAction,
  type Phase14WorkerLease
} from './phase14-security';
import {
  publishCommittedReportObject,
  uploadTemporaryReportObject
} from './storage-publication';
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
  workerLease?: Phase14WorkerLease;
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

async function generationRpc(input: {
  client: any;
  workerLease?: Phase14WorkerLease;
  manualFunction: string;
  workerFunction: string;
  parameters: Record<string, unknown>;
  workerParameters?: Record<string, unknown>;
}) {
  const parameters = input.workerLease
    ? {
        p_capability_id: input.workerLease.capabilityId,
        ...(input.workerParameters ?? input.parameters)
      }
    : input.parameters;
  return input.client.rpc(
    input.workerLease ? input.workerFunction : input.manualFunction,
    parameters
  );
}

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
  db: any;
  capabilityId?: string | null;
}) {
  if (!input.fulfilmentId) return null;
  const db = input.db;
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
  const { data, error } = await db.rpc('record_premium_report_generation_run', {
    p_capability_id: input.capabilityId ?? null,
    p_fulfilment_id: input.fulfilmentId,
    p_run: {
    generation_mode: input.prepared.mode,
    provider: generation?.provider ?? null,
    model: generation?.model ?? null,
    requested_provider: input.prepared.mode === 'deterministic_fallback'
      ? null
      : input.flags.model.split('/')[0] || 'vercel-ai-gateway',
    requested_model: input.prepared.mode === 'deterministic_fallback' ? null : input.flags.model,
    resolved_provider: generation?.provider ?? null,
    resolved_model: generation?.model ?? null,
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
    estimated_cost_micros: usage?.estimatedCostMicros ?? null,
    accounting_status: input.prepared.mode === 'deterministic_fallback' ? 'not_applicable' : 'verified',
    latency_ms: generation?.latencyMs ?? null,
    status: 'used',
    error_code: input.prepared.fallbackReason ?? null,
    error_message: input.prepared.fallbackReason ?? null,
    completed_at: new Date().toISOString()
    }
  });
  if (error || !data) throw error ?? new Error('Generation provenance could not be persisted.');
  return data as string;
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
  privilegedDb: any;
  claim: GenerationClaim;
  assessmentReference: string;
  fulfilmentId?: string | null;
  workerLease?: Phase14WorkerLease;
  actor: PremiumReportActor;
}) : Promise<GeneratePremiumReportResult> {
  if (!input.claim.claim_token || !input.claim.report_id) throw new Error('Committed draft resume context is incomplete.');
  const { report, run } = await loadGenerationMetadata(db, input.claim.report_id);
  if (!report.storage_bucket || !report.storage_path || !report.checksum) {
    throw new Error('Committed report draft has incomplete storage metadata.');
  }
  const finalPath = `${input.assessmentReference}/${report.report_reference}-${report.checksum}.pdf`;
  const { data: cleanupJobId, error: cleanupRegistrationError } = await generationRpc({
    client: input.privilegedDb,
    workerLease: input.workerLease,
    manualFunction: 'register_phase14_storage_cleanup',
    workerFunction: 'worker_register_phase14_storage_cleanup',
    parameters: {
      p_storage_bucket: report.storage_bucket,
      p_storage_path: report.storage_path,
      p_expected_checksum: report.checksum,
      p_claim_token: input.claim.claim_token,
      p_reason: 'Committed draft publication recovery'
    }
  });
  if (cleanupRegistrationError || !cleanupJobId) {
    throw cleanupRegistrationError ?? new Error('Committed draft cleanup ownership could not be registered.');
  }
  const { error: cleanupLinkError } = await generationRpc({
    client: input.privilegedDb,
    workerLease: input.workerLease,
    manualFunction: 'link_phase14_storage_cleanup_report',
    workerFunction: 'worker_link_phase14_storage_cleanup_report',
    parameters: { p_cleanup_id: cleanupJobId, p_report_id: report.id }
  });
  if (cleanupLinkError) throw cleanupLinkError;
  const recordCleanupResult = async (result: { deleted: boolean; error?: string | null }) => {
    const { data, error } = await generationRpc({
      client: input.privilegedDb,
      workerLease: input.workerLease,
      manualFunction: 'record_phase14_storage_cleanup_result',
      workerFunction: 'worker_record_phase14_storage_cleanup_result',
      parameters: { p_cleanup_id: cleanupJobId, p_deleted: result.deleted, p_error: result.error ?? null }
    });
    if (error || !data) throw error ?? new Error('Storage cleanup result was not persisted.');
    return data;
  };
  await publishCommittedReportObject({
    db,
    bucket: report.storage_bucket,
    temporaryPath: report.storage_path,
    finalPath,
    checksum: report.checksum,
    cleanupJobId,
    publishReport: async () => {
      const { data, error } = await generationRpc({
        client: input.privilegedDb,
        workerLease: input.workerLease,
        manualFunction: 'publish_premium_report_generation',
        workerFunction: 'worker_publish_premium_report_generation',
        parameters: { p_claim_token: input.claim.claim_token, p_report_id: report.id }
      });
      if (error || !data) throw error ?? new Error('Report publication returned no result.');
      return data;
    },
    recordCleanupResult
  });
  if (input.workerLease && input.fulfilmentId) {
    const { data: completed, error: completionError } = await input.privilegedDb.rpc(
      'complete_phase14_generation_operation',
      {
        p_capability_id: input.workerLease.capabilityId,
        p_fulfilment_id: input.fulfilmentId,
        p_generation_run_id: report.generation_run_id ?? null,
        p_report_id: report.id,
        p_generation_mode: run?.generation_mode ?? 'deterministic_fallback',
        p_actor_user_id: input.actor.userId ?? null,
        p_event_type: report.supersedes_report_id ? 'regenerated' : 'generated',
        p_note: `Version ${report.version_number} completed through committed-draft recovery.`,
        p_metadata: {
          fulfilment_id: input.fulfilmentId,
          generation_run_id: report.generation_run_id ?? null,
          evidence_checksum: run?.evidence_checksum ?? null,
          ready_for_email_delivery: true,
          report_reference: report.report_reference,
          version_number: report.version_number,
          generation_mode: run?.generation_mode ?? 'deterministic_fallback',
          recovery: true
        }
      }
    );
    if (completionError || !completed?.completed) {
      throw completionError ?? new Error('Committed-draft completion was not persisted atomically.');
    }
  } else {
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'ready_for_delivery',
      currentStep: 'ready_for_email_delivery',
      reportId: report.id,
      capabilityId: null
    });
  }
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
  db: any;
  capabilityId?: string | null;
}) {
  const { error } = await input.db.rpc('record_phase14_report_generated', {
      p_capability_id: input.capabilityId ?? null,
      p_report_id: input.reportId,
      p_actor_user_id: input.actor.userId ?? null,
      p_event_type: input.supersededReportId ? 'regenerated' : 'generated',
      p_note: `Version ${input.versionNumber} created using ${input.prepared.mode}.`,
      p_metadata: {
        fulfilment_id: input.fulfilmentId ?? null,
        generation_run_id: input.generationRunId,
        evidence_checksum: input.prepared.evidenceChecksum,
        ready_for_email_delivery: true,
        order_reference: input.orderReference,
        report_reference: input.reportReference,
        report_type: input.reportType,
        version_number: input.versionNumber,
        generation_mode: input.prepared.mode
      }
  });
  if (error) throw error;
}

export async function generatePremiumReport(
  input: GeneratePremiumReportInput
): Promise<GeneratePremiumReportResult> {
  const phase14Action = input.actor.action === 'admin_regenerate' || input.actor.action === 'admin_retry'
    ? 'report_regeneration'
    : 'report_generation';
  if (input.actor.actorType === 'system' && !input.workerLease) {
    throw new Error('Automatic report generation requires a durable worker capability lease.');
  }
  const { client: privilegedDb } = input.workerLease
    ? await requirePhase14WorkerAction(input.workerLease, phase14Action)
    : await requirePhase14Action(phase14Action);
  const db = createSupabaseServiceClient() as any;
  const flags = await getPremiumReportAutomationFlags();
  let claimToken: string | null = null;
  let temporaryPath: string | null = null;
  let storageBucket: string | null = null;
  let cleanupJobId: string | null = null;
  let draftCommitted = false;

  try {
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'assembling',
      currentStep: 'assemble_evidence',
      incrementAttempt: true,
      errorCode: null,
      errorMessage: null,
      capabilityId: input.workerLease?.capabilityId ?? null
    });

    const assembled = await assembleReportData(input.orderReference);
    const reportType = validatePremiumReportGenerationEntitlement(assembled);
    const claimOwner = input.fulfilmentId ? `fulfilment:${input.fulfilmentId}` : `request:${crypto.randomUUID()}`;
    const { data: claimData, error: claimError } = await generationRpc({
      client: privilegedDb,
      workerLease: input.workerLease,
      manualFunction: 'claim_premium_report_generation',
      workerFunction: 'worker_claim_premium_report_generation',
      parameters: {
        p_order_reference: input.orderReference,
        p_claim_owner: claimOwner,
        p_fulfilment_id: input.fulfilmentId ?? null,
        p_report_type: reportType
      }
    });
    if (claimError || !claimData) throw claimError ?? new Error('Generation claim RPC returned no result.');
    let claim = claimData as GenerationClaim;
    if (!claim.claimed && claim.reason === 'committed_draft_recovery_required') {
      const { data: recovered, error: recoveryError } = await generationRpc({
        client: privilegedDb,
        workerLease: input.workerLease,
        manualFunction: 'recover_premium_report_generation_claim',
        workerFunction: 'worker_recover_premium_report_generation_claim',
        parameters: {
          p_order_reference: input.orderReference,
          p_claim_owner: claimOwner
        },
        workerParameters: {
          p_order_reference: input.orderReference,
          p_claim_owner: claimOwner,
          p_fulfilment_id: input.fulfilmentId ?? null
        }
      });
      if (recoveryError || !recovered) throw recoveryError ?? new Error('Committed draft recovery returned no claim.');
      claim = recovered as GenerationClaim;
    }
    if (!claim.claimed || !claim.claim_token) {
      throw new Error(`Premium report generation is already in progress (${claim.reason}).`);
    }
    claimToken = claim.claim_token;
    if (claim.report_id) {
      const recovered = await resumeCommittedDraft(db, {
        privilegedDb,
        claim,
        assessmentReference: assembled.assessmentReference,
        fulfilmentId: input.fulfilmentId,
        workerLease: input.workerLease,
        actor: input.actor
      });
      return recovered;
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
      ,capabilityId: input.workerLease?.capabilityId ?? null
    });
    const prepared = await preparePremiumReportNarrative({
      assembled,
      deterministicContent,
      roadmap,
      flags,
      generator: input.generator,
      generationIdentity,
      fulfilmentId: input.fulfilmentId ?? null,
      workerCapabilityId: input.workerLease?.capabilityId ?? null,
      authorizeAiAction: input.workerLease
        ? () => requirePhase14WorkerAction(input.workerLease!, 'ai_narrative_generation')
        : undefined
    });
    const { error: leaseRenewalError } = await generationRpc({
      client: privilegedDb,
      workerLease: input.workerLease,
      manualFunction: 'renew_premium_report_generation_lease',
      workerFunction: 'worker_renew_premium_report_generation_lease',
      parameters: { p_claim_token: claimToken }
    });
    if (leaseRenewalError) throw leaseRenewalError;
    const generationRunId = await persistGenerationProvenance({
      fulfilmentId: input.fulfilmentId, prepared, flags, db: privilegedDb,
      capabilityId: input.workerLease?.capabilityId ?? null
    });

    assembled.reportReference = claim.report_reference;
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'rendering',
      currentStep: 'render_pdf',
      generationMode: prepared.mode,
      capabilityId: input.workerLease?.capabilityId ?? null
    });
    const pdfBuffer = await renderHtmlToPdfBuffer(renderReportHtml(assembled, prepared.selectedContent, roadmap));
    const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
    storageBucket = process.env.SUPABASE_BUCKET_REPORTS ?? 'generated-reports';
    temporaryPath = `tmp/${assembled.assessmentReference}/${claimToken}/${crypto.randomUUID()}.pdf`;
    const finalPath = `${assembled.assessmentReference}/${claim.report_reference}-${checksum}.pdf`;

    const { data: registeredCleanupId, error: cleanupRegistrationError } = await generationRpc({
      client: privilegedDb,
      workerLease: input.workerLease,
      manualFunction: 'register_phase14_storage_cleanup',
      workerFunction: 'worker_register_phase14_storage_cleanup',
      parameters: {
        p_storage_bucket: storageBucket,
        p_storage_path: temporaryPath,
        p_expected_checksum: checksum,
        p_claim_token: claimToken,
        p_reason: 'Temporary report object after immutable publication'
      }
    });
    if (cleanupRegistrationError || !registeredCleanupId) {
      throw cleanupRegistrationError ?? new Error('Temporary object cleanup ownership could not be registered.');
    }
    cleanupJobId = registeredCleanupId as string;

    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'storing',
      currentStep: 'store_unique_temporary_pdf',
      generationMode: prepared.mode,
      capabilityId: input.workerLease?.capabilityId ?? null
    });
    await uploadTemporaryReportObject({
      db,
      bucket: storageBucket,
      path: temporaryPath,
      bytes: pdfBuffer,
      checksum,
      reportReference: claim.report_reference,
      claimToken
    });

    const { data: reportId, error: commitError } = await generationRpc({
      client: privilegedDb,
      workerLease: input.workerLease,
      manualFunction: 'commit_premium_report_draft',
      workerFunction: 'worker_commit_premium_report_draft',
      parameters: {
        p_claim_token: claimToken,
        p_template_id: template.id,
        p_storage_bucket: storageBucket,
        p_temp_storage_path: temporaryPath,
        p_checksum: checksum,
        p_generated_by: input.actor.userId ?? null,
        p_generation_run_id: generationRunId
      },
      workerParameters: {
        p_claim_token: claimToken,
        p_template_id: template.id,
        p_storage_bucket: storageBucket,
        p_temp_storage_path: temporaryPath,
        p_checksum: checksum,
        p_generation_run_id: generationRunId
      }
    });
    if (commitError || !reportId) throw commitError ?? new Error('Report draft commit returned no report ID.');
    draftCommitted = true;

    const { error: cleanupLinkError } = await generationRpc({
      client: privilegedDb,
      workerLease: input.workerLease,
      manualFunction: 'link_phase14_storage_cleanup_report',
      workerFunction: 'worker_link_phase14_storage_cleanup_report',
      parameters: { p_cleanup_id: cleanupJobId, p_report_id: reportId }
    });
    if (cleanupLinkError) throw cleanupLinkError;

    const recordCleanupResult = async (result: { deleted: boolean; error?: string | null }) => {
      const { data, error } = await generationRpc({
        client: privilegedDb,
        workerLease: input.workerLease,
        manualFunction: 'record_phase14_storage_cleanup_result',
        workerFunction: 'worker_record_phase14_storage_cleanup_result',
        parameters: { p_cleanup_id: cleanupJobId, p_deleted: result.deleted, p_error: result.error ?? null }
      });
      if (error || !data) throw error ?? new Error('Storage cleanup result was not persisted.');
      return data;
    };

    const { published } = await publishCommittedReportObject({
      db,
      bucket: storageBucket,
      temporaryPath,
      finalPath,
      checksum,
      cleanupJobId,
      publishReport: async () => {
        const { data, error } = await generationRpc({
          client: privilegedDb,
          workerLease: input.workerLease,
          manualFunction: 'publish_premium_report_generation',
          workerFunction: 'worker_publish_premium_report_generation',
          parameters: { p_claim_token: claimToken, p_report_id: reportId }
        });
        if (error || !data) throw error ?? new Error('Report publication returned no result.');
        return data;
      },
      recordCleanupResult
    });
    temporaryPath = null;

    if (input.workerLease && input.fulfilmentId) {
      const completionMetadata = {
        fulfilment_id: input.fulfilmentId,
        generation_run_id: generationRunId,
        evidence_checksum: prepared.evidenceChecksum,
        ready_for_email_delivery: true,
        order_reference: input.orderReference,
        report_reference: claim.report_reference,
        report_type: reportType,
        version_number: Number(published.version_number),
        generation_mode: prepared.mode
      };
      const { data: completed, error: completionError } = await privilegedDb.rpc(
        'complete_phase14_generation_operation',
        {
          p_capability_id: input.workerLease.capabilityId,
          p_fulfilment_id: input.fulfilmentId,
          p_generation_run_id: generationRunId,
          p_report_id: reportId,
          p_generation_mode: prepared.mode,
          p_actor_user_id: input.actor.userId ?? null,
          p_event_type: published.superseded_report_id ? 'regenerated' : 'generated',
          p_note: `Version ${Number(published.version_number)} created using ${prepared.mode}.`,
          p_metadata: completionMetadata
        }
      );
      if (completionError || !completed?.completed) {
        throw completionError ?? new Error('Generation completion was not persisted atomically.');
      }
    } else {
      if (input.fulfilmentId) {
        const { error: generationLinkError } = await privilegedDb.rpc('link_premium_report_generation_run', {
          p_capability_id: null,
          p_generation_run_id: generationRunId,
          p_report_id: reportId
        });
        if (generationLinkError) throw generationLinkError;
        await updateFulfilmentSafely(input.fulfilmentId, {
          fulfilmentId: input.fulfilmentId,
          status: 'ready_for_delivery',
          currentStep: 'ready_for_email_delivery',
          generationMode: prepared.mode,
          reportId,
          capabilityId: null
        });
      }
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
        prepared,
        db: privilegedDb,
        capabilityId: null
      });
    }

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
        const { error: removalError } = await db.storage.from(storageBucket).remove([temporaryPath]);
        if (cleanupJobId) {
          const { error: cleanupResultError } = await generationRpc({
            client: privilegedDb,
            workerLease: input.workerLease,
            manualFunction: 'record_phase14_storage_cleanup_result',
            workerFunction: 'worker_record_phase14_storage_cleanup_result',
            parameters: {
              p_cleanup_id: cleanupJobId,
              p_deleted: !removalError,
              p_error: removalError?.message ?? null
            }
          });
          if (cleanupResultError) {
            throw new AggregateError([error, cleanupResultError], 'Generation and cleanup-result persistence both failed.');
          }
        }
      }
      const { error: abandonmentError } = await generationRpc({
        client: privilegedDb,
        workerLease: input.workerLease,
        manualFunction: 'abandon_premium_report_generation_claim',
        workerFunction: 'worker_abandon_premium_report_generation_claim',
        parameters: { p_claim_token: claimToken, p_reason: errorMessage(error) }
      });
      if (abandonmentError) {
        throw new AggregateError([error, abandonmentError], 'Generation and durable claim abandonment both failed.');
      }
    }
    const message = errorMessage(error);
    await updateFulfilmentSafely(input.fulfilmentId, {
      fulfilmentId: input.fulfilmentId ?? '',
      status: 'failed',
      currentStep: draftCommitted ? 'publication_recovery_required' : 'failed',
      errorCode: reportFailureCode(error),
      errorMessage: message,
      capabilityId: input.workerLease?.capabilityId ?? null
    });
    throw error;
  }
}
