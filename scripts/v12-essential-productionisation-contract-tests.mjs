import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';

const read = (file) => fs.readFile(file, 'utf8');
const migrationPath = 'supabase/migrations/20260826114407_v12_essential_assessment_admin_generation.sql';
const migration = await read(migrationPath);
const generation = await read('src/lib/reports/phase1-manual-fulfilment.ts');
const directGenerationRoute = await read('src/app/score/api/admin/assessments/[assessmentRef]/generate-essential-report/route.ts');
const directDownloadRoute = await read('src/app/score/api/admin/assessments/[assessmentRef]/reports/[reportId]/download/route.ts');
const legacySubmit = await read('src/app/score/api/assessments/[assessmentRef]/submit/route.ts');
const adaptiveSubmit = await read('src/app/score/api/adaptive/[assessmentRef]/submit/route.ts');
const respondentSave = await read('src/lib/respondent/assessment-save.ts');
const stalledRoute = await read('src/app/score/api/internal/adaptive-stalled-leads/route.ts');
const adaptiveServer = await read('src/lib/adaptive/server.ts');
const productCatalogue = await read('src/lib/commercial/product-catalogue.ts');
const reportTemplate = await read('src/lib/reports/templates/report-template.ts');
const privateAccess = await read('src/lib/reports/private-report-access.ts');
const assessmentAccess = await read('src/lib/reports/assessment-report-access.ts');
const vercel = await read('vercel.json');
const vercelConfig = JSON.parse(vercel);

assert.match(migration, /alter column order_id drop not null/);
assert.match(migration, /alter column assessment_id set not null/);
assert.match(migration, /manual_report_generation_one_active_assessment_uidx/);
assert.match(migration, /assessment_admin_generate/);
assert.match(migration, /assessment_admin_retry/);
assert.match(migration, /assessment_admin_regenerate/);
assert.match(migration, /claim_assessment_manual_report_generation/);
assert.match(migration, /complete_assessment_manual_report_generation/);
assert.match(migration, /storage_status, storage_verified_at/);
assert.match(migration, /'generated-reports'/);
assert.match(migration, /v_assessment\.organisation_id::text \|\| '\/' \|\| v_assessment\.id::text/);
assert.match(migration, /v_reference := 'RPT-' \|\| replace\(v_assessment\.assessment_reference, '-COMP-', '-ESS-'\)/);
assert.match(migration, /v_expected_storage_path/);
assert.match(migration, /p_storage_path <> v_expected_storage_path/);
assert.match(migration, /p_file_name <> v_expected_file_name/);
assert.match(migration, /'order_id', null/);

for (const directFunction of [
  'claim_assessment_manual_report_generation',
  'start_assessment_manual_report_generation',
  'fail_assessment_manual_report_generation',
  'complete_assessment_manual_report_generation'
]) {
  const start = migration.indexOf(`create or replace function public.${directFunction}`);
  assert.notEqual(start, -1, `${directFunction} is missing`);
  const end = migration.indexOf('$$;', start);
  assert.notEqual(end, -1, `${directFunction} has no body terminator`);
  assert.doesNotMatch(migration.slice(start, end), /order_events/,
    `${directFunction} must not manufacture order events for the direct assessment path`);
}

assert.match(directGenerationRoute, /getAdminSession/);
assert.match(directDownloadRoute, /getAdminSession/);
assert.doesNotMatch(directGenerationRoute, /getAuthenticatedAdminSession/);
assert.doesNotMatch(directDownloadRoute, /getAuthenticatedAdminSession/);
assert.match(directGenerationRoute, /platform_admin[\s\S]*reviewer[\s\S]*approver/);
assert.match(directGenerationRoute, /assessment_admin_generate/);
assert.match(directGenerationRoute, /x-idempotency-key/);
assert.doesNotMatch(directGenerationRoute, /Vhutshilo|synthetic order|payment.*eligib/i);
assert.match(directDownloadRoute, /createSecureAssessmentAdminReportAccess/);
assert.match(directDownloadRoute, /read_only_admin/);
assert.doesNotMatch(directDownloadRoute, /generateManualPhase1Report|sendEmail|customer.*token/i);

assert.match(generation, /assembleReportData/);
assert.match(generation, /buildAdvisoryEvidenceModel/);
assert.match(generation, /buildEssentialProjection/);
assert.match(generation, /buildEssentialNarrativeFactPack/);
assert.match(generation, /composeEssentialManuscript/);
assert.match(generation, /providerCallBudget: 1/);
assert.match(generation, /renderValidatedCommercialPdf/);
assert.match(generation, /verifyPrivateObject/);
assert.match(generation, /storageScopeId = assembled\.orderId \?\? assembled\.assessmentId/);
assert.match(generation, /complete_assessment_manual_report_generation/);
assert.match(generation, /assertDeterministicAssessmentEvidence/);
assert.match(generation, /reportType = assessmentScoped\s*\?\s*'essential_self_assessment'/);
assert.match(generation, /assembled\.orderId!/, 'Comprehensive legacy register remains explicitly order-bound');

assert.match(legacySubmit, /loadFreeSnapshotByReference/);
assert(legacySubmit.indexOf('loadFreeSnapshotByReference') < legacySubmit.indexOf('notifyScoredAssessmentCompletion'));
assert.match(adaptiveSubmit, /loadFreeSnapshotByReference/);
assert(adaptiveSubmit.indexOf('loadFreeSnapshotByReference') < adaptiveSubmit.indexOf('notifyScoredAssessmentCompletion'));
assert.doesNotMatch(respondentSave, /queueInternalNotification/);
assert.match(stalledRoute, /MK_STALLED_LEAD_CRON_SECRET/);
assert.doesNotMatch(stalledRoute, /process\.env\.CRON_SECRET/);
assert.match(stalledRoute, /monitorAdaptiveStalledLeads/);
assert.equal(
  Array.isArray(vercelConfig.crons) ? vercelConfig.crons.length : 0,
  0,
  'stalled-lead monitoring is not scheduled by Vercel'
);
assert.doesNotMatch(vercel, /fulfilment-worker/);

assert.match(adaptiveServer, /configuredSupabaseProjectRef/);
assert.match(adaptiveServer, /adaptive_activation_policies/);
assert.match(adaptiveServer, /data\.supabase_project !== runtime\.projectRef/);
assert.match(adaptiveServer, /data\.environment !== runtime\.environment/);
assert.match(adaptiveServer, /data\.graph_fingerprint !== activation\.graph_fingerprint/);
assert.match(adaptiveServer, /assertGraphIdentity/);
assert.match(adaptiveServer, /assertAdaptiveRuntimeEnvironment/);
assert.match(adaptiveServer, /VERCEL_GIT_COMMIT_SHA/);
assert.doesNotMatch(adaptiveServer, /PREVIEW_STAGING_PROJECT_REF|PREVIEW_ADAPTIVE_GRAPH_VERSION|PREVIEW_ADAPTIVE_GRAPH_FINGERPRINT/);
assert.doesNotMatch(adaptiveServer, /iszihmmbgsfefawqmnwo|penhenkzfrtmcxklodtu/);

assert.match(productCatalogue, /professionally prepared PDF report/);
assert.match(reportTemplate, /essentialPdfOnly/);
assert.match(reportTemplate, /supportingRegisterReference\s*=\s*essentialPdfOnly\s*\?\s*'this PDF'/);
assert.match(privateAccess, /readVerifiedPrivatePdf/);
assert.match(privateAccess, /checksum/);
assert.match(privateAccess, /fileSizeBytes/);
assert.match(assessmentAccess, /report\.assessment_id !== assessment\.id/);
assert.match(assessmentAccess, /report\.order_id \?\? assessment\.id/);
assert.doesNotMatch(assessmentAccess, /sendEmail|generateManualPhase1Report|assessment_tokens/);

const {
  readVerifiedPrivatePdf,
  recordPrivateReportAccessEvidence,
  PrivateReportStorageError
} = await import('../src/lib/reports/private-report-access.ts');
const { buildAssessmentCompletedInternalMessage, buildAssessmentStalledLeadMessage } =
  await import('../src/lib/notifications/message-templates.ts');
