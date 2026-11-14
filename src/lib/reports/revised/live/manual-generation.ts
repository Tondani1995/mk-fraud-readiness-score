import crypto from 'node:crypto';
import { buildReportReference } from '@/lib/reports/report-reference';
import { COMPREHENSIVE_REPORT_TYPE } from '@/lib/reports/report-entitlement';
import { produceRevisedArtefacts, RevisedGenerationError, REVISED_LIVE_PIPELINE_VERSION, REVISED_OPERATOR_GUIDANCE, REVISED_TIME_BUDGET, type ManuscriptWriter } from './produce';
import { databaseAccounting, orderCallCeiling, type CallAccounting } from './accounting';
import { CheckpointUnavailable, loadCheckpoints, reconcileAudits, recordCheckpoint, type StoredCheckpoint } from './checkpoints';
import type { RevisedOrderContext } from './order';

/**
 * B5: the revised branch of the existing manual generation (generateManualPhase1Report). The attempt has already
 * been claimed and started by the existing path; this branch produces the revised artefacts and then uses the same
 * private bucket, path scheme, stored-object verification and atomic finalisation RPCs as the existing path
 * (complete_manual_report_generation for Essential, finalise_manual_report_with_supporting_register for Comprehensive
 * with its workbook). It reports every storage and finalisation state to the caller through `track`, so the existing
 * failure handler performs the cleanup and the ambiguous-commit reconciliation exactly as it does for MFRS reports.
 */

export type RevisedTrack = Partial<{
  storageBucket: string; storagePath: string; pdfUploaded: boolean; registerUploaded: boolean; registerStoragePath: string;
  pdfChecksum: string; finalisationInvoked: boolean; finalisationCommitted: boolean; failureDiagnostics: Record<string, unknown>;
}>;

export type RevisedGenerationHelpers = {
  verifyPrivateObject: (db: any, bucket: string, path: string, checksum: string, size: number, mime?: string, magic?: string) => Promise<void>;
  assertValidPdf: (bytes: Buffer, technicalReference: string) => void;
  sanitiseReference: (value: string) => string;
  recordDiagnostics: (input: Record<string, unknown>) => Promise<void>;
  makeError: (reason: string, message: string, status: number) => Error;
};

