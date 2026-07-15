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
  executePhase14WorkerStep,
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
  if (!input.workerLease) return input.client.rpc(input.manualFunction, input.parameters);
  const parameters = input.workerParameters ?? input.parameters;
  const payload = Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => [key.replace(/^p_/, ''), value])
  );
  try {
    const data = await executePhase14WorkerStep(
      input.workerLease,
      input.workerFunction,
      payload,
      {
        reportId: typeof payload.report_id === 'string' ? payload.report_id : null,
        recipient: typeof payload.recipient === 'string' ? payload.recipient : null
      }
    );
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
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
  workerLease?: Phase14WorkerLease;
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
  const runPayload = {
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
    };
  const { data, error } = input.workerLease
    ? await (async () => {
        try {
          return {
            data: await executePhase14WorkerStep<string>(
              input.workerLease!,
              'record_premium_report_generation_run',
              { fulfilment_id: input.fulfilmentId, run: runPayload }
            ),
            error: null
          };
        } catch (caught) {
          return { data: null, error: caught };
        }
      })()
    : await db.rpc('record_premium_report_generation_run', {
        p_capability_id: null,
        p_fulfilment_id: input.fulfilmentId,
        p_run: runPayload
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
  const finalCleanupRegistration = input.workerLease
    ? await generationRpc({
        client: input.privilegedDb,
        workerLease: input.workerLease,
        manualFunction: 'register_phase14_storage_cleanup',
        workerFunction: 'worker_register_phase14_storage_cleanup',
        parameters: {
          p_storage_bucket: report.storage_bucket,
          p_storage_path: finalPath,
          p_expected_checksum: report.checksum,
          p_claim_token: input.claim.claim_token,
          p_reason: 'Recovered final object orphan protection until terminal publication',
          p_report_id: report.id
        }
      })
    : await input.privilegedDb.rpc('register_phase14_manual_final_storage_cleanup', {
        p_storage_bucket: report.storage_bucket,
        p_storage_path: finalPath,
        p_expected_checksum: report.checksum,
        p_claim_token: input.claim.claim_token,
        p_reason: 'Recovered final object orphan protection until terminal publication',
        p_report_id: report.id
      });
  if (finalCleanupRegistration.error || !finalCleanupRegistration.data) {
    throw finalCleanupRegistration.error ?? new Error('Recovered final object cleanup ownership could not be registered.');
  }
  const finalCleanupId = String(finalCleanupRegistration.data);
  const recordCleanupResult = async (result: {
    deletionRequested: boolean;
    deleteApiAccepted: boolean;
    providerResultClass: string;
    error?: string | null;
  }) => {
    const { data, error } = input.workerLease
      ? await generationRpc({
          client: input.privilegedDb,
          workerLease: input.workerLease,
          manualFunction: 'record_phase14_storage_cleanup_result',
          workerFunction: 'worker_record_phase14_storage_cleanup_result',
          parameters: {
            p_cleanup_id: cleanupJobId,
            p_deletion_requested: result.deletionRequested,
            p_delete_api_accepted: result.deleteApiAccepted,
            p_provider_result_class: result.providerResultClass,
            p_error: result.error ?? null
          }
        })
      : await input.privilegedDb.rpc('record_phase14_storage_cleanup_result', {
          p_cleanup_id: cleanupJobId,
          p_deleted: result.providerResultClass === 'object_not_found',
          p_error: result.error ?? (result.providerResultClass === 'object_not_found'
            ? null
            : `Storage absence was not verified (${result.providerResultClass}).`)
        });
    if (error || !data) throw error ?? new Error('Storage cleanup result was not persisted.');
    return data;
  };
  const { published } = await publishCommittedReportObject({
    db,
    bucket: report.storage_bucket,
    temporaryPath: report.storage_path,
    finalPath,
    checksum: report.checksum,
    cleanupJobId,
    publishReport: async () => {
      if (!input.fulfilmentId || !report.generation_run_id) {
        throw new Error('Recovered terminal publication bindings are incomplete.');
      }
      const terminalPayload = {
        claim_token: input.claim.claim_token,
        fulfilment_id: input.fulfilmentId,
        generation_run_id: report.generation_run_id,
        report_id: report.id,
        final_cleanup_id: finalCleanupId,
        generation_mode: run?.generation_mode ?? 'deterministic_fallback',
        metadata: {
          evidence_checksum: run?.evidence_checksum ?? null,
          report_reference: report.report_reference,
          recovery: true
        },
        fault_after: null
      };
      if (input.workerLease) {
        return executePhase14WorkerStep<Record<string, any>>(
          input.workerLease,
          'terminal_phase14_generation_publication',
          {
            capability_id: input.workerLease.capabilityId,
            ...terminalPayload
          },
          { terminalGeneration: true, reportId: report.id }
        );
      }
      const { data, error } = await input.privilegedDb.rpc(
        'admin_terminal_phase14_generation_publication',
        { p_request_payload: terminalPayload }
      );
      if (error || !data) throw error ?? new Error('Atomic manual report publication returned no result.');
      return data;
    },
    recordCleanupResult
  });
  return {
    reportId: report.id,
    reportReference: report.report_reference,
    versionNumber: Number(published.version_number ?? report.version_number),
    supersededReportId: published.superseded_report_id ?? report.supersedes_report_id ?? null,
    generationMode: run?.generation_mode ?? 'deterministic_fallback',
    evidenceChecksum: run?.evidence_checksum ?? 'legacy-report-no-generation-run',
    readyForEmailDelivery: true,
    reusedExistingReport: true
  };
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
  let fulfilmentId = input.fulfilmentId ?? null;
  if (!input.workerLease) {
    const { data: manualIdentity, error: manualIdentityError } = await privilegedDb.rpc(
      'ensure_manual_premium_report_fulfilment',
      {
        p_order_reference: input.orderReference,
        p_trigger_source: input.actor.action
      }
    );
    const persistedFulfilmentId = manualIdentity?.fulfilment?.id;
    if (manualIdentityError || !persistedFulfilmentId) {
      throw manualIdentityError ?? new Error('Manual generation fulfilment identity was not persisted.');
    }
    fulfilmentId = String(persistedFulfilmentId);
  }
  const db = createSupabaseServiceClient() as any;
  const flags = await getPremiumReportAutomationFlags();
  let claimToken: string | null = null;
  let temporaryPath: string | null = null;
  let storageBucket: string | null = null;
  let cleanupJobId: string | null = null;
  let finalCleanupJobId: string | null = null;
  let draftCommitted = false;

  try {
    const assembled = await assembleReportData(input.orderReference);
    const reportType = validatePremiumReportGenerationEntitlement(assembled);
    const claimOwner = fulfilmentId ? `fulfilment:${fulfilmentId}` : `request:${crypto.randomUUID()}`;
    const { data: claimData, error: claimError } = await generationRpc({
      client: privilegedDb,
      workerLease: input.workerLease,
      manualFunction: 'claim_premium_report_generation',
      workerFunction: 'worker_claim_premium_report_generation',
      parameters: {
        p_order_reference: input.orderReference,
        p_claim_owner: claimOwner,
        p_fulfilment_id: fulfilmentId ?? null,
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
          p_fulfilment_id: fulfilmentId ?? null
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
        fulfilmentId: fulfilmentId,
        workerLease: input.workerLease
      });
      return recovered;
    }

    await updateFulfilmentSafely(fulfilmentId, {
      fulfilmentId: fulfilmentId ?? '',
      status: 'assembling',
      currentStep: 'assemble_evidence',
      incrementAttempt: true,
      errorCode: null,
      errorMessage: null,
      workerLease: input.workerLease
    });

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
    const generationIdentity = fulfilmentId
      ? `fulfilment:${fulfilmentId}:score:${assembled.scoreRun.id}`
      : `generation-claim:${claimToken}`;
    await updateFulfilmentSafely(fulfilmentId, {
      fulfilmentId: fulfilmentId ?? '',
      status: flags.aiNarrativeEnabled ? 'generating' : 'validating',
      currentStep: flags.aiNarrativeEnabled ? 'generate_narrative' : 'validate_deterministic_fallback'
      ,workerLease: input.workerLease
    });
    const prepared = await preparePremiumReportNarrative({
      assembled,
      deterministicContent,
      roadmap,
      flags,
      generator: input.generator,
      generationIdentity,
      fulfilmentId: fulfilmentId ?? null,
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
      fulfilmentId: fulfilmentId, prepared, flags, db: privilegedDb,
      workerLease: input.workerLease
    });

    assembled.reportReference = claim.report_reference;
    await updateFulfilmentSafely(fulfilmentId, {
      fulfilmentId: fulfilmentId ?? '',
      status: 'rendering',
      currentStep: 'render_pdf',
      generationMode: prepared.mode,
      workerLease: input.workerLease
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

    await updateFulfilmentSafely(fulfilmentId, {
      fulfilmentId: fulfilmentId ?? '',
      status: 'storing',
      currentStep: 'store_unique_temporary_pdf',
      generationMode: prepared.mode,
      workerLease: input.workerLease
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

    const finalCleanupRegistration = input.workerLease
      ? await generationRpc({
          client: privilegedDb,
          workerLease: input.workerLease,
          manualFunction: 'register_phase14_storage_cleanup',
          workerFunction: 'worker_register_phase14_storage_cleanup',
          parameters: {
            p_storage_bucket: storageBucket,
            p_storage_path: finalPath,
            p_expected_checksum: checksum,
            p_claim_token: claimToken,
            p_reason: 'Final object orphan protection until terminal database publication',
            p_report_id: reportId
          }
        })
      : await privilegedDb.rpc('register_phase14_manual_final_storage_cleanup', {
          p_storage_bucket: storageBucket,
          p_storage_path: finalPath,
          p_expected_checksum: checksum,
          p_claim_token: claimToken,
          p_reason: 'Final object orphan protection until terminal database publication',
          p_report_id: reportId
        });
    if (finalCleanupRegistration.error || !finalCleanupRegistration.data) {
      throw finalCleanupRegistration.error ?? new Error('Final object orphan cleanup ownership could not be registered.');
    }
    finalCleanupJobId = String(finalCleanupRegistration.data);

    const recordCleanupResult = async (result: {
      deletionRequested: boolean;
      deleteApiAccepted: boolean;
      providerResultClass: string;
      error?: string | null;
    }) => {
      const { data, error } = input.workerLease
        ? await generationRpc({
            client: privilegedDb,
            workerLease: input.workerLease,
            manualFunction: 'record_phase14_storage_cleanup_result',
            workerFunction: 'worker_record_phase14_storage_cleanup_result',
            parameters: {
              p_cleanup_id: cleanupJobId,
              p_deletion_requested: result.deletionRequested,
              p_delete_api_accepted: result.deleteApiAccepted,
              p_provider_result_class: result.providerResultClass,
              p_error: result.error ?? null
            }
          })
        : await privilegedDb.rpc('record_phase14_storage_cleanup_result', {
            p_cleanup_id: cleanupJobId,
            p_deleted: result.providerResultClass === 'object_not_found',
            p_error: result.error ?? (result.providerResultClass === 'object_not_found'
              ? null
              : `Storage absence was not verified (${result.providerResultClass}).`)
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
        if (!fulfilmentId || !generationRunId || !finalCleanupJobId) {
          throw new Error('Terminal generation publication bindings are incomplete.');
        }
        const terminalPayload = {
          claim_token: claimToken,
          fulfilment_id: fulfilmentId,
          generation_run_id: generationRunId,
          report_id: reportId,
          final_cleanup_id: finalCleanupJobId,
          generation_mode: prepared.mode,
          metadata: {
            evidence_checksum: prepared.evidenceChecksum,
            order_reference: input.orderReference,
            report_reference: claim.report_reference,
            report_type: reportType
          },
          fault_after: null
        };
        if (input.workerLease) {
          return executePhase14WorkerStep<Record<string, any>>(
            input.workerLease,
            'terminal_phase14_generation_publication',
            {
              capability_id: input.workerLease.capabilityId,
              ...terminalPayload
            },
            { terminalGeneration: true, reportId }
          );
        }
        const { data, error } = await privilegedDb.rpc(
          'admin_terminal_phase14_generation_publication',
          { p_request_payload: terminalPayload }
        );
        if (error || !data) throw error ?? new Error('Atomic manual report publication returned no result.');
        return data;
      },
      recordCleanupResult
    });
    temporaryPath = null;

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
        if (cleanupJobId && !input.workerLease) {
          const { error: cleanupResultError } = await generationRpc({
            client: privilegedDb,
            workerLease: undefined,
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
    await updateFulfilmentSafely(fulfilmentId, {
      fulfilmentId: fulfilmentId ?? '',
      status: 'failed',
      currentStep: draftCommitted ? 'publication_recovery_required' : 'failed',
      errorCode: reportFailureCode(error),
      errorMessage: message,
      workerLease: input.workerLease
    });
    throw error;
  }
}