const { queueInternalNotification } = await import('../src/lib/notifications/internal-notifications.ts');
const { dispatchInternalAssessmentNotification } =
  await import('../src/lib/notifications/internal-assessment-notifications.ts');
const {
  notifyScoredAssessmentCompletion,
  monitorAdaptiveStalledLeads
} = await import('../src/lib/notifications/internal-assessment-notifications.ts');
const { generateManualPhase1Report, Phase1GenerationError } =
  await import('../src/lib/reports/phase1-manual-fulfilment.ts');
const { buildBlueprintMarkdownSkeleton } =
  await import('../src/lib/reports/narrative/blueprint-text.ts');
const { syntheticOrgFixture } =
  await import('../src/lib/reports/evidence-model/__fixtures__/synthetic-org-fixture.ts');

const pdf = Buffer.from('%PDF-1.7\nprovider-free V1.2 contract test');
const checksum = crypto.createHash('sha256').update(pdf).digest('hex');
const reportBase = {
  id: '00000000-0000-4000-8000-000000000001',
  assessment_id: '00000000-0000-4000-8000-000000000002',
  order_id: null,
  report_reference: 'RPT-MK-ESS-TEST-V1',
  storage_bucket: 'generated-reports',
  storage_path: 'org/00000000-0000-4000-8000-000000000002/v1/RPT-MK-ESS-TEST-V1-aabbccddeeff0011.pdf',
  storage_status: 'VERIFIED',
  checksum,
  file_size_bytes: pdf.length,
  file_name: 'RPT-MK-ESS-TEST-V1.pdf',
  mime_type: 'application/pdf'
};

function storageDb(bytes = pdf, type = 'application/pdf') {
  return {
    storage: {
      from() {
        return {
          async download() {
            return { data: new Blob([bytes], { type }), error: null };
          }
        };
      }
    }
  };
}

const verified = await readVerifiedPrivatePdf(
  storageDb(), reportBase, 'org/00000000-0000-4000-8000-000000000002/v1/'
);
assert.equal(verified.checksum, checksum);
assert.equal(verified.fileSizeBytes, pdf.length);
await assert.rejects(
  readVerifiedPrivatePdf(
    storageDb(Buffer.from('%PDF-1.7\nwrong')), reportBase,
    'org/00000000-0000-4000-8000-000000000002/v1/'
  ),
  (error) => error instanceof PrivateReportStorageError && error.reason === 'integrity_failed'
);
await assert.rejects(
  readVerifiedPrivatePdf(
    storageDb(pdf, 'application/octet-stream'), reportBase,
    'org/00000000-0000-4000-8000-000000000002/v1/'
  ),
  (error) => error instanceof PrivateReportStorageError && error.reason === 'integrity_failed'
);

const evidenceWrites = [];
const evidenceDb = {
  from(table) {
    return { insert: async (value) => { evidenceWrites.push({ table, value }); return { error: null }; } };
  }
};
await recordPrivateReportAccessEvidence({
  db: evidenceDb,
  report: reportBase,
  adminId: '00000000-0000-4000-8000-000000000003',
  mode: 'download',
  success: true,
  technicalReference: 'phase14:test:assessment-download'
});
assert.deepEqual(evidenceWrites.map((entry) => entry.table), ['report_events', 'audit_logs']);
assert(!evidenceWrites.some((entry) => entry.table === 'order_events'));

function chain(resultFactory) {
  const query = {
    select() { return query; },
    eq() { return query; },
    is() { return query; },
    in() { return query; },
    lt() { return query; },
    async maybeSingle() { return typeof resultFactory === 'function' ? resultFactory() : resultFactory; },
    then(resolve, reject) {
      try { return Promise.resolve(typeof resultFactory === 'function' ? resultFactory() : resultFactory).then(resolve, reject); }
      catch (error) { return Promise.reject(error).then(resolve, reject); }
    }
  };
  return query;
}

function dispatchDb(initialEvent) {
  const event = { ...initialEvent };
  const updates = [];
  const db = {
    updates,
    from(table) {
      if (table !== 'email_events') throw new Error(`Unexpected table in dispatch test: ${table}`);
      return {
        select() { return chain({ data: { ...event }, error: null }); },
        update(values) {
          return chain(() => {
            Object.assign(event, values);
            updates.push(values);
            return { data: { id: event.id }, error: null };
          });
        }
      };
    }
  };
  return { db, event, updates };
}

process.env.MK_EMAIL_RECIPIENT_ALLOWLIST = 'mk-admin@example.test';
const dispatchEvents = [];
const firstDispatch = dispatchDb({
  id: '00000000-0000-4000-8000-000000000010',
  status: 'queued',
  retry_count: 0,
  sent_at: null,
  provider_message_id: null,
  recipient_email: 'mk-admin@example.test',
  updated_at: new Date().toISOString()
});
let providerCalls = 0;
const sendEmail = async (input) => {
  providerCalls += 1;
  assert.equal(input.to, 'mk-admin@example.test');
  assert.equal(input.idempotencyKey, '00000000-0000-4000-8000-000000000010');
  return { ok: true, mode: 'test', providerMessageId: 'provider-free-message-1' };
};
const dispatchDependencies = {
  db: firstDispatch.db,
  providerModeImpl: () => 'test',
  sendEmailImpl: sendEmail,
  trackAssessmentEventImpl: async (event) => { dispatchEvents.push(event); return { ok: true, status: 'created' }; }
};
const firstResult = await dispatchInternalAssessmentNotification({
  emailEventId: firstDispatch.event.id,
  assessmentId: reportBase.assessment_id,
  organisationId: '00000000-0000-4000-8000-000000000004',
  respondentId: '00000000-0000-4000-8000-000000000005',
  notificationType: 'assessment_completed',
  message: { subject: 'test', text: 'test', html: '<p>test</p>' }
}, dispatchDependencies);
assert.equal(firstResult.status, 'sent');
const replayResult = await dispatchInternalAssessmentNotification({
  emailEventId: firstDispatch.event.id,
  assessmentId: reportBase.assessment_id,
  notificationType: 'assessment_completed',
  message: { subject: 'test', text: 'test', html: '<p>test</p>' }
}, dispatchDependencies);
assert.equal(replayResult.status, 'already_sent');
assert.equal(providerCalls, 1, 'a sent event must be idempotent on replay');
assert(dispatchEvents.some((event) => event.eventType === 'internal_notification_sent'));

const disabledDispatch = dispatchDb({
  id: '00000000-0000-4000-8000-000000000011',
  status: 'queued',
  retry_count: 0,
  sent_at: null,
  provider_message_id: null,
  recipient_email: 'mk-admin@example.test',
  updated_at: new Date().toISOString()
});
const disabledResult = await dispatchInternalAssessmentNotification({
  emailEventId: disabledDispatch.event.id,
  assessmentId: reportBase.assessment_id,
  notificationType: 'assessment_stalled_lead',
  message: { subject: 'test', text: 'test', html: '<p>test</p>' }
}, {
  db: disabledDispatch.db,
  providerModeImpl: () => 'disabled',
  sendEmailImpl: async () => { throw new Error('disabled mode must not call a provider'); },
  trackAssessmentEventImpl: async () => ({ ok: true, status: 'created' })
});
assert.equal(disabledResult.status, 'recorded_disabled');

let queuedEvent = null;
let insertCount = 0;
const queueDb = {
  from(table) {
    assert.equal(table, 'email_events');
    return {
      select() { return chain(() => ({ data: queuedEvent ? { id: queuedEvent.id, status: queuedEvent.status } : null, error: null })); },
      insert(value) {
        insertCount += 1;
        queuedEvent = { id: '00000000-0000-4000-8000-000000000012', status: value.status };
        return {
          select() { return { single: async () => ({ data: { id: queuedEvent.id }, error: null }) }; }
        };
      }
    };
  }
};
const queueInput = {
  notificationType: 'assessment_completed',
  assessmentId: reportBase.assessment_id,
  recipientEmail: 'mk-admin@example.test',
  dedupeKey: 'assessment_completed_scored:00000000-0000-4000-8000-000000000002'
};
const queueTrackEvents = [];
const queuedOnce = await queueInternalNotification(queueInput, {
  db: queueDb,
  trackAssessmentEventImpl: async (event) => { queueTrackEvents.push(event); return { ok: true, status: 'created' }; }
});
const queuedTwice = await queueInternalNotification(queueInput, {
  db: queueDb,
  trackAssessmentEventImpl: async (event) => { queueTrackEvents.push(event); return { ok: true, status: 'created' }; }
});
assert.equal(queuedOnce.status, 'queued');
assert.equal(queuedTwice.status, 'already_queued');
assert.equal(insertCount, 1, 'the completion notification dedupe key must create one email event');
assert.equal(queueTrackEvents.length, 2);