export async function generateRevisedManualReport(input: {
  db: any;
  attemptId: string;
  versionNumber: number;
  technicalReference: string;
  order: RevisedOrderContext;
  stage: (stage: string) => void;
  track: (state: RevisedTrack) => void;
  helpers: RevisedGenerationHelpers;
  writer?: ManuscriptWriter;
  /** Test seams. */
  now?: () => number;
  replay?: Parameters<typeof produceRevisedArtefacts>[0]['replay'];
  layout?: Parameters<typeof produceRevisedArtefacts>[0]['layout'];
  env?: Record<string, string | undefined>;
}) {
  const { db, order, helpers } = input;
  const startedAt = (input.now ?? Date.now)();

  // A revised report is never produced, released or delivered automatically: it is a restricted test edition and every
  // one is reviewed by an operator before anything else happens. The fulfilment worker's automatic trigger
  // (payment_confirmation) would otherwise generate and then release it; it is refused here, before any paid call, and
  // the existing failure path leaves the attempt for an operator.
  const { data: attemptRow, error: attemptError } = await db.from('manual_report_generation_attempts').select('trigger_source').eq('id', input.attemptId).maybeSingle();
  if (attemptError || !attemptRow) throw helpers.makeError('generation_attempt_unreadable', 'The generation attempt could not be read. Nothing was generated.', 500);
  if (!['admin_generate', 'admin_retry', 'admin_regenerate'].includes(String(attemptRow.trigger_source))) {
    await recordReviewRun(db, order, 'failed', null, `revised_requires_operator: ${JSON.stringify({ schemaVersion: 'revised-failure-diagnostics-v1', code: 'revised_requires_operator', triggerSource: attemptRow.trigger_source })}`, input.attemptId);
    throw helpers.makeError('revised_requires_operator', 'Revised reports are generated only by an operator from the order page, and are never released automatically.', 409);
  }

  // History before any paid work. First, any audit package whose report was committed but whose link was lost is
  // linked now (no AI call). Then the order's checkpoints are read for a resume point. If either cannot be read, nothing
  // is attempted: unknown history never becomes a fresh start (independent review F1).
  const scope = { orderReference: order.orderReference, inputDigest: order.binding.inputDigest, attemptId: input.attemptId };
  let history: StoredCheckpoint[];
  let recovered: Awaited<ReturnType<typeof reconcileAudits>>;
  try {
    recovered = await reconcileAudits(db, order.orderReference, order.binding.inputDigest);
    history = await loadCheckpoints(db, scope);
  } catch (error) {
    const detail = error instanceof CheckpointUnavailable ? error.detail : { error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' };
    await recordReviewRun(db, order, 'failed', null, `history_unavailable: ${JSON.stringify({ schemaVersion: 'revised-failure-diagnostics-v2', code: 'history_unavailable', calls: 0, ...detail })}`, input.attemptId);
    throw helpers.makeError('generation_history_unavailable', REVISED_OPERATOR_GUIDANCE.history_unavailable, 503);
  }
  if (recovered.linked.length) {
    await recordOperatorEvent(db, order, 'revised_audit_link_recovered', `Linked ${recovered.linked.length} stored audit package(s) to their committed report(s); no AI call was made.`, { linked: recovered.linked, restrictedTest: true });
  }
  const env = input.env ?? process.env;
  const accounting: CallAccounting = databaseAccounting(db, { campaign: env.MK_REVISED_CALL_CAMPAIGN?.trim() || null, ...scope, orderCeiling: orderCallCeiling(env) });
  const reportType = order.reportType;
  const isComprehensive = reportType === COMPREHENSIVE_REPORT_TYPE;
  const reportReference = buildReportReference({ assessmentReference: order.assessmentReference, reportType, versionNumber: input.versionNumber });

  input.stage('preflight_report_identity');
  const { data: identityRows, error: identityError } = await db.from('reports')
    .select('id,version_number,report_reference').eq('assessment_id', order.assessmentId).eq('report_type', reportType);
  if (identityError) throw identityError;
  if ((identityRows ?? []).some((r: any) => r.report_reference === reportReference || Number(r.version_number) === input.versionNumber)) {
    throw helpers.makeError('report_identity_conflict', 'The report version for this assessment is already in use. Refresh the order and start generation again.', 409);
  }
  const { data: template, error: templateError } = await db.from('report_templates')
    .select('id,template_code,version_number').eq('report_type', reportType).eq('status', 'active')
    .order('version_number', { ascending: false }).limit(1).maybeSingle();
  if (templateError || !template) throw helpers.makeError('template_missing', 'No active report template is configured for this product.', 409);

  input.stage('revised_manuscript');
  let artefacts: Awaited<ReturnType<typeof produceRevisedArtefacts>>;
  try {
    artefacts = await produceRevisedArtefacts({
      order, reportReference, versionNumber: input.versionNumber, writer: input.writer, replay: input.replay, layout: input.layout,
      deadlineAt: startedAt + REVISED_TIME_BUDGET.totalMs, clock: input.now, history, accounting,
      // "Create New Version" is written afresh; generate and retry resume from the latest current checkpoint.
      resumeMode: attemptRow.trigger_source === 'admin_regenerate' ? 'fresh' : 'resume',
      checkpoint: (cp) => recordCheckpoint(db, scope, cp).then(() => undefined)
    });
  } catch (error) {
    // A rejected manuscript is kept only in the review store's failed-run record (database, service role only), for
    // diagnosis; it never reaches the attempt row, storage or any customer surface.
    // Calls are counted in the ledger, not here; `calls` in the diagnostics is informational.
    const { rejectedManuscript, ...safeDiagnostics } = (error instanceof RevisedGenerationError ? error.diagnostics : {}) as Record<string, unknown>;
    const diagnostics = error instanceof RevisedGenerationError
      ? { schemaVersion: 'revised-failure-diagnostics-v2', code: error.code, operatorGuidance: REVISED_OPERATOR_GUIDANCE[error.code], ...safeDiagnostics }
      : { schemaVersion: 'revised-failure-diagnostics-v2', code: 'unknown', error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' };
    input.track({ failureDiagnostics: diagnostics });
    // Order-scoped attempts cannot carry diagnostics: the diagnostics RPC accepts assessment-scoped attempts only and
    // the service role may not update the attempt row (least-privilege contract). The safe diagnostics are recorded
    // durably in the review store's report run instead (see recordReviewRun below).
    await helpers.recordDiagnostics({
      requestedProvider: 'vercel-ai-gateway', requestedModel: (diagnostics as any).requestedModel ?? null,
      resolvedProvider: (diagnostics as any).provider ?? null, resolvedModel: (diagnostics as any).model ?? null,
      generationMode: 'ai', aiUsage: { providerCalls: (diagnostics as any).calls ?? (diagnostics as any).providerCalls ?? 0, usage: (diagnostics as any).usage ?? null },
      failureDiagnostics: diagnostics
    });
    await recordReviewRun(db, order, 'failed', null, `${String((diagnostics as any).code)}: ${JSON.stringify(diagnostics).slice(0, 4000)}${typeof rejectedManuscript === 'string' ? `\n---rejected manuscript---\n${rejectedManuscript.slice(0, 80000)}` : ''}`, input.attemptId);
    if (error instanceof RevisedGenerationError) {
      if (error.code === 'publication_held') await recordOperatorEvent(db, order, 'revised_publication_held', `The revised PDF failed its publication checks and was not stored: ${((diagnostics as any).gates?.required ?? []).filter((g: any) => !g.pass).map((g: any) => g.detail).join('; ')}. Retry recomposes the stored manuscript without an AI call.`, { attemptId: input.attemptId, restrictedTest: true });
      throw helpers.makeError(REASON[error.code], error.message, STATUS[error.code]);
    }
    throw error;
  }
  await helpers.recordDiagnostics({
    requestedProvider: 'vercel-ai-gateway', requestedModel: artefacts.ai.requestedModel,
    resolvedProvider: artefacts.ai.provider, resolvedModel: artefacts.ai.model, generationMode: 'ai',
    aiUsage: { providerCalls: artefacts.ai.calls, usage: artefacts.ai.usage, latencyMs: artefacts.ai.latencyMs, accountingStatus: 'recorded' }
  });

  // Storage and finalisation. The validated manuscript and audit package are already stored, so a failure here is
  // retried by composing them again without an AI call. Storage starts only if the deadline leaves room for it.
  const storeAvailable = startedAt + REVISED_TIME_BUDGET.totalMs - (input.now ?? Date.now)();
  if (storeAvailable < REVISED_TIME_BUDGET.minStoreMs) {
    await recordReviewRun(db, order, 'failed', null, `time_budget_exhausted: ${JSON.stringify({ schemaVersion: 'revised-failure-diagnostics-v2', code: 'time_budget_exhausted', stage: 'store', calls: artefacts.ai.calls, availableMs: Math.max(0, storeAvailable) })}`, input.attemptId);
    throw helpers.makeError('generation_timed_out', REVISED_OPERATOR_GUIDANCE.time_budget_exhausted, 503);
  }
  let completed: any;
  try {
    input.stage('store_pdf');
    helpers.assertValidPdf(artefacts.pdf, input.technicalReference);
    const checksum = crypto.createHash('sha256').update(artefacts.pdf).digest('hex');
    const storageBucket = 'generated-reports';
    const scope = `${order.organisationId}/${order.orderId}/v${input.versionNumber}`;
    const storagePath = `${scope}/${helpers.sanitiseReference(reportReference)}-${checksum.slice(0, 16)}.pdf`;
    const fileName = `${helpers.sanitiseReference(reportReference)}.pdf`;
    input.track({ storageBucket, storagePath, pdfChecksum: checksum });
    const { error: uploadError } = await db.storage.from(storageBucket).upload(storagePath, artefacts.pdf, {
      contentType: 'application/pdf', upsert: false,
      metadata: { sha256: checksum, reportReference, orderId: order.orderId, assessmentId: order.assessmentId, reportVersion: input.versionNumber, restrictedTest: 'true' }
    });
    if (uploadError) throw helpers.makeError('storage_upload_failed', 'The PDF could not be stored in private report storage.', 500);
    input.track({ pdfUploaded: true });
    await helpers.verifyPrivateObject(db, storageBucket, storagePath, checksum, artefacts.pdf.length, 'application/pdf', '%PDF');

    let register: { storagePath: string; fileName: string; mimeType: string; fileSizeBytes: number; checksumSha256: string } | null = null;
    if (isComprehensive) {
      input.stage('store_supporting_register');
      const wb = artefacts.workbook!;
      const registerPath = `${scope}/${wb.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}`;
      input.track({ registerStoragePath: registerPath });
      const { error: wbError } = await db.storage.from(storageBucket).upload(registerPath, wb.bytes, { contentType: wb.mimeType, upsert: false, metadata: { sha256: wb.sha256 } });
      if (wbError) throw new Error('supporting_register_upload_failed');
      input.track({ registerUploaded: true });
      await helpers.verifyPrivateObject(db, storageBucket, registerPath, wb.sha256, wb.bytes.length);
      register = { storagePath: registerPath, fileName: wb.fileName, mimeType: wb.mimeType, fileSizeBytes: wb.bytes.length, checksumSha256: wb.sha256 };
    }

    input.stage('finalise_generation');
    input.track({ finalisationInvoked: true });
    const common = {
      p_attempt_id: input.attemptId, p_template_id: template.id, p_report_type: reportType, p_storage_bucket: storageBucket,
      p_storage_path: storagePath, p_file_name: fileName, p_mime_type: 'application/pdf', p_file_size_bytes: artefacts.pdf.length, p_checksum: checksum
    };
    const { data: finalised, error: completeError } = isComprehensive
      ? await db.rpc('finalise_manual_report_with_supporting_register', {
        ...common,
        p_register_storage_path: register!.storagePath, p_register_file_name: register!.fileName, p_register_mime_type: register!.mimeType,
        p_register_file_size_bytes: register!.fileSizeBytes, p_register_checksum: register!.checksumSha256
      })
      : await db.rpc('complete_manual_report_generation', common);
    completed = finalised;
    if (completeError || !completed?.report) {
      console.error('revised_generation_persistence_error', { technicalReference: input.technicalReference, message: completeError?.message, code: completeError?.code });
      throw helpers.makeError('report_persistence_failed', 'The verified PDF could not be linked to the order.', 500);
    }
  } catch (error) {
    await recordReviewRun(db, order, 'failed', null, `storage_or_finalisation_failed: ${JSON.stringify({ schemaVersion: 'revised-failure-diagnostics-v2', code: 'storage_or_finalisation_failed', calls: artefacts.ai.calls, resumable: 'compose', error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' })}`, input.attemptId);
    throw error;
  }
  input.track({ finalisationCommitted: true });

  // Link the stored audit package to the committed report. The report is never undone or regenerated for this: if the
  // link cannot be recorded, the package is already stored against this attempt, the order shows it as pending, and
  // the next generation request (or reconcileAudits) links it from the attempt record without an AI call.
  let auditStatus: 'linked' | 'pending_link' = 'linked';
  try {
    await recordCheckpoint(db, scope, { stage: 'linked', reportId: completed.report.id });
  } catch (error) {
    auditStatus = 'pending_link';
    await recordOperatorEvent(db, order, 'revised_audit_link_pending', `Report ${completed.report.report_reference} is committed and its audit package is stored, but the link between them could not be recorded. It is linked automatically on the next generation request for this order, or by running the audit reconciliation; no AI call is needed.`, { attemptId: input.attemptId, reportId: completed.report.id, error: error instanceof Error ? error.message.slice(0, 200) : 'unknown', restrictedTest: true });
  }

  // The shared start function records a neutral "Report generation started" (DR-12, migration 20261114170000). This
  // event says how the revised report was actually written: which models, how many AI calls, and any resumed work.
  await recordOperatorEvent(db, order, 'revised_report_generated', revisedGenerationNote(artefacts.ai, order, (artefacts.provenance as any)?.scoring?.percent ?? null),
    { generationMode: 'ai', calls: artefacts.ai.calls, callIds: artefacts.ai.callIds, writerModel: artefacts.ai.models.writer, repairModel: artefacts.ai.repairUsed ? artefacts.ai.models.repair : null, finalModel: artefacts.ai.model, repairUsed: artefacts.ai.repairUsed, resumedFrom: artefacts.ai.resumedFrom ?? null, attemptId: input.attemptId, restrictedTest: true });

  // Report-run lineage in the review store: which bound input produced which report. Recorded after commit, and a
  // failure here never undoes a committed paid report.
  // Lineage only: the authoritative audit package is the validated checkpoint linked above.
  await recordReviewRun(db, order, 'generated', {
    reportId: completed.report.id, reportReference: completed.report.report_reference, reportType, ...artefacts.provenance, auditStatus
  }, null, input.attemptId);

  return {
    attemptId: input.attemptId,
    reportId: completed.report.id as string,
    reportReference: completed.report.report_reference as string,
    versionNumber: Number(completed.report.version_number),
    supersededReportId: completed.superseded_report_id ?? null,
    generationMode: 'ai' as const,
    evidenceChecksum: order.binding.inputDigest,
    auditStatus,
    publicationAdvisories: artefacts.gates.advisory,
    message: auditStatus === 'linked'
      ? `Report version ${completed.report.version_number} generated and stored (restricted test). It passed the publication checks; it is not released or delivered.`
      : `Report version ${completed.report.version_number} generated and stored (restricted test). Its audit link is pending and will be recorded without an AI call; it is not released or delivered.`
  };
}

/** Attempt failure reasons and HTTP statuses: 409 means do not retry; 503 means retry once the store is available. */
const REASON: Record<RevisedGenerationError['code'], string> = {
  answers_changed_since_binding: 'generation_failed', provider_failed: 'generation_failed', provider_timeout: 'generation_timed_out', time_budget_exhausted: 'generation_timed_out',
  manuscript_rejected: 'generation_failed', render_failed: 'pdf_render_failed', publication_held: 'pdf_publication_held', call_ceiling_reached: 'generation_call_ceiling_reached',
  campaign_budget_missing: 'generation_budget_missing', campaign_budget_exhausted: 'generation_budget_exhausted', cost_not_bounded: 'generation_cost_not_bounded',
  accounting_unavailable: 'generation_accounting_unavailable', history_unavailable: 'generation_history_unavailable', audit_unavailable: 'generation_audit_unavailable',
  score_not_computable: 'generation_score_not_computable', coverage_insufficient: 'generation_coverage_insufficient'
};
const STATUS: Record<RevisedGenerationError['code'], number> = {
  answers_changed_since_binding: 409, provider_failed: 502, provider_timeout: 504, time_budget_exhausted: 503, manuscript_rejected: 502, render_failed: 502, publication_held: 502,
  call_ceiling_reached: 409, campaign_budget_missing: 409, campaign_budget_exhausted: 409, cost_not_bounded: 409, accounting_unavailable: 503, history_unavailable: 503, audit_unavailable: 503, score_not_computable: 409, coverage_insufficient: 409
};

/**
 * The operator's account of how a revised report was written: the writer model and, separately, the repair model when a
 * repair was used, the AI calls made by this attempt, and a resumed attempt's starting point (staging certification,
 * 14 November 2026, defect 5: the earlier note named the last model used as the writer).
 */
export function revisedGenerationNote(ai: { models: { writer: string; repair: string }; calls: number; repairUsed: boolean; resumedFrom: 'repair' | 'compose' | null }, order: { binding: { engineBuild: string; outstandingTotal: number } }, scorePercent: number | null = null): string {
  const how = ai.resumedFrom === 'compose'
    ? 'composed from the validated manuscript stored by an earlier attempt, with no AI call in this attempt'
    : ai.resumedFrom === 'repair'
      ? `repaired by ${ai.models.repair} from the draft stored by an earlier attempt (${ai.calls} AI call${ai.calls === 1 ? '' : 's'} in this attempt)`
      : ai.repairUsed
        ? `written by ${ai.models.writer} and repaired by ${ai.models.repair} (${ai.calls} AI calls)`
        : `written by ${ai.models.writer} (${ai.calls} AI call${ai.calls === 1 ? '' : 's'})`;
  return `Revised report (restricted test) ${how}; validated against the report checks and the publication gates; method ${order.binding.engineBuild === '1.6' ? 'MK-READINESS-REVIEW-1.6 (draft, not approved)' : order.binding.engineBuild}; ${scorePercent === null ? 'no score issued' : `MK Fraud Readiness score ${scorePercent}%, no readiness label`}; ${order.binding.outstandingTotal} items outstanding at submission. Not released or delivered: an operator decides.`;
}

/** An operator-facing order event; a failure to record it never affects the report. */
async function recordOperatorEvent(db: any, order: RevisedOrderContext, eventType: string, note: string, metadata: Record<string, unknown>) {
  try {
    const { error } = await db.from('order_events').insert({ order_id: order.orderId, event_type: eventType, note: note.slice(0, 900), metadata_json: metadata });
    if (error) console.warn('revised_operator_event_not_recorded', { message: error.message });
  } catch (error) {
    console.warn('revised_operator_event_not_recorded', { message: error instanceof Error ? error.message : 'unknown' });
  }
}

async function recordReviewRun(db: any, order: RevisedOrderContext, status: 'generated' | 'failed', output: Record<string, unknown> | null, failure: string | null, attemptId: string) {
  try {
    const body = output ? { ...output, attemptId } : null;
    const { error } = await db.rpc('review_record_report_run', {
      p_run: {
        sessionId: order.binding.sessionId, inputContract: 'mk-readiness-report-input', inputVersion: '1.3.0',
        inputDigest: order.binding.inputDigest, logDigest: order.binding.logDigest, actionCount: order.binding.actionCount,
        reportEngine: `revised-live:${order.product}`, reportEngineVersion: REVISED_LIVE_PIPELINE_VERSION, status,
        output: body, outputDigest: body ? crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex') : null,
        failure: failure ? `${failure} (attempt ${attemptId})` : null, createdBy: `order:${order.orderReference}`
      }
    });
    if (error) console.warn('revised_report_run_not_recorded', { message: error.message });
  } catch (error) {
    console.warn('revised_report_run_not_recorded', { message: error instanceof Error ? error.message : 'unknown' });
  }
}
