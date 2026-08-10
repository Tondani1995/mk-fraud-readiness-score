import assert from 'node:assert/strict';
import { registerComprehensivePackageAtomically } from '../src/lib/comprehensive/package-registration.ts';
import { buildComprehensiveReviewerInputFromPersisted } from '../src/lib/reports/comprehensive/persisted-review-adapter.ts';
import { comprehensiveFixtures } from '../src/lib/reports/comprehensive/fixtures.ts';
import { buildComprehensiveDeliveryModel } from '../src/lib/reports/comprehensive/contract.ts';

let checks = 0;
const check = async (label, fn) => { await fn(); checks += 1; console.log(`  ok - ${label}`); };

const uuid = (suffix) => `00000000-0000-4000-8000-00000000000${suffix}`;
const upload = (type, extension, index) => ({ objectId: uuid(index), artefactType: type, fileName: `${type}.${extension}`, mimeType: extension === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : extension === 'pptx' ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/pdf', bytes: Buffer.from(`${type}-bytes`), checksum: 'a'.repeat(64), path: `engagement/v1/${uuid(index)}.${extension}` });
const packageInput = (overrides = {}) => ({
  db: makeDb(),
  engagementId: uuid('1'),
  reportId: uuid('2'),
  artifactVersion: 3,
  templateId: uuid('3'),
  primary: { fileName: 'report.pdf', mimeType: 'application/pdf', bytes: Buffer.from('report'), checksum: 'b'.repeat(64), path: `engagement/v3/${uuid('2')}.pdf` },
  uploads: [upload('supporting_register', 'xlsx', '4'), upload('board_readout', 'pdf', '5'), upload('executive_presentation', 'pptx', '6'), upload('workshop_material', 'pdf', '7')],
  generatedBy: uuid('8'),
  ...overrides
});

function makeDb(options = {}) {
  const state = { objects: new Map(), uploadCalls: 0, removed: [], rpcCalls: [], alerts: [], alertArgs: [], metadata: null };
  return {
    state,
    storage: {
      from() {
        return {
          async upload(path, bytes) {
            state.uploadCalls += 1;
            if (options.failUploadAt === state.uploadCalls) return { error: { message: 'injected upload failure' } };
            state.objects.set(path, Buffer.from(bytes));
            return { error: null };
          },
          async remove(paths) {
            state.removed.push([...paths]);
            if (options.failCleanup) return { error: { message: 'injected cleanup failure' } };
            for (const path of paths) state.objects.delete(path);
            return { error: null };
          }
        };
      }
    },
    async rpc(name, args) {
      state.rpcCalls.push(name);
      if (name === 'record_phase14_operational_alert') {
        if (args.p_report_id !== null) return { data: null, error: { message: 'injected orphan alert FK failure' } };
        state.alertArgs.push(args);
        state.alerts.push(args.p_detail_json);
        return { data: { ok: true }, error: null };
      }
      if (options.failRegistration) return { data: null, error: { message: 'injected registration failure' } };
      state.metadata = { report: args.p_report_id, artifactVersion: args.p_artifact_version, artifacts: args.p_secondary };
      return { data: { ok: true, report_id: args.p_report_id, artifact_version: args.p_artifact_version, secondary_count: 4 }, error: null };
    }
  };
}

await check('presentation upload failure removes only objects uploaded by this attempt and commits no metadata', async () => {
  const db = makeDb({ failUploadAt: 4 });
  await assert.rejects(registerComprehensivePackageAtomically(packageInput({ db })));
  assert.deepEqual(db.state.removed[0], [packageInput().primary.path, packageInput().uploads[0].path, packageInput().uploads[1].path]);
  assert.equal(db.state.metadata, null);
  assert.deepEqual(db.state.rpcCalls, []);
});

await check('database registration failure after all uploads removes all five objects and leaves no metadata', async () => {
  const db = makeDb({ failRegistration: true });
  const input = packageInput({ db });
  await assert.rejects(registerComprehensivePackageAtomically(input));
  assert.equal(db.state.removed[0].length, 5);
  assert.equal(db.state.objects.size, 0);
  assert.equal(db.state.metadata, null);
  assert.equal(db.state.alerts.length, 0);
});

await check('cleanup failure raises a safe operational reconciliation alert', async () => {
  const db = makeDb({ failRegistration: true, failCleanup: true });
  const input = packageInput({ db });
  await assert.rejects(registerComprehensivePackageAtomically(input));
  assert.equal(db.state.alerts.length, 1);
  assert.equal(db.state.metadata, null);
  assert.equal(db.state.alertArgs[0].p_report_id, null);
  assert.deepEqual(Object.keys(db.state.alerts[0]).sort(), ['artifact_version', 'bucket', 'cleanup_error', 'engagement_id', 'proposed_report_id', 'reason', 'storage_paths'].sort());
  assert.equal(db.state.alerts[0].proposed_report_id, input.reportId);
  assert.doesNotMatch(JSON.stringify(db.state.alerts[0]), /customer|email|file_name|signedUrl|https?:\/\//i);
});

await check('happy path commits one report and exactly four same-version secondary artefacts', async () => {
  const db = makeDb();
  const input = packageInput({ db });
  const result = await registerComprehensivePackageAtomically(input);
  assert.equal(result.artifactVersion, 3);
  assert.equal(db.state.metadata.artifacts.length, 4);
  assert.ok(db.state.metadata.artifacts.every((item) => item.artefact_type && item.file_size_bytes > 0));
  assert.equal(db.state.rpcCalls.filter((name) => name === 'complete_comprehensive_package').length, 1);
  assert.equal(db.state.alerts.length, 0);
});

const authority = {
  assessmentId: uuid('9'), scoreRunId: uuid('0'),
  findings: [{ subjectKey: 'F-REAL', title: 'Real finding', detail: 'Finding detail', evidenceRefs: ['EVID-REAL'], linkedFindingIds: ['F-REAL'], linkedRiskIds: [] }],
  risks: [{ subjectKey: 'R-REAL', title: 'Real risk', detail: 'Risk detail', evidenceRefs: ['EVID-REAL'], linkedFindingIds: [], linkedRiskIds: ['R-REAL'] }],
  controlDesigns: [{ subjectKey: 'C-REAL', title: 'Real control', detail: 'Control detail', evidenceRefs: ['EVID-REAL'], linkedFindingIds: ['F-REAL'], linkedRiskIds: [] }],
  decisions: [{ subjectKey: 'D-REAL', title: 'Real decision', detail: 'Decision detail', evidenceRefs: ['EVID-REAL'], linkedFindingIds: [], linkedRiskIds: [] }],
  managementActions: [{ subjectKey: 'A-REAL', title: 'Real action', detail: 'Action detail', evidenceRefs: ['EVID-REAL'], linkedFindingIds: [], linkedRiskIds: [] }],
  allEvidenceRefs: ['EVID-REAL']
};
const persistedEvidence = [{ id: uuid('a'), analyticalEvidenceRefs: ['EVID-REAL'], originalFilename: 'evidence.pdf', validationStatus: 'supported', reviewerObservation: 'Reviewed.', reviewedBy: uuid('b'), reviewedAt: '2026-08-10T12:00:00Z' }];
const persistedRecords = [
  { id: uuid('c'), engagementId: uuid('d'), reviewerAdminUserId: uuid('b'), recordType: 'finding', subjectKey: 'F-REAL', reviewerConclusion: 'SUPPORTED', reviewerObservation: 'Reviewed.', evidenceRefs: ['EVID-REAL'], decisionOptions: [], managementAction: { adjustedInterpretation: 'Supported for the reviewed scope.' }, recordVersion: 1, updatedAt: '2026-08-10T12:00:00Z' },
  { id: uuid('e'), engagementId: uuid('d'), reviewerAdminUserId: uuid('b'), recordType: 'risk', subjectKey: 'R-REAL', reviewerConclusion: 'Risk interpretation.', reviewerObservation: 'Reviewed.', evidenceRefs: ['EVID-REAL'], decisionOptions: [], managementAction: {}, recordVersion: 1, updatedAt: '2026-08-10T12:00:00Z' },
  { id: uuid('f'), engagementId: uuid('d'), reviewerAdminUserId: uuid('b'), recordType: 'control_design', subjectKey: 'C-REAL', reviewerConclusion: 'Design assessment.', reviewerObservation: 'Reviewed.', evidenceRefs: ['EVID-REAL'], decisionOptions: [], managementAction: {}, recordVersion: 1, updatedAt: '2026-08-10T12:00:00Z' },
  { id: uuid('0'), engagementId: uuid('d'), reviewerAdminUserId: uuid('b'), recordType: 'decision', subjectKey: 'D-REAL', reviewerConclusion: 'Recommendation.', reviewerObservation: 'Reviewed.', evidenceRefs: ['EVID-REAL'], decisionOptions: ['Option'], managementAction: {}, recordVersion: 1, updatedAt: '2026-08-10T12:00:00Z' },
  { id: uuid('1'), engagementId: uuid('d'), reviewerAdminUserId: uuid('b'), recordType: 'management_action', subjectKey: 'A-REAL', reviewerConclusion: 'Action.', reviewerObservation: 'Reviewed.', evidenceRefs: ['EVID-REAL'], decisionOptions: [], managementAction: { rationale: 'Rationale', owner: 'COO', targetDate: '2026-09-30' }, recordVersion: 1, updatedAt: '2026-08-10T12:00:00Z' }
];
const persistedBase = { id: uuid('d'), reviewerAdminUserId: uuid('b'), reviewerName: 'Reviewer', reviewerRole: 'reviewer', reviewerReviewDate: '2026-08-10', signedOffBy: uuid('b'), signedOffAt: '2026-08-10T12:00:00Z', signOffStatement: 'Signed.', signedOffArtifactVersion: 3 };

await check('real subject accepted and fabricated or cross-assessment subjects fail closed', () => {
  assert.doesNotThrow(() => buildComprehensiveReviewerInputFromPersisted({ engagement: persistedBase, evidence: persistedEvidence, records: persistedRecords, subjectAuthority: authority }));
  assert.throws(() => buildComprehensiveReviewerInputFromPersisted({ engagement: persistedBase, evidence: persistedEvidence, records: [{ ...persistedRecords[0], subjectKey: 'F-FABRICATED' }, ...persistedRecords.slice(1)], subjectAuthority: authority }), /not part of the current assessment/);
  assert.throws(() => buildComprehensiveReviewerInputFromPersisted({ engagement: persistedBase, evidence: persistedEvidence, records: [{ ...persistedRecords[0], subjectKey: 'F-OTHER-ASSESSMENT' }, ...persistedRecords.slice(1)], subjectAuthority: authority }), /not part of the current assessment/);
});

await check('evidence status alone never becomes a finding conclusion', () => {
  const fixture = comprehensiveFixtures.weakOrganisationMeaningfulEvidence;
  const ref = 'evidence:EVID-ACCESS';
  for (const validationStatus of ['VALIDATED_SUPPORTED', 'NOT_SUPPORTED', 'NOT_VALIDATED_INSUFFICIENT', 'NOT_APPLICABLE', 'EVIDENCE_REVIEWED']) {
    const model = buildComprehensiveDeliveryModel(fixture.analytical, { ...fixture.reviewer, findingReviews: [], evidenceReviews: [{ evidenceRef: ref, evidenceExamined: ['reviewed.pdf'], validationStatus, reviewerObservation: 'Observed.', reviewerConfidence: 'MEDIUM' }] });
    assert.equal(model.findings.find((finding) => finding.id === 'F-ACCESS')?.validationStatus, 'EVIDENCE_REVIEWED', validationStatus);
  }
  const selfReported = buildComprehensiveDeliveryModel(fixture.analytical, { ...fixture.reviewer, findingReviews: [], evidenceReviews: [] });
  assert.equal(selfReported.findings.find((finding) => finding.id === 'F-ACCESS')?.validationStatus, 'SELF_REPORTED');
});

console.log(JSON.stringify({ ok: true, checks, provider: 'none', suite: 'final-pre-staging-defect-regressions' }, null, 2));