// Provider-free completion/stalled-lead lifecycle coverage. The fake models the same conditional
// email-event claim and the same assessment/navigation reads used by production; it deliberately
// throws if an order-event table is touched by either assessment-only notification path.
function createNotificationLifecycleDb() {
  const state = {
    setting: { setting_key: 'v12_adaptive_stalled_lead_controls', value_json: { enabled: true, inactivity_hours: 24 } },
    assessments: [
      {
        id: '00000000-0000-4000-8000-000000000020',
        assessment_reference: 'MK-COMP-NOTIFY',
        assessment_mode: 'adaptive',
        organisation_id: '00000000-0000-4000-8000-000000000021',
        primary_respondent_id: '00000000-0000-4000-8000-000000000022',
        status: 'scored',
        submitted_at: '2026-08-26T09:00:00.000Z',
        locked_at: '2026-08-26T09:00:01.000Z',
        current_score_run_id: '00000000-0000-4000-8000-000000000023',
        started_at: '2026-08-26T08:00:00.000Z',
        updated_at: '2026-08-26T09:00:01.000Z',
        completion_percentage: 100,
        organisations: { legal_name: 'Notification Test Organisation', trading_name: null },
        respondents: { full_name: 'Notification Respondent', email: 'respondent@example.test' }
      },
      {
        id: '00000000-0000-4000-8000-000000000024',
        assessment_reference: 'MK-STALL-NOTIFY',
        assessment_mode: 'adaptive',
        organisation_id: '00000000-0000-4000-8000-000000000025',
        primary_respondent_id: '00000000-0000-4000-8000-000000000026',
        status: 'draft',
        submitted_at: null,
        locked_at: null,
        current_score_run_id: null,
        started_at: '2026-08-20T08:00:00.000Z',
        updated_at: '2026-08-20T08:30:00.000Z',
        completion_percentage: 40,
        organisations: { legal_name: 'Stalled Organisation', trading_name: null },
        respondents: { full_name: 'Stalled Respondent', email: 'stalled@example.test' }
      },
      {
        id: '00000000-0000-4000-8000-000000000027',
        assessment_reference: 'MK-RECENT-NOTIFY',
        assessment_mode: 'adaptive',
        organisation_id: '00000000-0000-4000-8000-000000000028',
        primary_respondent_id: '00000000-0000-4000-8000-000000000029',
        status: 'draft',
        submitted_at: null,
        locked_at: null,
        current_score_run_id: null,
        started_at: '2026-08-26T09:30:00.000Z',
        updated_at: '2026-08-26T09:45:00.000Z',
        completion_percentage: 70,
        organisations: { legal_name: 'Recent Organisation', trading_name: null },
        respondents: { full_name: 'Recent Respondent', email: 'recent@example.test' }
      }
    ],
    navigationStates: [
      { assessment_id: '00000000-0000-4000-8000-000000000024', last_saved_at: '2026-08-20T08:45:00.000Z', updated_at: '2026-08-20T08:45:00.000Z' }
    ],
    scoreRuns: [
      { id: '00000000-0000-4000-8000-000000000023', assessment_id: '00000000-0000-4000-8000-000000000020', status: 'completed', locked_at: '2026-08-26T09:00:01.000Z', overall_score: 72, final_maturity: 'Structured' }
    ],
    emailEvents: [],
    rpcCalls: [],
    assessmentUpdateAttempts: 0,
    nextEmailId: 30
  };

  function rowsFor(table) {
    if (table === 'app_settings') return [state.setting];
    if (table === 'assessments') return state.assessments;
    if (table === 'assessment_navigation_states') return state.navigationStates;
    if (table === 'score_runs') return state.scoreRuns;
    if (table === 'email_events') return state.emailEvents;
    throw new Error(`Unexpected notification table: ${table}`);
  }

  function matches(row, filters) {
    return filters.every((filter) => {
      const [kind, field, expected] = filter;
      if (kind === 'eq') {
        if (field.startsWith('metadata_json->>')) {
          return row.metadata_json?.[field.slice('metadata_json->>'.length)] === expected;
        }
        return row[field] === expected;
      }
      if (kind === 'is') return row[field] === expected;
      if (kind === 'in') return expected.includes(row[field]);
      if (kind === 'lt') return row[field] < expected;
      return false;
    });
  }

  function query(table, operation, updateValues = null) {
    const filters = [];
    let maxRows = null;
    const builder = {
      select() { return builder; },
      eq(field, value) { filters.push(['eq', field, value]); return builder; },
      is(field, value) { filters.push(['is', field, value]); return builder; },
      in(field, values) { filters.push(['in', field, values]); return builder; },
      lt(field, value) { filters.push(['lt', field, value]); return builder; },
      limit(value) { maxRows = value; return builder; },
      async maybeSingle() { return execute(true); },
      then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); }
    };
    async function execute(single) {
      const rows = rowsFor(table).filter((row) => matches(row, filters));
      const selected = maxRows === null ? rows : rows.slice(0, maxRows);
      if (operation === 'update') {
        for (const row of selected) Object.assign(row, updateValues);
        if (table === 'assessments') state.assessmentUpdateAttempts += selected.length;
        return { data: single ? (selected[0] ? { id: selected[0].id } : null) : selected, error: null };
      }
      return { data: single ? (selected[0] ?? null) : selected, error: null };
    }
    return builder;
  }

  const db = {
    from(table) {
      if (table === 'order_events') throw new Error('assessment-only notification must not write order_events');
      return {
        select() { return query(table, 'select'); },
        update(values) { return query(table, 'update', values); },
        insert(value) {
          if (table !== 'email_events') throw new Error(`Unexpected notification insert: ${table}`);
          if (state.emailEvents.some((existing) => existing.dedupe_key && existing.dedupe_key === value.dedupe_key)) {
            return {
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { message: 'duplicate email event dedupe key' }
                })
              })
            };
          }
          const event = {
            ...value,
            id: `00000000-0000-4000-8000-${String(state.nextEmailId++).padStart(12, '0')}`,
            retry_count: 0,
            sent_at: null,
            provider_message_id: null,
            updated_at: '2026-08-26T10:00:00.000Z'
          };
          state.emailEvents.push(event);
          return { select: () => ({ single: async () => ({ data: { id: event.id }, error: null }) }) };
        }
      };
    },
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (name !== 'record_assessment_stalled_lead_alert') throw new Error(`Unexpected notification RPC: ${name}`);
      return { data: '00000000-0000-4000-8000-000000000099', error: null };
    }
  };
  return { db, state };
}

process.env.MK_INTERNAL_LEADS_EMAIL = 'mk-admin@example.test';
const notificationLifecycle = createNotificationLifecycleDb();
const sentNotificationPayloads = [];
let notificationProviderCalls = 0;
const notificationDependencies = {
  db: notificationLifecycle.db,
  now: () => new Date('2026-08-26T10:00:00.000Z'),
  providerModeImpl: () => 'test',
  sendEmailImpl: async (payload) => {
    notificationProviderCalls += 1;
    sentNotificationPayloads.push(payload);
    assert.equal(payload.to, 'mk-admin@example.test', 'assessment notifications may only target the configured MK mailbox');
    return { ok: true, mode: 'test', providerMessageId: `notification-provider-${notificationProviderCalls}` };
  },
  trackAssessmentEventImpl: async () => ({ ok: true, status: 'created' })
};

const preScoreNotification = await notifyScoredAssessmentCompletion({
  assessmentReference: 'MK-COMP-NOTIFY',
  scoreRunId: '00000000-0000-4000-8000-000000000023',
  snapshotAvailable: false,
  adminUrl: 'https://mkfraud.co.za/score/admin/assessments/MK-COMP-NOTIFY'
}, notificationDependencies);
assert.equal(preScoreNotification.status, 'snapshot_unavailable');
assert.equal(notificationLifecycle.state.emailEvents.length, 0, 'pre-score paths cannot queue the authoritative completion email');

const completedNotification = await notifyScoredAssessmentCompletion({
  assessmentReference: 'MK-COMP-NOTIFY',
  scoreRunId: '00000000-0000-4000-8000-000000000023',
  snapshotAvailable: true,
  adminUrl: 'https://mkfraud.co.za/score/admin/assessments/MK-COMP-NOTIFY'
}, notificationDependencies);
assert.equal(completedNotification.status, 'sent');
assert.equal(notificationProviderCalls, 1);
assert.equal(notificationLifecycle.state.emailEvents.length, 1);
assert.equal(notificationLifecycle.state.emailEvents[0].order_id, null);
assert.match(sentNotificationPayloads[0].text, /respondent@example\.test/);
assert.match(sentNotificationPayloads[0].text, /Structured/);

const completionReplay = await notifyScoredAssessmentCompletion({
  assessmentReference: 'MK-COMP-NOTIFY',
  scoreRunId: '00000000-0000-4000-8000-000000000023',
  snapshotAvailable: true,
  adminUrl: 'https://mkfraud.co.za/score/admin/assessments/MK-COMP-NOTIFY'
}, notificationDependencies);
assert.equal(completionReplay.status, 'already_sent');
assert.equal(notificationProviderCalls, 1, 'completion replay must not send a second internal email');

notificationLifecycle.state.scoreRuns[0].locked_at = null;
const unlockedNotification = await notifyScoredAssessmentCompletion({
  assessmentReference: 'MK-COMP-NOTIFY',
  scoreRunId: '00000000-0000-4000-8000-000000000023',
  snapshotAvailable: true,
  adminUrl: 'https://mkfraud.co.za/score/admin/assessments/MK-COMP-NOTIFY'
}, notificationDependencies);
assert.equal(unlockedNotification.status, 'score_run_not_locked');
assert.equal(notificationProviderCalls, 1, 'an unlocked score cannot trigger completion dispatch');
notificationLifecycle.state.scoreRuns[0].locked_at = '2026-08-26T09:00:01.000Z';

const stalledFirst = await monitorAdaptiveStalledLeads({
  adminUrlFor: (reference) => `https://mkfraud.co.za/score/admin/assessments/${reference}`
}, notificationDependencies);
assert.equal(stalledFirst.stalled, 1, 'only the inactive draft adaptive assessment is a stalled lead');
assert.equal(stalledFirst.inactivityHours, 24);
assert.equal(stalledFirst.notified, 1);
assert.equal(notificationProviderCalls, 2);
assert.equal(notificationLifecycle.state.emailEvents.length, 2);
assert.equal(notificationLifecycle.state.assessments.find((row) => row.assessment_reference === 'MK-STALL-NOTIFY').status, 'draft');
assert.equal(notificationLifecycle.state.assessmentUpdateAttempts, 0, 'stalled monitoring must not mutate assessment status');
assert.equal(notificationLifecycle.state.rpcCalls.length, 1);

const stalledReplay = await monitorAdaptiveStalledLeads({
  adminUrlFor: (reference) => `https://mkfraud.co.za/score/admin/assessments/${reference}`
}, notificationDependencies);
assert.equal(stalledReplay.stalled, 1);
assert.equal(notificationLifecycle.state.emailEvents.length, 2, 'the same threshold episode must dedupe to one email event');
assert.equal(notificationProviderCalls, 2, 'stalled-lead replay must not send a second email');
assert.equal(notificationLifecycle.state.rpcCalls.length, 2, 'the alert RPC remains idempotent for the episode');

// A previously stored threshold-bearing key must still resolve by its immutable activity
// timestamp when the operator changes the eligibility threshold. The old key is retained for
// the operational-alert upsert, but it must not cause another queue row or provider call.
const stalledEvent = notificationLifecycle.state.emailEvents.find((event) =>
  event.notification_type === 'assessment_stalled_lead'
);
const stalledLastActivityAt = stalledEvent.metadata_json.last_activity_at;
const historicalThresholdKey = `assessment_stalled:${stalledEvent.assessment_id}:threshold:24:last_activity:${stalledLastActivityAt}`;
stalledEvent.dedupe_key = historicalThresholdKey;
notificationLifecycle.state.setting.value_json.inactivity_hours = 76;
const thresholdChangedReplay = await monitorAdaptiveStalledLeads({
  adminUrlFor: (reference) => `https://mkfraud.co.za/score/admin/assessments/${reference}`
}, notificationDependencies);
assert.equal(thresholdChangedReplay.stalled, 1);
assert.equal(thresholdChangedReplay.inactivityHours, 76);
assert.equal(notificationLifecycle.state.emailEvents.length, 2, 'a threshold change must not create a second activity episode');
assert.equal(notificationProviderCalls, 2, 'a provider-bound historical episode must not be resent after a threshold change');
assert.equal(notificationLifecycle.state.rpcCalls.at(-1).args.p_alert_key, historicalThresholdKey,
  'historical alert identity is reused when the matching event is found');
assert.equal(notificationLifecycle.state.rpcCalls.at(-1).args.p_email_event_id, stalledEvent.id);
assert.doesNotMatch(stalledEvent.dedupe_key, /threshold:76/);
notificationLifecycle.state.setting.value_json.inactivity_hours = 24;

// A later authoritative activity timestamp is a new episode even for the same assessment.
notificationLifecycle.state.navigationStates[0].last_saved_at = '2026-08-25T09:00:00.000Z';
notificationLifecycle.state.navigationStates[0].updated_at = '2026-08-25T09:00:00.000Z';
const resumedStall = await monitorAdaptiveStalledLeads({
  adminUrlFor: (reference) => `https://mkfraud.co.za/score/admin/assessments/${reference}`
}, notificationDependencies);
assert.equal(resumedStall.stalled, 1);
assert.equal(notificationLifecycle.state.emailEvents.length, 3, 'a changed last-activity timestamp must create a new episode');
const resumedEvent = notificationLifecycle.state.emailEvents.find((event) =>
  event.notification_type === 'assessment_stalled_lead'
  && event.metadata_json.last_activity_at === '2026-08-25T09:00:00.000Z'
);
assert.ok(resumedEvent, 'the resumed episode must carry the new activity timestamp');
assert.equal(resumedEvent.dedupe_key,
  `assessment_stalled:${resumedEvent.assessment_id}:last_activity:2026-08-25T09:00:00.000Z`);
assert.equal(notificationProviderCalls, 3);

// Recoverable historical rows are reused by id, including rows created while the provider was
// disabled and rows left retryable after a provider failure.
const recoverableFixtures = [
  {
    assessment: {
      id: '00000000-0000-4000-8000-000000000060',
      assessment_reference: 'MK-RECORDED-DISABLED',
      assessment_mode: 'adaptive',
      organisation_id: '00000000-0000-4000-8000-000000000061',
      primary_respondent_id: '00000000-0000-4000-8000-000000000062',
      status: 'draft',
      started_at: '2026-08-24T08:00:00.000Z',
      updated_at: '2026-08-24T08:15:00.000Z',
      completion_percentage: 25,
      organisations: { legal_name: 'Recorded Disabled Organisation', trading_name: null },
      respondents: { full_name: 'Recorded Disabled Respondent', email: 'recorded@example.test' }
    },
    event: {
      id: '00000000-0000-4000-8000-000000000060',
      status: 'recorded_disabled',
      dedupe_key: 'assessment_stalled:recorded-disabled:last_activity:2026-08-24T08:15:00.000Z'
    }
  },
  {
    assessment: {
      id: '00000000-0000-4000-8000-000000000063',
      assessment_reference: 'MK-SEND-FAILED',
      assessment_mode: 'adaptive',
      organisation_id: '00000000-0000-4000-8000-000000000064',
      primary_respondent_id: '00000000-0000-4000-8000-000000000065',
      status: 'draft',
      started_at: '2026-08-24T09:00:00.000Z',
      updated_at: '2026-08-24T09:15:00.000Z',
      completion_percentage: 35,
      organisations: { legal_name: 'Send Failed Organisation', trading_name: null },
      respondents: { full_name: 'Send Failed Respondent', email: 'failed@example.test' }
    },
    event: {
      id: '00000000-0000-4000-8000-000000000063',
      status: 'send_failed',
      dedupe_key: 'assessment_stalled:send-failed:last_activity:2026-08-24T09:15:00.000Z'
    }
  },
  {
    assessment: {
      id: '00000000-0000-4000-8000-000000000066',
      assessment_reference: 'MK-QUEUED',
      assessment_mode: 'adaptive',
      organisation_id: '00000000-0000-4000-8000-000000000067',
      primary_respondent_id: '00000000-0000-4000-8000-000000000068',
      status: 'draft',
      started_at: '2026-08-24T10:00:00.000Z',
      updated_at: '2026-08-24T10:15:00.000Z',
      completion_percentage: 45,
      organisations: { legal_name: 'Queued Organisation', trading_name: null },
      respondents: { full_name: 'Queued Respondent', email: 'queued@example.test' }
    },
    event: {
      id: '00000000-0000-4000-8000-000000000066',
      status: 'queued',
      dedupe_key: 'assessment_stalled:queued:last_activity:2026-08-24T10:15:00.000Z'
    }
  },
  {
    assessment: {
      id: '00000000-0000-4000-8000-000000000069',
      assessment_reference: 'MK-STALE-SENDING',
      assessment_mode: 'adaptive',
      organisation_id: '00000000-0000-4000-8000-000000000070',
      primary_respondent_id: '00000000-0000-4000-8000-000000000071',
      status: 'draft',
      started_at: '2026-08-24T11:00:00.000Z',
      updated_at: '2026-08-24T11:15:00.000Z',
      completion_percentage: 55,
      organisations: { legal_name: 'Stale Sending Organisation', trading_name: null },
      respondents: { full_name: 'Stale Sending Respondent', email: 'stale@example.test' }
    },
    event: {
      id: '00000000-0000-4000-8000-000000000069',
      status: 'sending',
      updated_at: '2026-08-26T09:00:00.000Z',
      dedupe_key: 'assessment_stalled:stale-sending:last_activity:2026-08-24T11:15:00.000Z'
    }
  }
];
for (const fixture of recoverableFixtures) {
  notificationLifecycle.state.assessments.push(fixture.assessment);
  notificationLifecycle.state.emailEvents.push({
    ...fixture.event,
    assessment_id: fixture.assessment.id,
    order_id: null,
    recipient_email: 'mk-admin@example.test',
    notification_type: 'assessment_stalled_lead',
    retry_count: 0,
    sent_at: null,
    provider_message_id: null,
    updated_at: fixture.event.updated_at ?? '2026-08-26T10:00:00.000Z',
    metadata_json: { last_activity_at: fixture.assessment.updated_at }
  });
}
const recoverableCountBefore = notificationLifecycle.state.emailEvents.length;
const recoverableProviderCallsBefore = notificationProviderCalls;
const recoverableDispatch = await monitorAdaptiveStalledLeads({
  adminUrlFor: (reference) => `https://mkfraud.co.za/score/admin/assessments/${reference}`
}, {
  ...notificationDependencies,
  providerModeImpl: () => 'disabled',
  sendEmailImpl: async () => { throw new Error('disabled recovery must not call the provider'); }
});
assert.equal(notificationLifecycle.state.emailEvents.length, recoverableCountBefore,
  'recoverable historical episodes must not create replacement email rows');
assert.equal(notificationProviderCalls, recoverableProviderCallsBefore,
  'disabled recovery must not call a provider');
for (const fixture of recoverableFixtures) {
  const event = notificationLifecycle.state.emailEvents.find((candidate) => candidate.id === fixture.event.id);
  assert.equal(event.status, 'recorded_disabled', 'a recoverable row remains the authoritative row');
  const alert = notificationLifecycle.state.rpcCalls
    .filter((call) => call.args.p_assessment_id === fixture.assessment.id)
    .at(-1);
  assert.ok(alert, 'the reused event must retain an operational alert record');
  assert.equal(alert.args.p_email_event_id, event.id);
  assert.equal(alert.args.p_alert_key, fixture.event.dedupe_key);
}
assert.equal(recoverableDispatch.inactivityHours, 24);

// The database's unique dedupe index is the final race boundary when two monitor invocations
// resolve a genuinely new activity episode at the same time. One insert wins, the other reuses
// that row, and disabled dispatch remains provider-free for both callers.
const concurrentAssessment = {
  id: '00000000-0000-4000-8000-000000000072',
  assessment_reference: 'MK-CONCURRENT-STALL',
  assessment_mode: 'adaptive',
  organisation_id: '00000000-0000-4000-8000-000000000073',
  primary_respondent_id: '00000000-0000-4000-8000-000000000074',
  status: 'draft',
  started_at: '2026-08-24T12:00:00.000Z',
  updated_at: '2026-08-24T12:15:00.000Z',
  completion_percentage: 65,
  organisations: { legal_name: 'Concurrent Organisation', trading_name: null },
  respondents: { full_name: 'Concurrent Respondent', email: 'concurrent@example.test' }
};
notificationLifecycle.state.assessments.push(concurrentAssessment);
const concurrentEventCountBefore = notificationLifecycle.state.emailEvents.length;
const providerCallsBeforeConcurrentReplay = notificationProviderCalls;
const providerFreeNotificationDependencies = {
  ...notificationDependencies,
  providerModeImpl: () => 'disabled',
  sendEmailImpl: async () => { throw new Error('concurrent provider-free replay must not call the provider'); }
};
const concurrentResults = await Promise.all([
  monitorAdaptiveStalledLeads({
    adminUrlFor: (reference) => `https://mkfraud.co.za/score/admin/assessments/${reference}`
  }, providerFreeNotificationDependencies),
  monitorAdaptiveStalledLeads({
    adminUrlFor: (reference) => `https://mkfraud.co.za/score/admin/assessments/${reference}`
  }, providerFreeNotificationDependencies)
]);
assert.equal(notificationLifecycle.state.emailEvents.length, concurrentEventCountBefore + 1,
  'concurrent monitor invocations must create one new activity episode');
assert.equal(notificationProviderCalls, providerCallsBeforeConcurrentReplay,
  'concurrent disabled monitor invocations must remain provider-free');
const concurrentEvents = notificationLifecycle.state.emailEvents.filter((event) => event.assessment_id === concurrentAssessment.id);
assert.equal(concurrentEvents.length, 1);
assert.equal(concurrentEvents[0].dedupe_key,
  `assessment_stalled:${concurrentAssessment.id}:last_activity:${concurrentAssessment.updated_at}`);
assert.equal(concurrentEvents[0].status, 'recorded_disabled');
assert(concurrentResults.every((result) => result.ok && result.inactivityHours === 24));
const repeatedConcurrent = await monitorAdaptiveStalledLeads({
  adminUrlFor: (reference) => `https://mkfraud.co.za/score/admin/assessments/${reference}`
}, providerFreeNotificationDependencies);
assert.equal(repeatedConcurrent.ok, true);
assert.equal(notificationLifecycle.state.emailEvents.length, concurrentEventCountBefore + 1,
  'a repeated invocation must reuse the same activity episode');
assert.equal(notificationProviderCalls, providerCallsBeforeConcurrentReplay);

// Production-shaped regression: the older sent episode is skipped, E056 reuses its existing
// recorded-disabled row, and the younger 924 episode remains below the 76-hour isolation cutoff.
const productionShape = createNotificationLifecycleDb();
productionShape.state.assessments = [
  {
    id: '00000000-0000-4000-8000-000000000080', assessment_reference: 'MKFRS-2026-66E9D85898',
    assessment_mode: 'adaptive', organisation_id: '00000000-0000-4000-8000-000000000081',
    primary_respondent_id: '00000000-0000-4000-8000-000000000082', status: 'draft',
    started_at: '2026-08-26T08:42:10.516Z', updated_at: '2026-08-26T08:42:10.516Z', completion_percentage: 0,
    organisations: { legal_name: 'STALLED LEAD CERTIFICATION', trading_name: null },
    respondents: { full_name: 'Terminal Lead', email: 'terminal@example.test' }
  },
  {
    id: '00000000-0000-4000-8000-000000000083', assessment_reference: 'MKFRS-2026-E05626D496',
    assessment_mode: 'adaptive', organisation_id: '00000000-0000-4000-8000-000000000084',
    primary_respondent_id: '00000000-0000-4000-8000-000000000085', status: 'draft',
    started_at: '2026-08-27T12:30:35.383Z', updated_at: '2026-08-27T12:30:35.383Z', completion_percentage: 0,
    organisations: { legal_name: 'RC2 SYNTHETIC EMAIL TARGET', trading_name: null },
    respondents: { full_name: 'Recoverable Lead', email: 'recoverable@example.test' }
  },
  {
    id: '00000000-0000-4000-8000-000000000086', assessment_reference: 'MKFRS-2026-924BC16456',
    assessment_mode: 'adaptive', organisation_id: '00000000-0000-4000-8000-000000000087',
    primary_respondent_id: '00000000-0000-4000-8000-000000000088', status: 'draft',
    started_at: '2026-08-27T17:01:25.585Z', updated_at: '2026-08-27T17:01:25.585Z', completion_percentage: 0,
    organisations: { legal_name: 'YOUNGER SYNTHETIC LEAD', trading_name: null },
    respondents: { full_name: 'Younger Lead', email: 'younger@example.test' }
  }
];
productionShape.state.navigationStates = [];
productionShape.state.setting.value_json = { enabled: true, inactivity_hours: 76 };
const productionShapeEvents = [
  {
    id: '00000000-0000-4000-8000-000000000090', assessment_id: '00000000-0000-4000-8000-000000000080',
    status: 'sent', sent_at: '2026-08-26T08:43:00.000Z', provider_message_id: 'provider-terminal-66e9',
    dedupe_key: 'assessment_stalled:00000000-0000-4000-8000-000000000080:threshold:24:last_activity:2026-08-26T08:42:10.516Z',
    metadata_json: { last_activity_at: '2026-08-26T08:42:10.516Z' }
  },
  {
    id: '00000000-0000-4000-8000-000000000091', assessment_id: '00000000-0000-4000-8000-000000000083',
    status: 'recorded_disabled', sent_at: null, provider_message_id: null,
    dedupe_key: 'assessment_stalled:00000000-0000-4000-8000-000000000083:threshold:24:last_activity:2026-08-27T12:30:35.383Z',
    metadata_json: { last_activity_at: '2026-08-27T12:30:35.383Z' }
  },
  {
    id: '00000000-0000-4000-8000-000000000092', assessment_id: '00000000-0000-4000-8000-000000000086',
    status: 'recorded_disabled', sent_at: null, provider_message_id: null,
    dedupe_key: 'assessment_stalled:00000000-0000-4000-8000-000000000086:threshold:24:last_activity:2026-08-27T17:01:25.585Z',
    metadata_json: { last_activity_at: '2026-08-27T17:01:25.585Z' }
  }
].map((event) => ({
  order_id: null, recipient_email: 'mk-admin@example.test', notification_type: 'assessment_stalled_lead',
  retry_count: 0, updated_at: '2026-08-30T20:30:00.000Z', ...event
}));
productionShape.state.emailEvents = productionShapeEvents;
const productionShapeRpcBefore = productionShape.state.rpcCalls.length;
const productionShapeResult = await monitorAdaptiveStalledLeads({
  adminUrlFor: (reference) => `https://mkfraud.co.za/score/admin/assessments/${reference}`
}, {
  ...providerFreeNotificationDependencies,
  db: productionShape.db,
  now: () => new Date('2026-08-30T20:30:00.000Z')
});
assert.equal(productionShapeResult.stalled, 2, 'the 76-hour cutoff must exclude the younger 924 episode');
assert.equal(productionShape.state.emailEvents.length, 3);
assert.equal(productionShape.state.rpcCalls.length, productionShapeRpcBefore + 2);
assert.equal(productionShape.state.emailEvents.find((event) => event.assessment_id === '00000000-0000-4000-8000-000000000080').provider_message_id,
  'provider-terminal-66e9');
assert.equal(productionShape.state.emailEvents.find((event) => event.assessment_id === '00000000-0000-4000-8000-000000000083').status,
  'recorded_disabled');
assert.equal(productionShape.state.rpcCalls.find((call) => call.args.p_assessment_id === '00000000-0000-4000-8000-000000000080').args.p_email_event_id,
  '00000000-0000-4000-8000-000000000090');
assert.equal(productionShape.state.rpcCalls.find((call) => call.args.p_assessment_id === '00000000-0000-4000-8000-000000000083').args.p_email_event_id,
  '00000000-0000-4000-8000-000000000091');
assert.equal(productionShape.state.rpcCalls.find((call) => call.args.p_assessment_id === '00000000-0000-4000-8000-000000000080').args.p_alert_key,
  productionShapeEvents[0].dedupe_key);
assert.equal(productionShape.state.rpcCalls.find((call) => call.args.p_assessment_id === '00000000-0000-4000-8000-000000000083').args.p_alert_key,
  productionShapeEvents[1].dedupe_key);
assert.equal(productionShape.state.rpcCalls.some((call) => call.args.p_assessment_id === '00000000-0000-4000-8000-000000000086'), false);

const resumableEvent = {
  id: '00000000-0000-4000-8000-000000000040',
  assessment_id: '00000000-0000-4000-8000-000000000024',
  order_id: null,
  recipient_email: 'mk-admin@example.test',
  notification_type: 'assessment_stalled_lead',
  dedupe_key: 'resumable-stalled-event',
  status: 'queued',
  retry_count: 0,
  sent_at: null,
  provider_message_id: null,
  updated_at: '2026-08-26T10:00:00.000Z'
};
notificationLifecycle.state.emailEvents.push(resumableEvent);
const providerCallsBeforeResumable = notificationProviderCalls;
const disabledResumable = await dispatchInternalAssessmentNotification({
  emailEventId: resumableEvent.id,
  assessmentId: resumableEvent.assessment_id,
  notificationType: 'assessment_stalled_lead',
  message: { subject: 'resumable', text: 'resumable', html: '<p>resumable</p>' }
}, { ...notificationDependencies, providerModeImpl: () => 'disabled' });
assert.equal(disabledResumable.status, 'recorded_disabled');
assert.equal(notificationProviderCalls, providerCallsBeforeResumable, 'disabled mode must not invoke the provider seam');
const recoveredResumable = await dispatchInternalAssessmentNotification({
  emailEventId: resumableEvent.id,
  assessmentId: resumableEvent.assessment_id,
  notificationType: 'assessment_stalled_lead',
  message: { subject: 'resumable', text: 'resumable', html: '<p>resumable</p>' }
}, notificationDependencies);
assert.equal(recoveredResumable.status, 'sent');
assert.equal(notificationProviderCalls, providerCallsBeforeResumable + 1, 'a recorded-disabled notification remains recoverable when the provider is enabled');

const completionMessage = buildAssessmentCompletedInternalMessage({
  assessmentReference: 'MK-ESS-TEST',
  organisationName: 'Example Organisation',
  respondentName: 'A Respondent',
  respondentEmail: 'respondent@example.test',
  completedAt: '2026-08-26T10:00:00.000Z',
  overallScore: 42,
  finalMaturity: 'Developing',
  adminUrl: 'https://mkfraud.co.za/score/admin/assessments/MK-ESS-TEST'
});
assert.match(completionMessage.text, /MK-ESS-TEST/);
assert.match(completionMessage.text, /respondent@example\.test/);
assert.match(completionMessage.text, /Developing/);
const stalledMessage = buildAssessmentStalledLeadMessage({
  assessmentReference: 'MK-ESS-STALL',
  organisationName: 'Example Organisation',
  respondentName: 'A Respondent',
  respondentEmail: 'respondent@example.test',
  lastActivityAt: '2026-08-25T10:00:00.000Z',
  progressPct: 40,
  adminUrl: 'https://mkfraud.co.za/score/admin/assessments/MK-ESS-STALL'
});
assert.match(stalledMessage.text, /stalled lead/);
assert.match(stalledMessage.text, /40%/);

// Provider-free direct assessment-generation lifecycle coverage. This executes the real
// claim -> start -> evidence assembly -> one-call manuscript -> PDF render seam -> private
// storage readback -> assessment-only completion orchestration. The only boundaries faked here
// are Supabase, the PDF renderer, and the whole-manuscript writer; no provider, email transport,
// payment/order eligibility query, or real storage is touched.
let directRequestCounter = 0;
const directAssessmentId = '00000000-0000-4000-8000-000000000102';
const directOrganisationId = '00000000-0000-4000-8000-000000000103';
const directScoreRunId = '00000000-0000-4000-8000-000000000104';

function directQuery(response) {
  const query = {
    select() { return query; },
    eq() { return query; },
    order() { return query; },
    limit() { return query; },
    async maybeSingle() {
      return typeof response === 'function' ? response() : response;
    },
    then(resolve, reject) {
      try {
        return Promise.resolve(typeof response === 'function' ? response() : response).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    }
  };
  return query;
}

function buildDirectAssembly(overrides = {}) {
  const source = syntheticOrgFixture;
  const traces = source.questionTraces.map((trace) => ({ ...trace }));
  const domainResults = source.domainResults.map((domain, index) => ({
    ...domain,
    weightedContribution: domain.rawScore * (domain.weightPct / 100),
    coveragePct: 100,
    criticalGapCount: index === 7 ? 1 : 0
  }));
  const lockedAt = '2026-08-26T10:00:00.000Z';
  const scoreRun = {
    ...source.scoreRun,
    ...(overrides.scoreRun ?? {}),
    id: directScoreRunId,
    assessmentId: directAssessmentId
  };
  return {
    ...source,
    ...overrides,
    orderId: null,
    orderReference: null,
    orderAssessmentId: directAssessmentId,
    assessmentId: directAssessmentId,
    organisationId: directOrganisationId,
    currentScoreRunId: directScoreRunId,
    orderVerifiedAt: null,
    orderVerifiedBy: null,
    respondentName: 'Provider-Free Direct Tester',
    customerEmail: 'provider-free-respondent@example.test',
    assessmentReference: 'MK-COMP-PROVIDER-FREE',
    reportReference: 'RPT-MK-ESS-PROVIDER-FREE-V1',
    generatedAt: lockedAt,
    packageName: 'Essential Fraud Readiness Report',
    productCode: 'essential_self_assessment',
    orderStatus: null,
    amountCents: null,
    currency: 'ZAR',
    productPriceCents: 750000,
    productCurrency: 'ZAR',
    productId: '00000000-0000-4000-8000-000000000105',
    orderCreatedAt: null,
    productPriceVersionId: null,
    productPriceVersions: [],
    paymentVerification: { status: 'not_required' },
    requiresPaymentVerification: false,
    deliveryMode: 'mk_controlled_pdf',
    productActive: true,
    scoreRun: {
      ...scoreRun,
      status: scoreRun.status ?? 'completed',
      lockedAt: Object.prototype.hasOwnProperty.call(overrides.scoreRun ?? {}, 'lockedAt') ? scoreRun.lockedAt : lockedAt,
      inputHash: Object.prototype.hasOwnProperty.call(overrides.scoreRun ?? {}, 'inputHash') ? scoreRun.inputHash : 'a'.repeat(64)
    },
    domainResults,
    questionTraces: traces,
    expectedDomainResultCount: domainResults.length,
    actualDomainResultCount: domainResults.length,
    expectedQuestionTraceCount: traces.length,
    actualQuestionTraceCount: traces.length,
    adaptiveScope: null,
    adaptiveGatewayAnswers: {},
  };
}

function createProviderFreeWholeWriter() {
  const calls = { write: 0, tail: 0, repair: 0, coherence: 0 };
  const writer = {
    provider: 'test-injected',
    model: 'test-injected-model',
    promptVersion: 'test-injected-prompt',
    async writeManuscript(input) {
      calls.write += 1;
      const skeleton = buildBlueprintMarkdownSkeleton(input.blueprint);
      const markdown = skeleton.headings.map((heading) =>
        `${'#'.repeat(heading.level)} ${heading.title}\n\nThis section records a bounded management implication grounded in the persisted assessment evidence.`
      ).join('\n\n');
      return {
        contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
        architecture: 'whole-manuscript',
        markdown,
        blueprint: input.blueprint,
        writerMetadata: {
          contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
          architecture: 'whole-manuscript',
          provider: 'test-injected',
          model: 'test-injected-model',
          promptVersion: 'test-injected-prompt',
          generationMode: 'test-injected',
          generatedAt: '2026-08-26T10:00:00.000Z',
          inputFactPackSha256: 'b'.repeat(64),
          inputStoryPlanSha256: 'c'.repeat(64),
          inputBlueprintSha256: 'd'.repeat(64),
          recovery: {
            initialGenerationCount: 1,
            targetedRepairCount: 0,
            fullRegenerationCount: 0,
            qualityEscalationCount: 0,
            coherenceCount: 0,
            technicalFallbackCount: 0,
            truncationContinuationCount: 0,
            totalCalls: 1,
            totalTokens: 0,
            totalProviderCostMicros: 0
          }
        }
      };
    },
    async completeTail() { calls.tail += 1; throw new Error('tail completion must not be used by a complete manuscript'); },
    async repairBlock() { calls.repair += 1; throw new Error('targeted repair must not be used by a complete manuscript'); },
    async coherencePass() { calls.coherence += 1; throw new Error('coherence pass must not be used by a complete manuscript'); }
  };
  return { writer, calls };
}

function createDirectGenerationDb(overrides = {}) {
  const calls = { rpc: [], from: [], storageUpload: [], storageDownload: [], storageRemove: [] };
  const pdfBytes = Buffer.from(`%PDF-1.7\n${'0'.repeat(1200)}`);
  const rpcResponses = {
    claim_assessment_manual_report_generation: {
      data: {
        claimed: true,
        generation_started: false,
        attempt: { id: '00000000-0000-4000-8000-000000000106', report_version: 1, request_id: 'direct-request', retry_count: 0, order_id: null }
      },
      error: null
    },
    start_assessment_manual_report_generation: { data: { ok: true }, error: null },
    fail_assessment_manual_report_generation: { data: { ok: true }, error: null },
    complete_assessment_manual_report_generation: {
      data: {
        report: { id: '00000000-0000-4000-8000-000000000107', report_reference: 'RPT-MK-ESS-PROVIDER-FREE-V1', version_number: 1 },
        superseded_report_id: null
      },
      error: null
    },
    ...overrides.rpcResponses
  };
  const storedObjects = new Map();
  const db = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      const response = rpcResponses[name];
      if (!response) throw new Error(`Unexpected provider-free RPC: ${name}`);
      return typeof response === 'function' ? response(args) : response;
    },
    from(table) {
      calls.from.push(table);
      if (table === 'report_templates') {
        return directQuery({ data: { id: '00000000-0000-4000-8000-000000000108', template_code: 'essential-v1', version_number: 1 }, error: null });
      }
      if (table === 'report_content_blocks') return directQuery({ data: [], error: null });
      throw new Error(`Unexpected provider-free table: ${table}`);
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, bytes, opts) {
            calls.storageUpload.push({ bucket, path, bytes: Buffer.from(bytes), opts });
            if (overrides.uploadError) return { error: new Error(overrides.uploadError) };
            storedObjects.set(`${bucket}/${path}`, Buffer.from(bytes));
            return { error: null };
          },
          async download(path) {
            calls.storageDownload.push({ bucket, path });
            if (overrides.downloadError) return { data: null, error: new Error(overrides.downloadError) };
            const bytes = overrides.corruptDownload
              ? Buffer.from('%PDF-1.7\ncorrupt-stored-object')
              : (storedObjects.get(`${bucket}/${path}`) ?? pdfBytes);
            return { data: new Blob([bytes], { type: 'application/pdf' }), error: null };
          },
          async remove(paths) {
            calls.storageRemove.push({ bucket, paths });
            return { error: null };
          }
        };
      }
    }
  };
  return { db, calls, pdfBytes };
}

function providerFreeFlags() {
  return async () => ({
    securityGateSatisfied: false,
    securityGateVersion: null,
    autoFulfilmentEnabled: false,
    aiNarrativeEnabled: false,
    autoEmailEnabled: false,
    manualDeliveryEnabled: false,
    testRecipientOverrideEnabled: false,
    testRecipientOverride: null,
    model: 'test-injected-model',
    promptVersion: 'test-injected-prompt',
    schemaVersion: 'test-injected-schema'
  });
}

async function runDirectGeneration({ data = buildDirectAssembly(), dbOverrides = {}, writerState } = {}) {
  const { db, calls } = createDirectGenerationDb(dbOverrides);
  const state = writerState ?? createProviderFreeWholeWriter();
  let result = null;
  let error = null;
  try {
    result = await generateManualPhase1Report({
      assessmentReference: data.assessmentReference,
      requestedBy: 'admin-direct-test',
      requestKey: `direct-provider-free-${++directRequestCounter}`,
      action: 'assessment_admin_generate'
    }, {
      db,
      assembleReportData: async () => data,
      validatePremiumReportGenerationEntitlement: () => { throw new Error('direct generation must not check order/payment entitlement'); },
      getPhase1SchemaCapability: async () => ({ status: 'available', schemaVersion: 'v12-test', message: null, checks: {} }),
      getPremiumReportAutomationFlags: providerFreeFlags(),
      wholeManuscriptWriter: state.writer,
      renderValidatedCommercialPdf: async () => Buffer.from(`%PDF-1.7\n${'0'.repeat(1200)}`)
    });
  } catch (thrown) {
    error = thrown;
  }
  return { result, error, calls, state };
}

const directSuccess = await runDirectGeneration();
assert.equal(directSuccess.error, null);
assert.equal(directSuccess.result.reportId, '00000000-0000-4000-8000-000000000107');
assert.equal(directSuccess.state.calls.write, 1, 'one direct Generate may spend one whole-manuscript provider call');
assert.equal(directSuccess.state.calls.tail + directSuccess.state.calls.repair + directSuccess.state.calls.coherence, 0);
assert.deepEqual(directSuccess.calls.rpc.map((call) => call.name), [
  'claim_assessment_manual_report_generation',
  'start_assessment_manual_report_generation',
  'complete_assessment_manual_report_generation'
]);
assert.equal(directSuccess.calls.from.includes('orders'), false);
assert.equal(directSuccess.calls.from.includes('payments'), false);
assert.equal(directSuccess.calls.from.includes('order_events'), false);
const directCompletion = directSuccess.calls.rpc.find((call) => call.name === 'complete_assessment_manual_report_generation');
assert.equal(directCompletion.args.p_report_type, 'essential_self_assessment');
assert.equal(directCompletion.args.p_file_name, 'RPT-MK-ESS-PROVIDER-FREE-V1.pdf');
assert.match(directCompletion.args.p_storage_path, new RegExp(`^${directOrganisationId}/${directAssessmentId}/v1/`));
assert.doesNotMatch(directCompletion.args.p_storage_path, /test-order|orders/);
assert.equal(directSuccess.calls.storageUpload.length, 1);
assert.equal(directSuccess.calls.storageDownload.length, 1);
assert.equal(directSuccess.calls.storageRemove.length, 0);

const directIncomplete = await runDirectGeneration({
  dbOverrides: {
    rpcResponses: {
      claim_assessment_manual_report_generation: {
        data: null,
        error: new Error('v12_assessment_incomplete_or_unlocked')
      }
    }
  }
});
assert(directIncomplete.error instanceof Phase1GenerationError);
assert.equal(directIncomplete.error.reason, 'assessment_incomplete');
assert.equal(directIncomplete.calls.rpc.filter((call) => call.name === 'fail_assessment_manual_report_generation').length, 0);
assert.equal(directIncomplete.state.calls.write, 0);
assert.equal(directIncomplete.calls.storageUpload.length, 0);

const directEvidenceIncomplete = await runDirectGeneration({
  data: buildDirectAssembly({ scoreRun: { ...syntheticOrgFixture.scoreRun, id: directScoreRunId, assessmentId: directAssessmentId, status: 'completed', lockedAt: null, inputHash: 'a'.repeat(64) } })
});
assert(directEvidenceIncomplete.error instanceof Phase1GenerationError);
assert.equal(directEvidenceIncomplete.error.reason, 'assessment_incomplete');
assert.equal(directEvidenceIncomplete.state.calls.write, 0);
assert.equal(directEvidenceIncomplete.calls.rpc.filter((call) => call.name === 'fail_assessment_manual_report_generation').length, 1);
assert.equal(directEvidenceIncomplete.calls.storageUpload.length, 0);

const directActive = await runDirectGeneration({
  dbOverrides: {
    rpcResponses: {
      claim_assessment_manual_report_generation: {
        data: { claimed: false, reason: 'already_active' },
        error: null
      }
    }
  }
});
assert(directActive.error instanceof Phase1GenerationError);
assert.equal(directActive.error.reason, 'generation_already_active');
assert.equal(directActive.state.calls.write, 0);
assert.equal(directActive.calls.storageUpload.length, 0);

const directReuse = await runDirectGeneration({
  dbOverrides: {
    rpcResponses: {
      claim_assessment_manual_report_generation: {
        data: {
          claimed: false,
          reason: 'report_exists',
          report: { id: 'existing-direct-report', report_reference: 'RPT-MK-ESS-PROVIDER-FREE-V1', version_number: 1 }
        },
        error: null
      }
    }
  }
});
assert.equal(directReuse.error, null);
assert.equal(directReuse.result.reusedExistingReport, true);
assert.equal(directReuse.result.reportId, 'existing-direct-report');
assert.equal(directReuse.state.calls.write, 0);
assert.equal(directReuse.calls.storageUpload.length, 0);

const directStorageFailure = await runDirectGeneration({ dbOverrides: { corruptDownload: true } });
assert(directStorageFailure.error instanceof Phase1GenerationError);
assert.equal(directStorageFailure.error.reason, 'storage_integrity_failed');
assert.equal(directStorageFailure.result, null);
assert.equal(directStorageFailure.calls.rpc.filter((call) => call.name === 'complete_assessment_manual_report_generation').length, 0);
assert.equal(directStorageFailure.calls.rpc.filter((call) => call.name === 'fail_assessment_manual_report_generation').length, 1);
assert.equal(directStorageFailure.calls.storageUpload.length, 1);
assert.equal(directStorageFailure.calls.storageDownload.length, 1);
assert.equal(directStorageFailure.calls.storageRemove.length, 1);

let concurrentClaimCount = 0;
const concurrentWriterState = createProviderFreeWholeWriter();
const concurrent = await Promise.allSettled([
  runDirectGeneration({ writerState: concurrentWriterState, dbOverrides: {
    rpcResponses: {
      claim_assessment_manual_report_generation: () => {
        concurrentClaimCount += 1;
        return concurrentClaimCount === 1
          ? { data: { claimed: true, generation_started: false, attempt: { id: 'concurrent-attempt', report_version: 1, request_id: 'concurrent', retry_count: 0, order_id: null } }, error: null }
          : { data: { claimed: false, reason: 'already_active' }, error: null };
      }
    }
  } }),
  runDirectGeneration({ writerState: concurrentWriterState, dbOverrides: {
    rpcResponses: {
      claim_assessment_manual_report_generation: () => {
        concurrentClaimCount += 1;
        return concurrentClaimCount === 1
          ? { data: { claimed: true, generation_started: false, attempt: { id: 'concurrent-attempt', report_version: 1, request_id: 'concurrent', retry_count: 0, order_id: null } }, error: null }
          : { data: { claimed: false, reason: 'already_active' }, error: null };
      }
    }
  } })
]);
const concurrentOutcomes = concurrent.map((item) => item.status === 'fulfilled' ? item.value : { error: item.reason });
assert.equal(concurrentClaimCount, 2);
assert.equal(concurrentWriterState.calls.write, 1, 'assessment claim uniqueness must prevent a second simultaneous provider call');
assert.equal(concurrentOutcomes.filter((item) => item.result?.reportId).length, 1);
assert.equal(concurrentOutcomes.filter((item) => item.error?.reason === 'generation_already_active').length, 1);

console.log(JSON.stringify({
  ok: true,
  suite: 'v12-essential-productionisation-provider-free',
  assertions: 162,
  providerCalls: 1,
  queuedEmailEvents: insertCount,
  directAssessmentOrderEvents: 0
}));
